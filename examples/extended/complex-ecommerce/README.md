# Complex E-commerce System - ADD-Extended Example

## Overview
Comprehensive e-commerce system demonstrating ADD-Extended patterns for complex domains.

**Learning Goals:**
- Understand Scope Modules architecture
- See RuleSet + Checkpoint in action
- Experience Transaction Group Operators (TGO)
- Practice Coordinator Operators for sagas
- Handle cross-module communication

**Complexity:** ⭐⭐⭐⭐ Advanced
**Time to understand:** 2-3 hours

## Architecture

### Scope Modules
```
complex-ecommerce/
├── modules/
│   ├── orders/                    # Order management module
│   │   ├── boundary/
│   │   ├── core-abstractions/
│   │   │   ├── ports/
│   │   │   ├── rulesets/
│   │   │   ├── checkpoints/
│   │   │   └── events/
│   │   ├── operators/
│   │   │   ├── tgo/              # Transaction Group Operators
│   │   │   └── coordinator/      # Saga coordinators
│   │   ├── implementations/
│   │   └── shared-terms.md
│   │
│   ├── billing/                   # Payment & billing module
│   │   ├── boundary/
│   │   ├── core-abstractions/
│   │   ├── operators/
│   │   ├── implementations/
│   │   └── shared-terms.md
│   │
│   └── inventory/                 # Stock management module
│       ├── boundary/
│       ├── core-abstractions/
│       ├── operators/
│       ├── implementations/
│       └── shared-terms.md
│
├── shared/
│   ├── events/                   # Cross-module events
│   ├── types/                    # Common types
│   └── messaging/                # Event bus implementation
│
└── bootstrap/
    ├── container.ts              # Global DI configuration
    └── app.ts                    # Application startup
```

## Key ADD-Extended Features

### 1. Scope Modules
- **Self-contained**: Each module has complete ADD structure
- **Clear boundaries**: Modules communicate only via Ports and Events
- **Independent evolution**: Teams can work on different modules

### 2. RuleSet + Checkpoint
```typescript
// Example: Order validation rules
const orderValidationCheckpoint = new Checkpoint()
  .add(new CustomerEligibilityRuleSet())
  .add(new InventoryAvailabilityRuleSet())
  .add(new PaymentMethodRuleSet())
  .add(new ShippingAddressRuleSet());

const result = await orderValidationCheckpoint.run(orderData);
if (!result.passed) {
  throw new ValidationError(result.reasons);
}
```

### 3. Transaction Group Operators (TGO)
```typescript
// Order creation with transactional consistency
export class CreateOrderTGO {
  async handle(dto: CreateOrderDto): Promise<OrderCreated> {
    // Run checkpoint first
    const validationResult = await this.checkpoint.run(dto);
    if (!validationResult.passed) {
      throw new ValidationError(validationResult.reasons);
    }

    // Transactional operations
    const order = Order.create(dto);
    await this.orderRepository.save(order);

    // Emit events for other modules
    await this.eventBus.emit(new OrderCreated(order.id));

    return order;
  }
}
```

### 4. Coordinator Operators (Sagas)
```typescript
// Order fulfillment saga across modules
export class OrderFulfillmentCoordinator {
  async handle(orderCreated: OrderCreated): Promise<void> {
    try {
      // Step 1: Reserve inventory
      await this.emit(new ReserveInventory(orderCreated.orderId));

      // Step 2: Process payment
      await this.emit(new ProcessPayment(orderCreated.orderId));

      // Step 3: Arrange shipping
      await this.emit(new ArrangeShipping(orderCreated.orderId));

    } catch (error) {
      // Compensate on failure
      await this.compensate(orderCreated.orderId);
    }
  }
}
```

### 5. Cross-Module Communication
- **Core Events**: OrderCreated, PaymentProcessed, InventoryReserved
- **Translator Ports**: Convert DTOs between modules
- **Anti-corruption Layer**: Protect from external system changes

## Business Flows

### Order Creation Flow
1. **Validation**: RuleSet checks customer, inventory, payment
2. **Creation**: TGO creates order with transactional consistency
3. **Coordination**: Saga coordinates across modules
4. **Compensation**: Rollback on any failure

### Payment Processing Flow
1. **Authorization**: Validate payment method
2. **Charging**: Process payment via external gateway
3. **Reconciliation**: Update order status
4. **Notifications**: Emit events for other modules

### Inventory Management
1. **Reservation**: Hold items during order processing
2. **Allocation**: Assign specific units to orders
3. **Replenishment**: Automatic reorder when low
4. **Forecasting**: Predict demand patterns

## Running the Example

```bash
cd examples/extended/complex-ecommerce
npm install
npm run start

# Run specific scenarios
npm run demo:order-creation
npm run demo:payment-flow
npm run demo:inventory-management
```

## What You'll Learn

1. **Module Boundaries**: How to design self-contained modules
2. **Complex Validation**: Using RuleSet + Checkpoint patterns
3. **Transactional Consistency**: TGO for data integrity
4. **Saga Patterns**: Coordinator for long-running workflows
5. **Event-Driven Architecture**: Cross-module communication
6. **Compensation Logic**: Handling failures gracefully
7. **Business Rules**: Complex domain logic implementation

## Architecture Decisions

- **Why Scope Modules?** Each domain (orders, billing, inventory) has distinct lifecycle
- **Why TGO?** Order creation requires strong consistency across multiple entities
- **Why Coordinators?** Order fulfillment spans multiple modules with potential failures
- **Why RuleSets?** Business rules are complex and change frequently

This example demonstrates how ADD-Extended handles enterprise-level complexity while maintaining clean architecture principles.