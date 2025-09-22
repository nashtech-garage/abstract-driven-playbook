# Implementation Best Practices

## Overview
This document provides practical guidance for implementing Abstract Driven Development (ADD) effectively in real-world projects. These practices have been proven to improve code quality, maintainability, and team productivity.

## Project Setup and Structure

### 1. **Folder Organization**
Organize your project to clearly reflect the ADD layers:

```
src/
├── boundary/                    # External interfaces
│   ├── dto/                    # Data Transfer Objects
│   │   ├── requests/           # Input DTOs
│   │   ├── responses/          # Output DTOs
│   │   └── common/             # Shared DTOs
│   ├── controllers/            # HTTP/API controllers
│   ├── handlers/               # Message/Event handlers
│   ├── middleware/             # Request processing middleware
│   └── validation/             # Input validation
├── core-abstractions/          # Business core
│   ├── entities/               # Domain entities
│   ├── value-objects/          # Value objects
│   ├── ports/                  # Interface definitions
│   │   ├── repositories/       # Data access ports
│   │   ├── services/           # External service ports
│   │   └── infrastructure/     # Infrastructure ports
│   ├── events/                 # Domain events
│   └── types/                  # Shared types and enums
├── operators/                  # Business logic orchestration
│   ├── commands/               # Command handlers
│   ├── queries/                # Query handlers
│   ├── event-handlers/         # Domain event handlers
│   └── shared/                 # Shared operator utilities
├── implementations/            # Technical implementations
│   ├── repositories/           # Data access implementations
│   │   ├── postgres/           # PostgreSQL implementations
│   │   ├── mongodb/            # MongoDB implementations
│   │   └── memory/             # In-memory implementations
│   ├── services/               # External service implementations
│   │   ├── email/              # Email service implementations
│   │   ├── payment/            # Payment service implementations
│   │   └── storage/            # File storage implementations
│   ├── infrastructure/         # Infrastructure implementations
│   │   ├── event-bus/          # Event bus implementations
│   │   ├── cache/              # Cache implementations
│   │   └── logger/             # Logger implementations
│   └── external-apis/          # Third-party API clients
└── bootstrap/                  # Application startup
    ├── container.ts            # Dependency injection setup
    ├── application.ts          # Application lifecycle
    ├── config/                 # Configuration management
    └── migration/              # Database migrations
```

### 2. **Naming Conventions**
Establish consistent naming patterns:

```typescript
// Entities: PascalCase, descriptive nouns
export class User { }
export class Order { }
export class Product { }

// Value Objects: PascalCase with descriptive suffix
export class Email { }
export class Money { }
export class UserId { }
export class FullName { }

// Ports: Interface prefix + descriptive name
export interface IUserRepository { }
export interface IEmailService { }
export interface IPaymentGateway { }

// Operators: PascalCase + "Operator" suffix
export class UserOperator { }
export class OrderOperator { }
export class PaymentOperator { }

// Implementations: Technology + Entity + Type
export class PostgresUserRepository { }
export class SmtpEmailService { }
export class StripePaymentGateway { }

// DTOs: Action/Entity + "Dto" suffix
export interface CreateUserDto { }
export interface UserResponseDto { }
export interface UpdateOrderDto { }

// Events: Action + Entity + "Event" suffix
export class UserCreatedEvent { }
export class OrderConfirmedEvent { }
export class PaymentProcessedEvent { }
```

### 3. **Import Organization**
Structure imports to reflect dependencies:

```typescript
// ✅ Good import organization
// External libraries first
import { Pool } from 'pg';
import { Logger } from 'winston';

// Core abstractions (business interfaces)
import { IUserRepository } from '../core-abstractions/ports/user.repository';
import { User } from '../core-abstractions/entities/user.entity';
import { UserId } from '../core-abstractions/value-objects/user-id.vo';

// Current layer dependencies only
import { DatabaseError } from './shared/database-error';

// ❌ Bad import organization
import { PostgresOrderRepository } from '../implementations/repositories/postgres-order.repository'; // Wrong layer
import { UserController } from '../boundary/controllers/user.controller'; // Wrong layer
```

## Development Workflow

### 1. **Start with Core Abstractions**
Always begin with business concepts:

```typescript
// Step 1: Define the entity
export class User {
  constructor(
    public readonly id: UserId,
    public readonly email: Email,
    public readonly fullName: FullName,
    public readonly isActive: boolean
  ) {}

  deactivate(): User {
    return new User(this.id, this.email, this.fullName, false);
  }
}

// Step 2: Define the port
export interface IUserRepository {
  save(user: User): Promise<void>;
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
}

// Step 3: Define the operator
export class UserOperator {
  constructor(private readonly userRepository: IUserRepository) {}

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    const user = User.create(dto);
    await this.userRepository.save(user);
    return this.mapToResponseDto(user);
  }
}

// Step 4: Implement the repository
export class PostgresUserRepository implements IUserRepository {
  async save(user: User): Promise<void> {
    // Implementation details
  }
}

// Step 5: Configure dependencies
container.bind<IUserRepository>('IUserRepository')
  .to(PostgresUserRepository);
```

### 2. **Test-Driven Development Approach**
Write tests that verify business behavior:

```typescript
// Start with business logic tests
describe('User Entity', () => {
  it('should deactivate user correctly', () => {
    const user = User.create(validUserDto);
    const deactivatedUser = user.deactivate();

    expect(deactivatedUser.isActive).toBe(false);
    expect(deactivatedUser.id).toBe(user.id); // Identity preserved
  });
});

// Then test operator orchestration
describe('UserOperator', () => {
  let userOperator: UserOperator;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = createMockUserRepository();
    userOperator = new UserOperator(mockUserRepository);
  });

  it('should create user successfully', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);

    const result = await userOperator.createUser(validUserDto);

    expect(result.email).toBe(validUserDto.email);
    expect(mockUserRepository.save).toHaveBeenCalledTimes(1);
  });
});

// Finally test implementations
describe('PostgresUserRepository', () => {
  let repository: PostgresUserRepository;
  let testDb: Pool;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    repository = new PostgresUserRepository(testDb);
  });

  it('should save and retrieve user', async () => {
    const user = User.create(validUserDto);

    await repository.save(user);
    const retrieved = await repository.findById(user.id);

    expect(retrieved).toEqual(user);
  });
});
```

## Code Quality Standards

### 1. **Entity Design**
Keep entities focused on business behavior:

```typescript
// ✅ Good entity design
export class Order {
  constructor(
    public readonly id: OrderId,
    public readonly customerId: CustomerId,
    public readonly items: OrderItem[],
    public readonly status: OrderStatus,
    public readonly total: Money,
    public readonly createdAt: Date
  ) {
    this.validateBusinessRules();
  }

  // Business behavior methods
  addItem(item: OrderItem): Order {
    const newItems = [...this.items, item];
    const newTotal = this.calculateTotal(newItems);

    return new Order(
      this.id,
      this.customerId,
      newItems,
      this.status,
      newTotal,
      this.createdAt
    );
  }

  confirm(): Order {
    if (this.status !== OrderStatus.PENDING) {
      throw new Error('Only pending orders can be confirmed');
    }

    return new Order(
      this.id,
      this.customerId,
      this.items,
      OrderStatus.CONFIRMED,
      this.total,
      this.createdAt
    );
  }

  // Business query methods
  canBeCancelled(): boolean {
    return [OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(this.status);
  }

  private validateBusinessRules(): void {
    if (this.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }
  }

  private calculateTotal(items: OrderItem[]): Money {
    return items.reduce((sum, item) => sum.add(item.getSubtotal()), Money.zero());
  }
}

// ❌ Bad entity design
export class Order {
  constructor(public data: any) {} // Anemic, no behavior

  async save(): Promise<void> {
    // Infrastructure concern in entity
    await database.save(this);
  }

  toJson(): string {
    // Serialization concern in entity
    return JSON.stringify(this.data);
  }
}
```

### 2. **Value Object Implementation**
Make value objects immutable and focused:

```typescript
// ✅ Good value object
export class Money {
  private readonly _value: number;
  private readonly _currency: string;

  constructor(value: number, currency: string = 'USD') {
    this.validate(value, currency);
    this._value = Math.round(value * 100) / 100;
    this._currency = currency.toUpperCase();
  }

  get value(): number { return this._value; }
  get currency(): string { return this._currency; }

  add(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this._value + other._value, this._currency);
  }

  multiply(factor: number): Money {
    return new Money(this._value * factor, this._currency);
  }

  equals(other: Money): boolean {
    return this._value === other._value && this._currency === other._currency;
  }

  private validate(value: number, currency: string): void {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error('Amount must be a valid number');
    }
    if (!currency || currency.length !== 3) {
      throw new Error('Currency must be a 3-letter code');
    }
  }

  private ensureSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(`Cannot operate on different currencies: ${this._currency} and ${other._currency}`);
    }
  }
}

// ❌ Bad value object
export class Money {
  public value: number; // Mutable
  public currency: string; // Mutable

  constructor(value: number, currency: string) {
    this.value = value; // No validation
    this.currency = currency;
  }

  // No business behavior, just data
}
```

### 3. **Operator Implementation**
Focus on orchestration and business workflow:

```typescript
// ✅ Good operator implementation
export class OrderOperator {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly inventoryService: IInventoryService,
    private readonly paymentService: IPaymentService,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<OrderResponseDto> {
    this.logger.info('Creating order', { customerId: dto.customerId });

    try {
      // Business validation
      await this.validateOrderItems(dto.items);

      // Check inventory availability
      const availabilityResult = await this.inventoryService.checkAvailability(dto.items);
      if (!availabilityResult.allAvailable) {
        throw new BusinessError('Some items are not available');
      }

      // Create order entity
      const order = Order.create(dto);

      // Reserve inventory
      await this.inventoryService.reserveItems(order.items);

      // Save order
      await this.orderRepository.save(order);

      // Emit business event
      await this.eventBus.emit(new OrderCreatedEvent(order.id.value, order.customerId.value));

      this.logger.info('Order created successfully', { orderId: order.id.value });

      return this.mapToResponseDto(order);
    } catch (error) {
      this.logger.error('Order creation failed', { error: error.message });
      throw error;
    }
  }

  private async validateOrderItems(items: CreateOrderItemDto[]): Promise<void> {
    if (!items || items.length === 0) {
      throw new BusinessError('Order must contain at least one item');
    }

    for (const item of items) {
      if (item.quantity <= 0) {
        throw new BusinessError('Item quantity must be greater than zero');
      }
    }
  }

  private mapToResponseDto(order: Order): OrderResponseDto {
    return {
      id: order.id.value,
      customerId: order.customerId.value,
      status: order.status,
      total: order.total.value,
      currency: order.total.currency,
      items: order.items.map(item => this.mapItemToDto(item)),
      createdAt: order.createdAt.toISOString()
    };
  }
}

// ❌ Bad operator implementation
export class OrderOperator {
  async createOrder(dto: CreateOrderDto): Promise<OrderResponseDto> {
    // Direct database operations in operator
    const orderData = {
      id: uuidv4(),
      customer_id: dto.customerId,
      items: JSON.stringify(dto.items),
      total: dto.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      status: 'PENDING',
      created_at: new Date()
    };

    await this.database.query('INSERT INTO orders (...) VALUES (...)', orderData);

    // HTTP calls in operator
    await fetch('https://inventory-service.com/reserve', {
      method: 'POST',
      body: JSON.stringify({ items: dto.items })
    });

    return { id: orderData.id, ...orderData };
  }
}
```

## Error Handling Strategies

### 1. **Domain-Specific Errors**
Create meaningful business errors:

```typescript
// Business error hierarchy
export abstract class BusinessError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends BusinessError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends BusinessError {
  constructor(resource: string, identifier: string) {
    super(`${resource} with id ${identifier} not found`, 'NOT_FOUND');
  }
}

export class DuplicateError extends BusinessError {
  constructor(resource: string, field: string, value: string) {
    super(`${resource} with ${field} '${value}' already exists`, 'DUPLICATE');
  }
}

// Use in operators
export class UserOperator {
  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    const existingUser = await this.userRepository.findByEmail(new Email(dto.email));
    if (existingUser) {
      throw new DuplicateError('User', 'email', dto.email);
    }

    try {
      const user = User.create(dto);
      await this.userRepository.save(user);
      return this.mapToResponseDto(user);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error; // Re-throw business errors
      }
      throw new BusinessError('User creation failed', 'USER_CREATION_FAILED');
    }
  }
}
```

### 2. **Error Handling in Boundary Layer**
Map business errors to HTTP responses:

```typescript
// Global error handler
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof ValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
      code = exception.code;
    } else if (exception instanceof NotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
      code = exception.code;
    } else if (exception instanceof DuplicateError) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
      code = exception.code;
    } else if (exception instanceof BusinessError) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
      code = exception.code;
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString()
      }
    });
  }
}
```

## Performance Considerations

### 1. **Repository Patterns**
Implement efficient data access:

```typescript
// Bulk operations for performance
export interface IUserRepository {
  // Single operations
  save(user: User): Promise<void>;
  findById(id: UserId): Promise<User | null>;

  // Bulk operations for performance
  saveMany(users: User[]): Promise<void>;
  findByIds(ids: UserId[]): Promise<User[]>;
  findActiveUsersPaginated(page: number, pageSize: number): Promise<PaginatedResult<User>>;
}

// Implementation with optimizations
export class PostgresUserRepository implements IUserRepository {
  async saveMany(users: User[]): Promise<void> {
    if (users.length === 0) return;

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Use batch insert for better performance
      const values = users.map((user, index) => {
        const offset = index * 6;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      }).join(', ');

      const params = users.flatMap(user => [
        user.id.value,
        user.email.value,
        user.fullName.value,
        user.birthDate,
        user.isActive,
        user.createdAt
      ]);

      const query = `
        INSERT INTO users (id, email, full_name, birth_date, is_active, created_at)
        VALUES ${values}
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          is_active = EXCLUDED.is_active
      `;

      await client.query(query, params);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new DatabaseError('Failed to save users', error);
    } finally {
      client.release();
    }
  }

  async findActiveUsersPaginated(page: number, pageSize: number): Promise<PaginatedResult<User>> {
    const offset = (page - 1) * pageSize;

    // Use single query with window function for pagination
    const query = `
      SELECT *,
             COUNT(*) OVER() as total_count
      FROM users
      WHERE is_active = true AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await this.db.query(query, [pageSize, offset]);
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    return {
      items: result.rows.map(row => this.mapRowToUser(row)),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNext: (page * pageSize) < totalCount
      }
    };
  }
}
```

### 2. **Caching Strategies**
Implement caching at the right level:

```typescript
// Cache decorator for repositories
export class CachedUserRepository implements IUserRepository {
  constructor(
    private readonly baseRepository: IUserRepository,
    private readonly cache: ICache,
    private readonly logger: ILogger
  ) {}

  async findById(id: UserId): Promise<User | null> {
    const cacheKey = `user:${id.value}`;

    try {
      // Try cache first
      const cached = await this.cache.get<User>(cacheKey);
      if (cached) {
        this.logger.debug('Cache hit', { userId: id.value });
        return cached;
      }

      // Fallback to repository
      const user = await this.baseRepository.findById(id);
      if (user) {
        await this.cache.set(cacheKey, user, { ttl: 300 }); // 5 minutes
      }

      return user;
    } catch (cacheError) {
      this.logger.warn('Cache error, falling back to repository', {
        userId: id.value,
        error: cacheError.message
      });
      return await this.baseRepository.findById(id);
    }
  }

  async save(user: User): Promise<void> {
    await this.baseRepository.save(user);

    // Invalidate cache after save
    const cacheKey = `user:${user.id.value}`;
    try {
      await this.cache.delete(cacheKey);
    } catch (cacheError) {
      this.logger.warn('Failed to invalidate cache', {
        userId: user.id.value,
        error: cacheError.message
      });
    }
  }
}
```

## Monitoring and Observability

### 1. **Logging Standards**
Implement structured logging:

```typescript
export class UserOperator {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly logger: ILogger
  ) {}

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    const correlationId = generateCorrelationId();

    this.logger.info('User creation started', {
      correlationId,
      email: dto.email,
      operation: 'createUser'
    });

    try {
      const user = User.create(dto);
      await this.userRepository.save(user);

      this.logger.info('User created successfully', {
        correlationId,
        userId: user.id.value,
        operation: 'createUser'
      });

      return this.mapToResponseDto(user);
    } catch (error) {
      this.logger.error('User creation failed', {
        correlationId,
        email: dto.email,
        operation: 'createUser',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}
```

### 2. **Metrics Collection**
Add metrics to operators:

```typescript
// Metrics decorator
export class MetricsUserOperator implements IUserOperator {
  constructor(
    private readonly baseOperator: UserOperator,
    private readonly metrics: IMetrics
  ) {}

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    const timer = this.metrics.startTimer('user_creation_duration');
    const counter = this.metrics.getCounter('user_creation_attempts');

    try {
      counter.inc();
      const result = await this.baseOperator.createUser(dto);
      this.metrics.getCounter('user_creation_success').inc();
      return result;
    } catch (error) {
      this.metrics.getCounter('user_creation_failures').inc({
        error_type: error.constructor.name
      });
      throw error;
    } finally {
      timer.end();
    }
  }
}
```

## Migration and Evolution

### 1. **Database Migrations**
Structure migrations for ADD:

```sql
-- Migration: 001_create_users_table.sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    birth_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP,

    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_birth_date_check CHECK (birth_date <= CURRENT_DATE)
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active ON users(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_created_at ON users(created_at) WHERE deleted_at IS NULL;
```

### 2. **API Versioning**
Handle API evolution:

```typescript
// Version-specific DTOs
export namespace V1 {
  export interface CreateUserDto {
    email: string;
    name: string; // Simple name in v1
  }

  export interface UserResponseDto {
    id: string;
    email: string;
    name: string;
    active: boolean;
  }
}

export namespace V2 {
  export interface CreateUserDto {
    email: string;
    fullName: string; // Changed to fullName in v2
    birthDate: string; // Added birth date
    preferences?: UserPreferencesDto; // Added preferences
  }

  export interface UserResponseDto {
    id: string;
    email: string;
    fullName: string;
    isActive: boolean;
    createdAt: string;
    preferences?: UserPreferencesDto;
  }
}

// Version adapters
export class UserVersionAdapter {
  static convertV1ToV2(v1Dto: V1.CreateUserDto): V2.CreateUserDto {
    return {
      email: v1Dto.email,
      fullName: v1Dto.name,
      birthDate: new Date().toISOString(), // Default for v1
      preferences: undefined
    };
  }

  static convertV2ToV1(v2Response: V2.UserResponseDto): V1.UserResponseDto {
    return {
      id: v2Response.id,
      email: v2Response.email,
      name: v2Response.fullName,
      active: v2Response.isActive
    };
  }
}
```

These best practices ensure your ADD implementation is robust, maintainable, and scalable while preserving the architectural benefits that ADD provides.