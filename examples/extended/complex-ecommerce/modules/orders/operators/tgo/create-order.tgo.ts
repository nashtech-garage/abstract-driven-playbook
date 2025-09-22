// OPERATORS - Transaction Group Operator for order creation
// Ensures strong consistency and data integrity for order creation process

import { Order } from '../../core-abstractions/entities/order.entity';
import { OrderId } from '../../core-abstractions/value-objects/order-id';
import { IOrderGroupRepository } from '../../core-abstractions/ports/order-group.repository';
import { IEventBus } from '../../../shared/ports/event-bus';
import { ICustomerService } from '../../core-abstractions/ports/customer.service';
import { IInventoryService } from '../../core-abstractions/ports/inventory.service';

import { CreateOrderDto } from '../../boundary/dto/create-order.dto';
import { OrderCreatedResponseDto } from '../../boundary/dto/order-response.dto';

import { OrderValidationCheckpoint, OrderValidationContext } from '../../core-abstractions/checkpoints/order-validation.checkpoint';
import { OrderCreatedEvent, OrderValidationFailedEvent } from '../../core-abstractions/events/order.core-events';

export class CreateOrderTGO {
  constructor(
    private readonly orderGroupRepository: IOrderGroupRepository,
    private readonly eventBus: IEventBus,
    private readonly customerService: ICustomerService,
    private readonly inventoryService: IInventoryService
  ) {}

  async handle(dto: CreateOrderDto): Promise<OrderCreatedResponseDto> {
    // TGO controls the entire transaction boundary
    return await this.orderGroupRepository.executeInTransaction(async (transactionContext) => {

      // Step 1: Build validation context
      const validationContext = await this.buildValidationContext(dto);

      // Step 2: Run checkpoint validation
      const checkpoint = this.createCheckpointForOrder(dto);
      const validationResult = await checkpoint.run(validationContext);

      if (!validationResult.passed) {
        // Emit validation failure event for analytics/monitoring
        await this.eventBus.emit(new OrderValidationFailedEvent(
          dto.customerId,
          validationResult.reasons,
          validationResult.metadata,
          new Date()
        ));

        throw new OrderValidationError(
          'Order validation failed',
          validationResult.reasons,
          validationResult.metadata
        );
      }

      // Step 3: Create order entity (business logic)
      const order = Order.create(dto, validationContext.customer);

      // Step 4: Reserve inventory (within transaction)
      await this.reserveInventoryForOrder(order, transactionContext);

      // Step 5: Create order group with all related entities
      const orderGroup = await this.createOrderGroup(order, dto, transactionContext);

      // Step 6: Persist everything atomically
      await this.orderGroupRepository.saveOrderGroup(orderGroup, transactionContext);

      // Step 7: Emit success event (after successful persistence)
      await this.eventBus.emit(new OrderCreatedEvent(
        order.id.value,
        order.customerId.value,
        order.totalAmount.value,
        order.items.length,
        order.createdAt
      ));

      // Step 8: Return response DTO
      return this.mapToResponseDto(order, orderGroup);
    });
  }

  // Build comprehensive validation context
  private async buildValidationContext(dto: CreateOrderDto): Promise<OrderValidationContext> {
    // Gather all data needed for validation
    const [customer, inventoryStatus, shippingOptions] = await Promise.all([
      this.customerService.getCustomerById(dto.customerId),
      this.inventoryService.checkAvailability(dto.items),
      this.getShippingOptions(dto.shippingAddress)
    ]);

    if (!customer) {
      throw new Error(`Customer not found: ${dto.customerId}`);
    }

    return {
      orderDto: dto,
      customer: {
        id: customer.id,
        status: customer.status,
        creditLimit: customer.creditLimit,
        currentDebt: customer.currentDebt,
        accountAge: customer.accountAge,
        trustScore: customer.trustScore
      },
      inventory: inventoryStatus,
      paymentMethod: dto.paymentMethod,
      shippingOptions,
      orderMetadata: {
        source: dto.source || 'web',
        ipAddress: dto.metadata?.ipAddress,
        userAgent: dto.metadata?.userAgent,
        sessionId: dto.metadata?.sessionId
      }
    };
  }

  // Create appropriate checkpoint based on order characteristics
  private createCheckpointForOrder(dto: CreateOrderDto): OrderValidationCheckpoint {
    const orderValue = dto.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    if (orderValue > 5000) {
      return OrderValidationCheckpoint.forHighValueOrders();
    }

    if (!dto.customerId) {
      return OrderValidationCheckpoint.forGuestCheckout();
    }

    return OrderValidationCheckpoint.forStandardOrders();
  }

  // Reserve inventory within the transaction
  private async reserveInventoryForOrder(
    order: Order,
    transactionContext: any
  ): Promise<void> {
    for (const item of order.items) {
      const reserved = await this.inventoryService.reserveItem(
        item.productId.value,
        item.quantity,
        order.id.value,
        transactionContext
      );

      if (!reserved) {
        throw new InsufficientInventoryError(
          `Cannot reserve ${item.quantity} units of product ${item.productId.value}`
        );
      }
    }
  }

  // Create order group with all related entities
  private async createOrderGroup(
    order: Order,
    dto: CreateOrderDto,
    transactionContext: any
  ): Promise<OrderGroup> {
    // Order group includes: Order + OrderItems + ShippingInfo + PaymentInfo
    const orderGroup = new OrderGroup(order.id);

    // Add main order
    orderGroup.setOrder(order);

    // Add shipping information
    if (dto.shippingAddress) {
      const shippingInfo = ShippingInfo.create(
        order.id,
        dto.shippingAddress,
        dto.shippingMethod || 'standard'
      );
      orderGroup.setShippingInfo(shippingInfo);
    }

    // Add payment information (prepare for processing)
    if (dto.paymentMethod) {
      const paymentInfo = PaymentInfo.create(
        order.id,
        dto.paymentMethod,
        order.totalAmount
      );
      orderGroup.setPaymentInfo(paymentInfo);
    }

    // Add order audit trail
    const auditEntry = OrderAuditEntry.create(
      order.id,
      'order_created',
      dto.metadata?.userId || 'system',
      { checkpoint_score: await this.getLastCheckpointScore() }
    );
    orderGroup.addAuditEntry(auditEntry);

    return orderGroup;
  }

  // Map to response DTO
  private mapToResponseDto(order: Order, orderGroup: OrderGroup): OrderCreatedResponseDto {
    return {
      orderId: order.id.value,
      orderNumber: order.orderNumber.value,
      customerId: order.customerId.value,
      status: order.status.value,
      totalAmount: order.totalAmount.value,
      currency: order.currency.value,
      items: order.items.map(item => ({
        productId: item.productId.value,
        quantity: item.quantity,
        unitPrice: item.unitPrice.value,
        totalPrice: item.totalPrice.value
      })),
      shippingInfo: orderGroup.shippingInfo ? {
        address: orderGroup.shippingInfo.address,
        method: orderGroup.shippingInfo.method,
        estimatedDelivery: orderGroup.shippingInfo.estimatedDelivery?.toISOString()
      } : undefined,
      createdAt: order.createdAt.toISOString(),
      estimatedCompletionTime: this.calculateEstimatedCompletion(order)
    };
  }

  // Helper methods
  private async getShippingOptions(address: any): Promise<any> {
    // Implementation would fetch shipping options
    return { available: true, methods: ['standard', 'express'] };
  }

  private async getLastCheckpointScore(): Promise<number> {
    // Get the last checkpoint confidence score
    return 95; // Placeholder
  }

  private calculateEstimatedCompletion(order: Order): string {
    // Business logic for completion time estimation
    const baseTime = 2 * 24 * 60 * 60 * 1000; // 2 days in milliseconds
    return new Date(Date.now() + baseTime).toISOString();
  }
}

// Custom error classes
export class OrderValidationError extends Error {
  constructor(
    message: string,
    public readonly reasons: string[],
    public readonly metadata?: any
  ) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

export class InsufficientInventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientInventoryError';
  }
}

// Supporting classes (would be in separate files)
class OrderGroup {
  constructor(public readonly id: OrderId) {}
  // Implementation details...
}

class ShippingInfo {
  static create(orderId: any, address: any, method: string): ShippingInfo {
    return new ShippingInfo();
  }
  // Implementation details...
}

class PaymentInfo {
  static create(orderId: any, paymentMethod: any, amount: any): PaymentInfo {
    return new PaymentInfo();
  }
  // Implementation details...
}

class OrderAuditEntry {
  static create(orderId: any, action: string, userId: string, metadata: any): OrderAuditEntry {
    return new OrderAuditEntry();
  }
  // Implementation details...
}

/*
Key TGO principles demonstrated:

1. **Transaction Boundary Control**: TGO controls the entire transaction
   - All operations are atomic
   - Rollback on any failure
   - Consistent state guaranteed

2. **Checkpoint Integration**: Validation before any changes
   - Comprehensive rule checking
   - Business rule enforcement
   - Early failure detection

3. **Resource Coordination**: Manages multiple resources
   - Order creation
   - Inventory reservation
   - Payment preparation
   - Audit trail creation

4. **Event Emission**: Publishes events after successful completion
   - Other modules can react
   - Asynchronous side effects
   - System-wide coordination

5. **Strong Consistency**: All related data created together
   - Order + Items + Shipping + Payment
   - No partial states
   - Data integrity maintained

6. **Error Handling**: Comprehensive error scenarios
   - Validation failures
   - Inventory shortages
   - Transaction rollbacks
   - Meaningful error messages

7. **Business Logic Coordination**: Orchestrates complex workflows
   - Multi-step validation
   - Resource allocation
   - State management
   - Response generation

Usage in the system:

```typescript
// In the order controller/API layer
export class OrderController {
  async createOrder(req: Request): Promise<Response> {
    try {
      const createOrderTGO = container.resolve<CreateOrderTGO>('CreateOrderTGO');
      const result = await createOrderTGO.handle(req.body);
      return { status: 201, data: result };
    } catch (error) {
      if (error instanceof OrderValidationError) {
        return { status: 400, error: error.reasons };
      }
      throw error;
    }
  }
}
```

This pattern ensures:
- Strong consistency for complex operations
- Comprehensive validation
- Reliable error handling
- Clean separation of concerns
- Testable business logic
*/