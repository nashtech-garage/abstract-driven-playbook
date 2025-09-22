# Core Abstractions Guidelines

## Purpose
The Core Abstractions layer defines the business domain concepts, rules, and contracts. This is the heart of your application where business knowledge is captured and expressed through entities, value objects, ports, and domain events.

## Core Responsibilities

### 1. **Business Entities**
- Domain objects with business behavior
- Business rules and invariants
- Entity lifecycle management
- Domain-specific validation

### 2. **Value Objects**
- Immutable business concepts
- Type safety for business data
- Domain-specific formatting and validation

### 3. **Ports (Interfaces)**
- Define contracts for external dependencies
- Express business needs, not technical solutions
- Abstract business operations

### 4. **Domain Events**
- Capture business-significant occurrences
- Enable loose coupling between business processes
- Provide audit trail and integration points

## Implementation Guidelines

### ✅ What Belongs in Core Abstractions

#### Entities - Business Objects with Identity
```typescript
// User entity with business behavior
export class User {
  constructor(
    public readonly id: UserId,
    public readonly email: Email,
    public readonly fullName: FullName,
    public readonly birthDate: Date,
    public readonly preferences: UserPreferences,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly lastLoginAt: Date | null
  ) {
    // Business invariant validation
    this.validateBusinessRules();
  }

  // Factory method for creation
  static create(dto: CreateUserDto): User {
    const user = new User(
      UserId.generate(),
      new Email(dto.email),
      FullName.fromString(dto.fullName),
      new Date(dto.birthDate),
      UserPreferences.fromDto(dto.preferences),
      true, // New users are active by default
      new Date(),
      null // Never logged in
    );

    return user;
  }

  // Business behavior methods
  updateEmail(newEmail: Email): User {
    // Business rule: Email change requires validation
    if (this.email.equals(newEmail)) {
      throw new Error('New email must be different from current email');
    }

    return new User(
      this.id,
      newEmail,
      this.fullName,
      this.birthDate,
      this.preferences,
      this.isActive,
      this.createdAt,
      this.lastLoginAt
    );
  }

  deactivate(reason: DeactivationReason): User {
    // Business rule: Cannot deactivate already inactive user
    if (!this.isActive) {
      throw new Error('User is already deactivated');
    }

    return new User(
      this.id,
      this.email,
      this.fullName,
      this.birthDate,
      this.preferences,
      false,
      this.createdAt,
      this.lastLoginAt
    );
  }

  recordLogin(): User {
    return new User(
      this.id,
      this.email,
      this.fullName,
      this.birthDate,
      this.preferences,
      this.isActive,
      this.createdAt,
      new Date()
    );
  }

  updatePreferences(newPreferences: UserPreferences): User {
    return new User(
      this.id,
      this.email,
      this.fullName,
      this.birthDate,
      newPreferences,
      this.isActive,
      this.createdAt,
      this.lastLoginAt
    );
  }

  // Business query methods
  isEligibleForVipStatus(): boolean {
    const daysSinceRegistration = this.getDaysSinceRegistration();
    const hasRecentActivity = this.hasRecentActivity();

    return daysSinceRegistration > 30 && hasRecentActivity && this.isActive;
  }

  canReceiveNotifications(): boolean {
    return this.isActive && this.preferences.allowNotifications;
  }

  getAge(): number {
    const today = new Date();
    const birthYear = this.birthDate.getFullYear();
    const currentYear = today.getFullYear();

    let age = currentYear - birthYear;

    // Adjust if birthday hasn't occurred this year
    const monthDiff = today.getMonth() - this.birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < this.birthDate.getDate())) {
      age--;
    }

    return age;
  }

  // Private business rule validation
  private validateBusinessRules(): void {
    this.validateAge();
    this.validateEmailDomain();
  }

  private validateAge(): void {
    const age = this.getAge();
    if (age < 13) {
      throw new Error('Users must be at least 13 years old');
    }
    if (age > 120) {
      throw new Error('Invalid birth date: age cannot exceed 120 years');
    }
  }

  private validateEmailDomain(): void {
    const domain = this.email.domain;
    const blockedDomains = ['tempmail.com', 'throwaway.email'];

    if (blockedDomains.includes(domain)) {
      throw new Error(`Email domain '${domain}' is not allowed`);
    }
  }

  private getDaysSinceRegistration(): number {
    const today = new Date();
    const timeDiff = today.getTime() - this.createdAt.getTime();
    return Math.floor(timeDiff / (1000 * 3600 * 24));
  }

  private hasRecentActivity(): boolean {
    if (!this.lastLoginAt) return false;

    const daysSinceLastLogin = Math.floor(
      (Date.now() - this.lastLoginAt.getTime()) / (1000 * 3600 * 24)
    );

    return daysSinceLastLogin <= 7; // Active within last week
  }
}

// Order entity with complex business logic
export class Order {
  constructor(
    public readonly id: OrderId,
    public readonly customerId: CustomerId,
    public readonly items: OrderItem[],
    public readonly status: OrderStatus,
    public readonly total: Money,
    public readonly shippingAddress: Address,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {
    this.validateBusinessRules();
  }

  static create(dto: CreateOrderDto): Order {
    const items = dto.items.map(item => OrderItem.fromDto(item));
    const total = Order.calculateTotal(items);

    return new Order(
      OrderId.generate(),
      CustomerId.fromString(dto.customerId),
      items,
      OrderStatus.PENDING,
      total,
      Address.fromDto(dto.shippingAddress),
      new Date(),
      new Date()
    );
  }

  // Business state transitions
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
      this.shippingAddress,
      this.createdAt,
      new Date()
    );
  }

  ship(trackingNumber: string): Order {
    if (this.status !== OrderStatus.CONFIRMED) {
      throw new Error('Only confirmed orders can be shipped');
    }

    return new Order(
      this.id,
      this.customerId,
      this.items,
      OrderStatus.SHIPPED,
      this.total,
      this.shippingAddress,
      this.createdAt,
      new Date()
    );
  }

  cancel(reason: CancellationReason): Order {
    if (!this.canBeCancelled()) {
      throw new Error('Order cannot be cancelled in current status');
    }

    return new Order(
      this.id,
      this.customerId,
      this.items,
      OrderStatus.CANCELLED,
      this.total,
      this.shippingAddress,
      this.createdAt,
      new Date()
    );
  }

  // Business query methods
  canBeCancelled(): boolean {
    return this.status === OrderStatus.PENDING || this.status === OrderStatus.CONFIRMED;
  }

  requiresExpeditedShipping(): boolean {
    const urgentItems = this.items.filter(item => item.isUrgent());
    return urgentItems.length > 0;
  }

  calculateTax(taxRate: number): Money {
    return this.total.multiply(taxRate);
  }

  // Static business calculations
  private static calculateTotal(items: OrderItem[]): Money {
    return items.reduce(
      (total, item) => total.add(item.getSubtotal()),
      Money.zero()
    );
  }

  private validateBusinessRules(): void {
    if (this.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    if (this.total.value <= 0) {
      throw new Error('Order total must be greater than zero');
    }
  }
}
```

#### Value Objects - Immutable Business Concepts
```typescript
// Email value object with business rules
export class Email {
  private readonly _value: string;

  constructor(value: string) {
    this.validate(value);
    this._value = value.toLowerCase().trim();
  }

  get value(): string {
    return this._value;
  }

  get domain(): string {
    return this._value.split('@')[1];
  }

  get localPart(): string {
    return this._value.split('@')[0];
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  // Business validation
  private validate(value: string): void {
    if (!value || typeof value !== 'string') {
      throw new Error('Email is required');
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error('Email cannot be empty');
    }

    if (trimmed.length > 254) { // RFC 5321 limit
      throw new Error('Email is too long');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new Error('Invalid email format');
    }

    // Business rule: No temporary email domains
    const domain = trimmed.split('@')[1];
    const tempDomains = ['10minutemail.com', 'tempmail.org', 'guerrillamail.com'];
    if (tempDomains.includes(domain)) {
      throw new Error('Temporary email addresses are not allowed');
    }
  }
}

// Money value object with business arithmetic
export class Money {
  private readonly _value: number;
  private readonly _currency: string;

  constructor(value: number, currency: string = 'USD') {
    this.validate(value, currency);
    this._value = Math.round(value * 100) / 100; // Round to 2 decimal places
    this._currency = currency.toUpperCase();
  }

  static zero(currency: string = 'USD'): Money {
    return new Money(0, currency);
  }

  static fromCents(cents: number, currency: string = 'USD'): Money {
    return new Money(cents / 100, currency);
  }

  get value(): number {
    return this._value;
  }

  get currency(): string {
    return this._currency;
  }

  get cents(): number {
    return Math.round(this._value * 100);
  }

  // Business operations
  add(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this._value + other._value, this._currency);
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this._value - other._value, this._currency);
  }

  multiply(factor: number): Money {
    if (typeof factor !== 'number' || isNaN(factor)) {
      throw new Error('Factor must be a valid number');
    }
    return new Money(this._value * factor, this._currency);
  }

  divide(divisor: number): Money {
    if (typeof divisor !== 'number' || isNaN(divisor) || divisor === 0) {
      throw new Error('Divisor must be a valid non-zero number');
    }
    return new Money(this._value / divisor, this._currency);
  }

  // Business comparisons
  equals(other: Money): boolean {
    return this._value === other._value && this._currency === other._currency;
  }

  isGreaterThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._value > other._value;
  }

  isLessThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._value < other._value;
  }

  isZero(): boolean {
    return this._value === 0;
  }

  isPositive(): boolean {
    return this._value > 0;
  }

  isNegative(): boolean {
    return this._value < 0;
  }

  // Business formatting
  format(locale: string = 'en-US'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this._currency
    }).format(this._value);
  }

  toString(): string {
    return `${this._value} ${this._currency}`;
  }

  private validate(value: number, currency: string): void {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error('Amount must be a valid number');
    }

    if (!Number.isFinite(value)) {
      throw new Error('Amount must be finite');
    }

    if (!currency || typeof currency !== 'string') {
      throw new Error('Currency is required');
    }

    if (currency.length !== 3) {
      throw new Error('Currency must be a 3-letter code');
    }
  }

  private ensureSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(`Cannot operate on different currencies: ${this._currency} and ${other._currency}`);
    }
  }
}

// FullName value object with business formatting
export class FullName {
  private readonly _value: string;

  constructor(value: string) {
    this.validate(value);
    this._value = this.format(value);
  }

  static fromParts(firstName: string, lastName: string, middleName?: string): FullName {
    const parts = [firstName, middleName, lastName].filter(Boolean);
    return new FullName(parts.join(' '));
  }

  static fromString(value: string): FullName {
    return new FullName(value);
  }

  get value(): string {
    return this._value;
  }

  get firstName(): string {
    return this._value.split(' ')[0];
  }

  get lastName(): string {
    const parts = this._value.split(' ');
    return parts[parts.length - 1];
  }

  get initials(): string {
    return this._value
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }

  equals(other: FullName): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  private validate(value: string): void {
    if (!value || typeof value !== 'string') {
      throw new Error('Full name is required');
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error('Full name cannot be empty');
    }

    if (trimmed.length < 2) {
      throw new Error('Full name must be at least 2 characters');
    }

    if (trimmed.length > 100) {
      throw new Error('Full name is too long');
    }

    // Business rule: Only letters, spaces, hyphens, and apostrophes
    const nameRegex = /^[a-zA-Z\s\-']+$/;
    if (!nameRegex.test(trimmed)) {
      throw new Error('Full name contains invalid characters');
    }
  }

  private format(value: string): string {
    return value
      .trim()
      .split(/\s+/) // Split on any whitespace
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
}
```

#### Ports - Business Interface Contracts
```typescript
// Repository ports - Define business data needs
export interface IUserRepository {
  // Basic CRUD operations
  save(user: User): Promise<void>;
  findById(id: UserId): Promise<User | null>;
  delete(id: UserId): Promise<void>;

  // Business-specific queries
  findByEmail(email: Email): Promise<User | null>;
  findActiveUsers(): Promise<User[]>;
  findInactiveUsers(): Promise<User[]>;
  findUsersRegisteredAfter(date: Date): Promise<User[]>;
  findUsersEligibleForVipStatus(): Promise<User[]>;

  // Business operations
  countActiveUsers(): Promise<number>;
  deactivateInactiveUsers(daysSinceLastLogin: number): Promise<number>;

  // Bulk operations for business scenarios
  findUsersByIds(ids: UserId[]): Promise<User[]>;
  updateLastLoginForUsers(userIds: UserId[], loginDate: Date): Promise<void>;
}

export interface IOrderRepository {
  save(order: Order): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;

  // Business queries
  findByCustomerId(customerId: CustomerId): Promise<Order[]>;
  findPendingOrders(): Promise<Order[]>;
  findOrdersRequiringShipping(): Promise<Order[]>;
  findOrdersCreatedBetween(start: Date, end: Date): Promise<Order[]>;

  // Business analytics
  calculateTotalRevenueForPeriod(start: Date, end: Date): Promise<Money>;
  findTopCustomersByOrderValue(limit: number): Promise<CustomerOrderSummary[]>;
}

// Service ports - Define business service needs
export interface IEmailService {
  // Business-focused email operations
  sendWelcomeEmail(email: Email, userName: string): Promise<void>;
  sendPasswordResetEmail(email: Email, resetToken: string): Promise<void>;
  sendOrderConfirmationEmail(email: Email, order: Order): Promise<void>;
  sendVipUpgradeNotification(email: Email, benefits: VipBenefits): Promise<void>;

  // Business validation
  isEmailDeliverable(email: Email): Promise<boolean>;
  isValidBusinessEmail(email: Email): Promise<boolean>;
}

export interface IPaymentService {
  // Business payment operations
  chargeCustomer(customerId: CustomerId, amount: Money): Promise<PaymentResult>;
  refundPayment(paymentId: string, amount: Money): Promise<RefundResult>;

  // Business payment queries
  getCustomerPaymentMethods(customerId: CustomerId): Promise<PaymentMethod[]>;
  getPaymentHistory(customerId: CustomerId): Promise<PaymentTransaction[]>;

  // Business payment validation
  validatePaymentMethod(paymentMethod: PaymentMethod): Promise<boolean>;
  checkFraudRisk(customerId: CustomerId, amount: Money): Promise<FraudRiskAssessment>;
}

export interface INotificationService {
  // Business notification operations
  notifyUserRegistration(userId: UserId): Promise<void>;
  notifyOrderStatusChange(orderId: OrderId, newStatus: OrderStatus): Promise<void>;
  notifyVipUpgrade(userId: UserId, benefits: VipBenefits): Promise<void>;

  // Business notification preferences
  updateNotificationPreferences(userId: UserId, preferences: NotificationPreferences): Promise<void>;
  canSendNotification(userId: UserId, notificationType: NotificationType): Promise<boolean>;
}
```

#### Domain Events - Business Occurrences
```typescript
// Base domain event
export abstract class DomainEvent {
  public readonly occurredAt: Date;
  public readonly eventId: string;

  constructor(
    public readonly aggregateId: string,
    public readonly eventType: string
  ) {
    this.occurredAt = new Date();
    this.eventId = `${eventType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// User domain events
export class UserRegisteredEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly fullName: string
  ) {
    super(userId, 'UserRegistered');
  }
}

export class UserEmailUpdatedEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly oldEmail: string,
    public readonly newEmail: string
  ) {
    super(userId, 'UserEmailUpdated');
  }
}

export class UserDeactivatedEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly reason: string
  ) {
    super(userId, 'UserDeactivated');
  }
}

export class UserUpgradedToVipEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly previousStatus: string,
    public readonly benefits: VipBenefits
  ) {
    super(userId, 'UserUpgradedToVip');
  }
}

// Order domain events
export class OrderCreatedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly totalAmount: number,
    public readonly currency: string
  ) {
    super(orderId, 'OrderCreated');
  }
}

export class OrderConfirmedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly confirmedAt: Date
  ) {
    super(orderId, 'OrderConfirmed');
  }
}

export class OrderShippedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly trackingNumber: string,
    public readonly carrier: string
  ) {
    super(orderId, 'OrderShipped');
  }
}

export class OrderCancelledEvent extends DomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly reason: string,
    public readonly refundAmount?: number
  ) {
    super(orderId, 'OrderCancelled');
  }
}
```

### ❌ What Does NOT Belong in Core Abstractions

#### Infrastructure Details
```typescript
// ❌ DON'T: Database concerns in entities
export class User {
  constructor(/* ... */) {}

  // Database-specific methods don't belong here
  async saveToDatabase(): Promise<void> {
    const query = 'INSERT INTO users...';
    await database.query(query);
  }

  static async findFromDatabase(id: string): Promise<User> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await database.query(query, [id]);
    return new User(/* ... */);
  }
}

// ❌ DON'T: HTTP concerns in entities
export class User {
  async sendWelcomeEmail(): Promise<void> {
    await fetch('https://email-service.com/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email.value })
    });
  }
}

// ❌ DON'T: File system operations in entities
export class User {
  async exportToFile(): Promise<void> {
    const data = JSON.stringify(this);
    await fs.writeFile(`users/${this.id.value}.json`, data);
  }
}
```

#### Framework Dependencies
```typescript
// ❌ DON'T: Framework imports in core abstractions
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column()
  @ApiProperty()
  email: string;
}

// ✅ DO: Pure business entities
export class User {
  constructor(
    public readonly id: UserId,
    public readonly email: Email,
    public readonly fullName: FullName
  ) {}
}
```

#### External Service Calls
```typescript
// ❌ DON'T: External service calls in core abstractions
export class User {
  async validateEmailDeliverability(): Promise<boolean> {
    // External service call doesn't belong here
    const response = await axios.post('https://email-validator.com/validate', {
      email: this.email.value
    });
    return response.data.isDeliverable;
  }
}

// ✅ DO: Define contracts for external services
export interface IEmailValidationService {
  validateDeliverability(email: Email): Promise<boolean>;
}

// Use in operators layer
export class UserOperator {
  constructor(
    private readonly emailValidationService: IEmailValidationService
  ) {}

  async registerUser(dto: CreateUserDto): Promise<UserResponseDto> {
    const email = new Email(dto.email);
    const isDeliverable = await this.emailValidationService.validateDeliverability(email);

    if (!isDeliverable) {
      throw new Error('Email address is not deliverable');
    }

    // Continue with user creation...
  }
}
```

## File Organization

```
src/core-abstractions/
├── entities/
│   ├── user.entity.ts
│   ├── order.entity.ts
│   ├── order-item.entity.ts
│   └── customer.entity.ts
├── value-objects/
│   ├── user-id.vo.ts
│   ├── email.vo.ts
│   ├── full-name.vo.ts
│   ├── money.vo.ts
│   ├── address.vo.ts
│   └── phone-number.vo.ts
├── ports/
│   ├── repositories/
│   │   ├── user.repository.ts
│   │   ├── order.repository.ts
│   │   └── customer.repository.ts
│   ├── services/
│   │   ├── email.service.ts
│   │   ├── payment.service.ts
│   │   └── notification.service.ts
│   └── infrastructure/
│       ├── event-bus.port.ts
│       ├── logger.port.ts
│       └── file-storage.port.ts
├── events/
│   ├── user/
│   │   ├── user-registered.event.ts
│   │   ├── user-updated.event.ts
│   │   └── user-deactivated.event.ts
│   ├── order/
│   │   ├── order-created.event.ts
│   │   ├── order-confirmed.event.ts
│   │   └── order-shipped.event.ts
│   └── base/
│       └── domain-event.ts
└── types/
    ├── enums.ts
    ├── interfaces.ts
    └── common-types.ts
```

## Testing Core Abstractions

### Entity Tests
```typescript
describe('User Entity', () => {
  it('should create valid user', () => {
    const user = User.create({
      email: 'test@example.com',
      fullName: 'John Doe',
      birthDate: '1990-01-01'
    });

    expect(user.email.value).toBe('test@example.com');
    expect(user.fullName.value).toBe('John Doe');
    expect(user.isActive).toBe(true);
  });

  it('should enforce business rules', () => {
    expect(() => {
      User.create({
        email: 'test@example.com',
        fullName: 'John Doe',
        birthDate: '2020-01-01' // Too young
      });
    }).toThrow('Users must be at least 13 years old');
  });

  it('should handle business operations', () => {
    const user = User.create(validUserDto);
    const newEmail = new Email('new@example.com');

    const updatedUser = user.updateEmail(newEmail);

    expect(updatedUser.email.value).toBe('new@example.com');
    expect(updatedUser.id).toBe(user.id); // Identity preserved
  });
});
```

### Value Object Tests
```typescript
describe('Money Value Object', () => {
  it('should perform business calculations', () => {
    const amount1 = new Money(10.50, 'USD');
    const amount2 = new Money(5.25, 'USD');

    const sum = amount1.add(amount2);

    expect(sum.value).toBe(15.75);
    expect(sum.currency).toBe('USD');
  });

  it('should enforce currency consistency', () => {
    const usd = new Money(10, 'USD');
    const eur = new Money(10, 'EUR');

    expect(() => usd.add(eur)).toThrow('Cannot operate on different currencies');
  });

  it('should format for business display', () => {
    const amount = new Money(1234.56, 'USD');

    expect(amount.format('en-US')).toBe('$1,234.56');
  });
});
```

Core Abstractions are the foundation of your business logic—keep them pure, focused on business concepts, and free from technical concerns.