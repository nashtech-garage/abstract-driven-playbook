# Transaction Group Operators (TGO) Pattern

## Intent
Coordinate multiple business operations as a single atomic unit, ensuring either all operations succeed or all are rolled back while maintaining clear separation of concerns.

## Problem
- Complex business operations span multiple aggregates or bounded contexts
- Need transactional consistency across multiple operations
- Individual operators should remain focused on single responsibilities
- Error handling and rollback logic becomes scattered
- Difficult to test complex multi-step business processes

## Solution
Create specialized Transaction Group Operators that orchestrate multiple atomic operations, manage transaction boundaries, and handle rollback scenarios while keeping individual operators simple.

## Structure

```mermaid
graph TB
    subgraph "Boundary"
        Controller[Controller]
    end

    subgraph "Operators"
        TGO[Transaction Group Operator]
        UserOp[User Operator]
        OrderOp[Order Operator]
        PaymentOp[Payment Operator]
        InventoryOp[Inventory Operator]
    end

    subgraph "Core Abstractions"
        subgraph "Ports"
            UserRepo[IUserRepository]
            OrderRepo[IOrderRepository]
            PaymentPort[IPaymentService]
            InventoryRepo[IInventoryRepository]
            UnitOfWork[IUnitOfWork]
        end
    end

    subgraph "Implementations"
        DBUserRepo[PostgresUserRepository]
        DBOrderRepo[PostgresOrderRepository]
        PaymentGateway[StripePaymentService]
        DBInventoryRepo[PostgresInventoryRepository]
        TransactionManager[PostgresUnitOfWork]
    end

    Controller --> TGO
    TGO --> UserOp
    TGO --> OrderOp
    TGO --> PaymentOp
    TGO --> InventoryOp
    TGO --> UnitOfWork

    UserOp --> UserRepo
    OrderOp --> OrderRepo
    PaymentOp --> PaymentPort
    InventoryOp --> InventoryRepo

    UserRepo <|.. DBUserRepo
    OrderRepo <|.. DBOrderRepo
    PaymentPort <|.. PaymentGateway
    InventoryRepo <|.. DBInventoryRepo
    UnitOfWork <|.. TransactionManager

    style TGO fill:#e1f5fe,stroke:#0277bd,stroke-width:3px
    style UnitOfWork fill:#fff7ed,stroke:#c2410c,stroke-width:2px
```

## Implementation

### 1. Unit of Work Port (Core Abstractions)
```typescript
// core-abstractions/ports/unit-of-work.port.ts
export interface IUnitOfWork {
  // Transaction management
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;

  // Resource management
  addResource(key: string, resource: any): void;
  getResource<T>(key: string): T | null;

  // Cleanup
  dispose(): Promise<void>;
}

// Compensation action for rollback scenarios
export interface CompensationAction {
  execute(): Promise<void>;
  description: string;
}

export interface TransactionContext {
  readonly id: string;
  readonly startedAt: Date;
  readonly resources: Map<string, any>;
  readonly compensations: CompensationAction[];
}
```

### 2. Individual Atomic Operators
```typescript
// operators/user.operator.ts
export class UserOperator {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventBus: IEventBus
  ) {}

  // Atomic operation - can be part of larger transaction
  async createUser(dto: CreateUserDto, context?: TransactionContext): Promise<User> {
    // Validate business rules
    const existingUser = await this.userRepository.findByEmail(new Email(dto.email));
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Create user entity
    const user = User.create(dto);

    // Save user
    await this.userRepository.save(user);

    // Add compensation action if in transaction
    if (context) {
      context.compensations.push({
        description: `Delete user ${user.id.value}`,
        execute: async () => {
          await this.userRepository.delete(user.id);
        }
      });
    }

    // Emit event (will be part of transaction)
    await this.eventBus.emit(new UserCreatedEvent(user.id.value));

    return user;
  }

  async upgradeToVip(userId: UserId, context?: TransactionContext): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const originalStatus = user.membershipStatus;
    const vipUser = user.upgradeToVip();

    await this.userRepository.save(vipUser);

    // Add compensation
    if (context) {
      context.compensations.push({
        description: `Revert VIP upgrade for user ${userId.value}`,
        execute: async () => {
          const userToRevert = user.changeStatus(originalStatus);
          await this.userRepository.save(userToRevert);
        }
      });
    }

    await this.eventBus.emit(new UserUpgradedToVipEvent(userId.value));

    return vipUser;
  }
}

// operators/order.operator.ts
export class OrderOperator {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly eventBus: IEventBus
  ) {}

  async createOrder(dto: CreateOrderDto, context?: TransactionContext): Promise<Order> {
    const order = Order.create(dto);

    await this.orderRepository.save(order);

    if (context) {
      context.compensations.push({
        description: `Cancel order ${order.id.value}`,
        execute: async () => {
          const cancelledOrder = order.cancel();
          await this.orderRepository.save(cancelledOrder);
        }
      });
    }

    await this.eventBus.emit(new OrderCreatedEvent(order.id.value, order.customerId.value));

    return order;
  }
}

// operators/payment.operator.ts
export class PaymentOperator {
  constructor(
    private readonly paymentService: IPaymentService,
    private readonly eventBus: IEventBus
  ) {}

  async processPayment(dto: ProcessPaymentDto, context?: TransactionContext): Promise<PaymentResult> {
    const result = await this.paymentService.chargeCustomer(
      dto.customerId,
      dto.amount
    );

    if (!result.success) {
      throw new Error(`Payment failed: ${result.errorMessage}`);
    }

    if (context) {
      context.compensations.push({
        description: `Refund payment ${result.paymentId}`,
        execute: async () => {
          await this.paymentService.refundPayment(result.paymentId, dto.amount);
        }
      });
    }

    await this.eventBus.emit(new PaymentProcessedEvent(result.paymentId, dto.amount.value));

    return result;
  }
}
```

### 3. Transaction Group Operator Implementation
```typescript
// operators/order-fulfillment.tgo.ts
export class OrderFulfillmentTGO {
  constructor(
    private readonly userOperator: UserOperator,
    private readonly orderOperator: OrderOperator,
    private readonly paymentOperator: PaymentOperator,
    private readonly inventoryOperator: InventoryOperator,
    private readonly unitOfWork: IUnitOfWork,
    private readonly eventBus: IEventBus
  ) {}

  async fulfillFirstTimeOrder(dto: FulfillFirstTimeOrderDto): Promise<OrderFulfillmentResult> {
    const transactionId = `tgo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Begin transaction
      await this.unitOfWork.begin();

      const context: TransactionContext = {
        id: transactionId,
        startedAt: new Date(),
        resources: new Map(),
        compensations: []
      };

      // Step 1: Create user account
      const user = await this.userOperator.createUser({
        email: dto.email,
        fullName: dto.fullName,
        birthDate: dto.birthDate
      }, context);

      context.resources.set('user', user);

      // Step 2: Check inventory and reserve items
      await this.inventoryOperator.reserveItems(dto.orderItems, context);

      // Step 3: Create order
      const order = await this.orderOperator.createOrder({
        customerId: user.id.value,
        items: dto.orderItems,
        shippingAddress: dto.shippingAddress
      }, context);

      context.resources.set('order', order);

      // Step 4: Process payment
      const paymentResult = await this.paymentOperator.processPayment({
        customerId: user.id,
        amount: order.total,
        paymentMethod: dto.paymentMethod
      }, context);

      context.resources.set('payment', paymentResult);

      // Step 5: If order value is high, upgrade to VIP
      if (order.total.value >= 1000) {
        const vipUser = await this.userOperator.upgradeToVip(user.id, context);
        context.resources.set('vipUser', vipUser);
      }

      // Step 6: Confirm inventory reservation
      await this.inventoryOperator.confirmReservation(dto.orderItems, context);

      // All operations succeeded - commit transaction
      await this.unitOfWork.commit();

      // Emit success event
      await this.eventBus.emit(new OrderFulfillmentCompletedEvent(
        transactionId,
        user.id.value,
        order.id.value,
        paymentResult.paymentId,
        new Date()
      ));

      return {
        success: true,
        transactionId,
        user,
        order,
        paymentResult,
        message: 'Order fulfilled successfully'
      };

    } catch (error) {
      // Rollback transaction
      await this.rollbackTransaction(transactionId, error as Error);

      throw new Error(`Order fulfillment failed: ${error.message}`);
    } finally {
      await this.unitOfWork.dispose();
    }
  }

  private async rollbackTransaction(transactionId: string, error: Error): Promise<void> {
    try {
      // Database rollback
      await this.unitOfWork.rollback();

      // Execute compensation actions in reverse order
      const context = this.unitOfWork.getResource<TransactionContext>('context');
      if (context) {
        const compensations = [...context.compensations].reverse();

        for (const compensation of compensations) {
          try {
            await compensation.execute();
          } catch (compensationError) {
            // Log compensation failure but continue with others
            console.error(`Compensation failed: ${compensation.description}`, compensationError);
          }
        }
      }

      // Emit rollback event
      await this.eventBus.emit(new OrderFulfillmentFailedEvent(
        transactionId,
        error.message,
        new Date()
      ));

    } catch (rollbackError) {
      // Log critical rollback failure
      console.error(`Critical: Rollback failed for transaction ${transactionId}`, rollbackError);

      // Emit critical failure event for manual intervention
      await this.eventBus.emit(new CriticalTransactionFailureEvent(
        transactionId,
        error.message,
        rollbackError.message,
        new Date()
      ));
    }
  }
}
```

### 4. Complex Business Process TGO
```typescript
// operators/subscription-migration.tgo.ts
export class SubscriptionMigrationTGO {
  constructor(
    private readonly userOperator: UserOperator,
    private readonly subscriptionOperator: SubscriptionOperator,
    private readonly billingOperator: BillingOperator,
    private readonly notificationOperator: NotificationOperator,
    private readonly unitOfWork: IUnitOfWork
  ) {}

  async migrateUserSubscription(dto: MigrateSubscriptionDto): Promise<MigrationResult> {
    const transactionId = `migration-${dto.userId}-${Date.now()}`;

    try {
      await this.unitOfWork.begin();

      const context: TransactionContext = {
        id: transactionId,
        startedAt: new Date(),
        resources: new Map(),
        compensations: []
      };

      // Step 1: Validate current subscription
      const currentSubscription = await this.subscriptionOperator.getCurrentSubscription(
        UserId.fromString(dto.userId),
        context
      );

      if (!currentSubscription.canMigrateTo(dto.newPlanId)) {
        throw new Error(`Cannot migrate from ${currentSubscription.planId} to ${dto.newPlanId}`);
      }

      context.resources.set('originalSubscription', currentSubscription);

      // Step 2: Calculate prorated billing
      const billingAdjustment = await this.billingOperator.calculateMigrationAdjustment(
        currentSubscription,
        dto.newPlanId,
        context
      );

      context.resources.set('billingAdjustment', billingAdjustment);

      // Step 3: Process any required payment/refund
      if (billingAdjustment.amount.value !== 0) {
        await this.billingOperator.processAdjustment(billingAdjustment, context);
      }

      // Step 4: Create new subscription
      const newSubscription = await this.subscriptionOperator.createSubscription({
        userId: dto.userId,
        planId: dto.newPlanId,
        startDate: dto.migrationDate || new Date(),
        billingCycle: dto.billingCycle
      }, context);

      // Step 5: Deactivate old subscription
      await this.subscriptionOperator.deactivateSubscription(
        currentSubscription.id,
        'MIGRATED',
        context
      );

      // Step 6: Update user profile with new subscription features
      await this.userOperator.updateSubscriptionFeatures(
        UserId.fromString(dto.userId),
        newSubscription.features,
        context
      );

      // Step 7: Send migration confirmation
      await this.notificationOperator.sendMigrationConfirmation(
        UserId.fromString(dto.userId),
        {
          oldPlan: currentSubscription.planId,
          newPlan: newSubscription.planId,
          effectiveDate: newSubscription.startDate,
          billingAdjustment
        },
        context
      );

      await this.unitOfWork.commit();

      return {
        success: true,
        transactionId,
        oldSubscription: currentSubscription,
        newSubscription,
        billingAdjustment,
        effectiveDate: newSubscription.startDate
      };

    } catch (error) {
      await this.rollbackMigration(transactionId, error as Error);
      throw error;
    } finally {
      await this.unitOfWork.dispose();
    }
  }

  private async rollbackMigration(transactionId: string, error: Error): Promise<void> {
    // Similar rollback logic with migration-specific compensation actions
    await this.unitOfWork.rollback();

    // Execute compensations and emit appropriate events
    // ... rollback implementation
  }
}
```

### 5. Unit of Work Implementation
```typescript
// implementations/transaction/postgres-unit-of-work.ts
export class PostgresUnitOfWork implements IUnitOfWork {
  private transaction: any = null;
  private resources = new Map<string, any>();
  private isActive = false;

  constructor(private readonly dbConnection: Pool) {}

  async begin(): Promise<void> {
    if (this.isActive) {
      throw new Error('Transaction already active');
    }

    this.transaction = await this.dbConnection.connect();
    await this.transaction.query('BEGIN');
    this.isActive = true;
  }

  async commit(): Promise<void> {
    if (!this.isActive || !this.transaction) {
      throw new Error('No active transaction');
    }

    await this.transaction.query('COMMIT');
    this.isActive = false;
  }

  async rollback(): Promise<void> {
    if (!this.isActive || !this.transaction) {
      return; // Already rolled back or not started
    }

    try {
      await this.transaction.query('ROLLBACK');
    } finally {
      this.isActive = false;
    }
  }

  addResource(key: string, resource: any): void {
    this.resources.set(key, resource);
  }

  getResource<T>(key: string): T | null {
    return this.resources.get(key) || null;
  }

  async dispose(): Promise<void> {
    if (this.transaction) {
      this.transaction.release();
      this.transaction = null;
    }
    this.resources.clear();
    this.isActive = false;
  }
}
```

## Key Principles

### 1. **Orchestration vs Choreography**
- TGOs orchestrate (centralized control)
- Individual operators remain focused (single responsibility)
- Clear transaction boundaries

### 2. **Compensation-Based Rollback**
- Each operation registers compensation actions
- Rollback executes compensations in reverse order
- Graceful handling of partial failures

### 3. **Context Sharing**
- Transaction context carries state between operations
- Resources accessible throughout transaction
- Compensation actions reference context

### 4. **Atomic Operations**
- Individual operators can work standalone or in transactions
- No operator depends on transaction context
- Clean separation of concerns

## Benefits

1. **Transactional Consistency**: Complex business processes maintain ACID properties
2. **Maintainable Code**: Individual operators remain simple and focused
3. **Testable Logic**: Can test individual operators and TGOs separately
4. **Flexible Composition**: Reuse operators in different transaction groups
5. **Error Recovery**: Systematic rollback and compensation handling
6. **Monitoring**: Clear transaction boundaries for observability

## Anti-Patterns

### ❌ God TGO
```typescript
// DON'T: TGO doing everything instead of delegating
class OrderProcessingTGO {
  async processOrder(dto: OrderDto): Promise<void> {
    // Doing user creation logic here
    const user = new User(dto.userEmail);
    await this.userRepo.save(user);

    // Doing payment logic here
    const payment = await this.stripe.charge(dto.amount);

    // All business logic in TGO instead of delegating
  }
}
```

### ❌ Nested Transactions
```typescript
// DON'T: TGO calling another TGO
class OrderTGO {
  async processOrder(): Promise<void> {
    await this.unitOfWork.begin();
    // ...
    await this.anotherTGO.doSomething(); // Creates nested transaction
  }
}
```

### ❌ Long-Running Transactions
```typescript
// DON'T: Keep transactions open for extended periods
class BatchProcessingTGO {
  async processBatch(): Promise<void> {
    await this.unitOfWork.begin();

    for (let i = 0; i < 10000; i++) {
      await this.processItem(items[i]); // Very long transaction
    }

    await this.unitOfWork.commit();
  }
}
```

## Best Practices

1. **Keep Transactions Short**: Minimize transaction duration
2. **Clear Boundaries**: Define exact start/end of transactions
3. **Comprehensive Rollback**: Always implement compensation actions
4. **Error Handling**: Proper error propagation and logging
5. **Resource Management**: Clean up resources in finally blocks
6. **Testing Strategy**: Test happy path, error scenarios, and rollback
7. **Monitoring**: Track transaction success/failure rates
8. **Documentation**: Document transaction boundaries and compensation logic

This pattern enables complex business processes while maintaining the simplicity and testability of individual operators.