# Exercise 1: Layer Classification

## Objective
Practice identifying which ADD layer each piece of code belongs to.

## Instructions
For each code snippet below, identify which ADD layer it belongs to:
- **Boundary** (B)
- **Core Abstractions** (CA)
- **Operators** (O)
- **Implementations** (I)
- **Bootstrap** (BS)

## Code Snippets

### 1.
```typescript
export interface CreateOrderDto {
  customerId: string;
  items: OrderItemDto[];
  shippingAddress: string;
}
```
**Answer:** ____

### 2.
```typescript
export class Order {
  constructor(
    public readonly id: OrderId,
    public readonly customerId: CustomerId,
    public readonly items: OrderItem[],
    public readonly status: OrderStatus
  ) {}
}
```
**Answer:** ____

### 3.
```typescript
export interface IOrderRepository {
  save(order: Order): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
}
```
**Answer:** ____

### 4.
```typescript
export class OrderOperator {
  constructor(private orderRepo: IOrderRepository) {}

  async createOrder(dto: CreateOrderDto): Promise<OrderResponseDto> {
    const order = Order.create(dto);
    await this.orderRepo.save(order);
    return this.mapToDto(order);
  }
}
```
**Answer:** ____

### 5.
```typescript
export class PostgresOrderRepository implements IOrderRepository {
  async save(order: Order): Promise<void> {
    await this.db.query('INSERT INTO orders...', [order.id.value]);
  }
}
```
**Answer:** ____

### 6.
```typescript
container.bind('IOrderRepository').to(PostgresOrderRepository);
container.bind('OrderOperator').to(OrderOperator);
```
**Answer:** ____

### 7.
```typescript
export class OrderCreatedEvent {
  constructor(public readonly orderId: string) {}
}
```
**Answer:** ____

### 8.
```typescript
export class EmailService implements IEmailService {
  async sendOrderConfirmation(email: string, orderId: string): Promise<void> {
    await this.smtpClient.send({
      to: email,
      subject: `Order ${orderId} confirmed`,
      body: 'Thank you for your order!'
    });
  }
}
```
**Answer:** ____

## Answer Key
1. **B** - DTO for external API contract
2. **CA** - Entity representing core business concept
3. **CA** - Port (interface) for repository abstraction
4. **O** - Business orchestration and DTO mapping
5. **I** - Concrete implementation of repository port
6. **BS** - Dependency injection configuration
7. **CA** - Core event for internal communication (could be B if boundary event)
8. **I** - Concrete implementation of email service port

## Discussion Points
- Why does the OrderOperator depend on IOrderRepository interface rather than PostgresOrderRepository directly?
- What would happen if we put business logic in the PostgresOrderRepository?
- How does this structure help with testing?
- What changes when we want to switch from Postgres to MongoDB?