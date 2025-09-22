# Port & Adapter Pattern

## Intent
Isolate business logic from external systems by defining clear interfaces (ports) and implementing adapters that handle the technical details of integration.

## Problem
- Business logic gets coupled to specific technologies (databases, APIs, messaging systems)
- Difficult to test business logic without external dependencies
- Technology changes require modifications throughout the system
- Different environments need different implementations

## Solution
Define abstract interfaces (ports) in Core Abstractions that express business needs, then implement concrete adapters in Implementations that handle the technical details.

## Structure

```mermaid
graph TB
    subgraph "Core Abstractions"
        Port[Port - Interface]
    end

    subgraph "Operators"
        Operator[Operator]
    end

    subgraph "Implementations"
        Adapter1[Adapter 1]
        Adapter2[Adapter 2]
        Adapter3[Adapter 3]
    end

    subgraph "External Systems"
        DB[(Database)]
        API[REST API]
        Queue[Message Queue]
    end

    Operator --> Port
    Port <|.. Adapter1
    Port <|.. Adapter2
    Port <|.. Adapter3

    Adapter1 --> DB
    Adapter2 --> API
    Adapter3 --> Queue

    style Port fill:#fff7ed,stroke:#c2410c,stroke-width:2px
    style Operator fill:#f0f9ff,stroke:#0284c7,stroke-width:2px
```

## Implementation

### 1. Port Definition (Core Abstractions)
```typescript
// core-abstractions/ports/user.repository.ts
export interface IUserRepository {
  // Business-focused method names
  save(user: User): Promise<void>;
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  findActiveUsers(): Promise<User[]>;

  // Business queries, not technical queries
  findUsersRegisteredAfter(date: Date): Promise<User[]>;
  countActiveUsers(): Promise<number>;

  // Bulk operations for business scenarios
  deactivateInactiveUsers(daysSinceLastLogin: number): Promise<number>;
}

// core-abstractions/ports/email.service.ts
export interface IEmailService {
  // Business intent, not implementation details
  sendWelcomeEmail(userEmail: Email, userName: string): Promise<void>;
  sendPasswordResetEmail(userEmail: Email, resetToken: string): Promise<void>;
  sendNotification(userEmail: Email, message: string): Promise<void>;

  // Business validation, not technical validation
  isValidDomain(domain: string): Promise<boolean>;
}

// core-abstractions/ports/payment.service.ts
export interface IPaymentService {
  // Business operations
  chargeCustomer(customerId: CustomerId, amount: Money): Promise<PaymentResult>;
  refundPayment(paymentId: PaymentId, amount: Money): Promise<RefundResult>;

  // Business queries
  getCustomerPaymentMethods(customerId: CustomerId): Promise<PaymentMethod[]>;
  validatePaymentMethod(paymentMethod: PaymentMethod): Promise<boolean>;
}
```

### 2. Operator Using Ports (Business Logic)
```typescript
// operators/user.operator.ts
export class UserOperator {
  constructor(
    private userRepository: IUserRepository,
    private emailService: IEmailService,
    private eventBus: IEventBus
  ) {}

  async registerUser(dto: RegisterUserDto): Promise<UserResponseDto> {
    // Business validation using port abstractions
    const existingUser = await this.userRepository.findByEmail(new Email(dto.email));
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Validate email domain (business rule)
    const emailDomain = dto.email.split('@')[1];
    const isValidDomain = await this.emailService.isValidDomain(emailDomain);
    if (!isValidDomain) {
      throw new Error('Email domain not allowed');
    }

    // Create user entity
    const user = User.create(dto);

    // Save using repository port
    await this.userRepository.save(user);

    // Send welcome email using email service port
    await this.emailService.sendWelcomeEmail(user.email, user.fullName.value);

    // Emit business event
    await this.eventBus.emit(new UserRegisteredEvent(user.id.value));

    return this.mapToResponseDto(user);
  }

  async deactivateInactiveUsers(): Promise<{ deactivatedCount: number }> {
    // Business logic using port abstraction
    const deactivatedCount = await this.userRepository.deactivateInactiveUsers(90);

    if (deactivatedCount > 0) {
      await this.eventBus.emit(new InactiveUsersDeactivatedEvent(deactivatedCount));
    }

    return { deactivatedCount };
  }
}
```

### 3. Adapters Implementation (Technical Details)

#### Database Adapter
```typescript
// implementations/repositories/user.postgres.repository.ts
export class PostgresUserRepository implements IUserRepository {
  constructor(private db: PostgresConnection) {}

  async save(user: User): Promise<void> {
    const query = `
      INSERT INTO users (id, email, full_name, birth_date, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        is_active = EXCLUDED.is_active
    `;

    await this.db.query(query, [
      user.id.value,
      user.email.value,
      user.fullName.value,
      user.birthDate,
      user.isActive,
      user.createdAt
    ]);
  }

  async findById(id: UserId): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.db.query(query, [id.value]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  async findByEmail(email: Email): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await this.db.query(query, [email.value]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  async findActiveUsers(): Promise<User[]> {
    const query = 'SELECT * FROM users WHERE is_active = true ORDER BY created_at DESC';
    const result = await this.db.query(query);

    return result.rows.map(row => this.mapRowToUser(row));
  }

  async findUsersRegisteredAfter(date: Date): Promise<User[]> {
    const query = 'SELECT * FROM users WHERE created_at > $1 ORDER BY created_at DESC';
    const result = await this.db.query(query, [date]);

    return result.rows.map(row => this.mapRowToUser(row));
  }

  async countActiveUsers(): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM users WHERE is_active = true';
    const result = await this.db.query(query);

    return parseInt(result.rows[0].count);
  }

  async deactivateInactiveUsers(daysSinceLastLogin: number): Promise<number> {
    const query = `
      UPDATE users
      SET is_active = false
      WHERE is_active = true
        AND last_login_at < NOW() - INTERVAL '${daysSinceLastLogin} days'
    `;

    const result = await this.db.query(query);
    return result.rowCount || 0;
  }

  private mapRowToUser(row: any): User {
    return new User(
      UserId.fromString(row.id),
      new Email(row.email),
      FullName.fromString(row.full_name),
      new Date(row.birth_date),
      UserPreferences.default(),
      row.is_active,
      new Date(row.created_at),
      row.last_login_at ? new Date(row.last_login_at) : null
    );
  }
}
```

#### Email Service Adapter
```typescript
// implementations/services/email.smtp.service.ts
export class SmtpEmailService implements IEmailService {
  constructor(
    private smtpClient: SMTPClient,
    private config: EmailConfig
  ) {}

  async sendWelcomeEmail(userEmail: Email, userName: string): Promise<void> {
    const template = await this.loadTemplate('welcome');
    const htmlContent = template.render({ userName });

    await this.smtpClient.send({
      from: this.config.fromAddress,
      to: userEmail.value,
      subject: 'Welcome to our platform!',
      html: htmlContent
    });
  }

  async sendPasswordResetEmail(userEmail: Email, resetToken: string): Promise<void> {
    const resetUrl = `${this.config.baseUrl}/reset-password?token=${resetToken}`;
    const template = await this.loadTemplate('password-reset');
    const htmlContent = template.render({ resetUrl });

    await this.smtpClient.send({
      from: this.config.fromAddress,
      to: userEmail.value,
      subject: 'Password Reset Request',
      html: htmlContent
    });
  }

  async sendNotification(userEmail: Email, message: string): Promise<void> {
    await this.smtpClient.send({
      from: this.config.fromAddress,
      to: userEmail.value,
      subject: 'Notification',
      text: message
    });
  }

  async isValidDomain(domain: string): Promise<boolean> {
    // Check against blocked domains list
    if (this.config.blockedDomains.includes(domain)) {
      return false;
    }

    // Perform DNS lookup to verify domain exists
    try {
      await this.dnsLookup(domain);
      return true;
    } catch {
      return false;
    }
  }

  private async loadTemplate(templateName: string): Promise<EmailTemplate> {
    // Load email template from file system or database
    return new EmailTemplate(templateName);
  }

  private async dnsLookup(domain: string): Promise<void> {
    // Perform DNS MX record lookup
  }
}
```

#### Alternative Email Adapter
```typescript
// implementations/services/email.sendgrid.service.ts
export class SendGridEmailService implements IEmailService {
  constructor(private sendGridClient: SendGridClient) {}

  async sendWelcomeEmail(userEmail: Email, userName: string): Promise<void> {
    await this.sendGridClient.send({
      to: userEmail.value,
      from: 'noreply@company.com',
      templateId: 'welcome-template-id',
      dynamicTemplateData: {
        userName
      }
    });
  }

  async sendPasswordResetEmail(userEmail: Email, resetToken: string): Promise<void> {
    const resetUrl = `https://app.company.com/reset?token=${resetToken}`;

    await this.sendGridClient.send({
      to: userEmail.value,
      from: 'noreply@company.com',
      templateId: 'password-reset-template-id',
      dynamicTemplateData: {
        resetUrl
      }
    });
  }

  async sendNotification(userEmail: Email, message: string): Promise<void> {
    await this.sendGridClient.send({
      to: userEmail.value,
      from: 'notifications@company.com',
      subject: 'Notification',
      text: message
    });
  }

  async isValidDomain(domain: string): Promise<boolean> {
    // Use SendGrid's email validation API
    const validation = await this.sendGridClient.validateEmail(`test@${domain}`);
    return validation.result.valid;
  }
}
```

### 4. Bootstrap Configuration (Dependency Injection)
```typescript
// bootstrap/container.ts
export class ContainerConfig {
  static configureForDevelopment(container: DIContainer): void {
    // Use in-memory implementations for development
    container.register<IUserRepository>('IUserRepository',
      () => new InMemoryUserRepository());

    container.register<IEmailService>('IEmailService',
      () => new ConsoleEmailService()); // Logs to console

    this.registerOperators(container);
  }

  static configureForProduction(container: DIContainer): void {
    // Use real implementations for production
    container.register<IUserRepository>('IUserRepository', () => {
      const db = container.resolve<PostgresConnection>('PostgresConnection');
      return new PostgresUserRepository(db);
    });

    container.register<IEmailService>('IEmailService', () => {
      const client = container.resolve<SendGridClient>('SendGridClient');
      return new SendGridEmailService(client);
    });

    this.registerOperators(container);
  }

  static configureForTesting(container: DIContainer): void {
    // Use mock implementations for testing
    container.register<IUserRepository>('IUserRepository',
      () => new MockUserRepository());

    container.register<IEmailService>('IEmailService',
      () => new MockEmailService());

    this.registerOperators(container);
  }

  private static registerOperators(container: DIContainer): void {
    container.register<UserOperator>('UserOperator', () => {
      const userRepo = container.resolve<IUserRepository>('IUserRepository');
      const emailService = container.resolve<IEmailService>('IEmailService');
      const eventBus = container.resolve<IEventBus>('IEventBus');
      return new UserOperator(userRepo, emailService, eventBus);
    });
  }
}
```

## Key Principles

### 1. Business-Focused Interfaces
- Methods express business intent, not technical operations
- Parameters use domain types, not primitive types
- Return types match business concepts

### 2. Technology Independence
- Ports define what the business needs
- Adapters handle how technology works
- Business logic unaware of implementation details

### 3. Testability
- Easy to mock ports for unit testing
- Can swap implementations without changing business logic
- Fast tests with in-memory implementations

### 4. Flexibility
- Multiple implementations of same port
- Environment-specific configurations
- Easy to add new technologies

## Common Port Types

### 1. Repository Ports
```typescript
interface IEntityRepository<T, ID> {
  save(entity: T): Promise<void>;
  findById(id: ID): Promise<T | null>;
  findAll(): Promise<T[]>;
  delete(id: ID): Promise<boolean>;
}
```

### 2. Service Ports
```typescript
interface INotificationService {
  sendNotification(recipient: UserId, message: string): Promise<void>;
  scheduleNotification(recipient: UserId, message: string, scheduledAt: Date): Promise<void>;
}
```

### 3. Gateway Ports
```typescript
interface IPaymentGateway {
  processPayment(request: PaymentRequest): Promise<PaymentResult>;
  refundPayment(paymentId: string, amount: Money): Promise<RefundResult>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
}
```

### 4. Event Ports
```typescript
interface IEventBus {
  emit(event: DomainEvent): Promise<void>;
  subscribe<T extends DomainEvent>(eventType: string, handler: (event: T) => Promise<void>): void;
}
```

## Benefits

1. **Technology Independence**: Swap databases, APIs, messaging systems without changing business logic
2. **Testability**: Mock external dependencies easily
3. **Parallel Development**: Teams can work on business logic and infrastructure separately
4. **Environment Flexibility**: Different implementations for dev/test/prod
5. **Future-Proofing**: Easy to adopt new technologies
6. **Clear Boundaries**: Explicit separation of concerns

## Anti-Patterns

### ❌ Leaky Abstraction
```typescript
// DON'T: Expose implementation details in port
interface IUserRepository {
  executeQuery(sql: string): Promise<any>; // SQL leakage
  getDbConnection(): Connection;           // Database leakage
}
```

### ❌ Technology-Specific Ports
```typescript
// DON'T: Tie port to specific technology
interface IPostgresUserRepository {
  saveToPostgres(user: User): Promise<void>;
  findByIdFromPostgres(id: string): Promise<User>;
}
```

### ❌ Anemic Ports
```typescript
// DON'T: Generic CRUD without business meaning
interface IGenericRepository<T> {
  create(entity: T): Promise<void>;
  read(id: string): Promise<T>;
  update(entity: T): Promise<void>;
  delete(id: string): Promise<void>;
}
```

## Best Practices

1. **Business Language**: Use domain terminology in port methods
2. **Domain Types**: Parameters and return types should be domain objects
3. **Single Responsibility**: Each port should have one clear purpose
4. **Stable Interfaces**: Avoid frequent changes to port contracts
5. **Rich Behavior**: Ports should express business operations, not just data access
6. **Async by Default**: Use Promise return types for flexibility
7. **Error Handling**: Define clear error scenarios in port contracts
8. **Documentation**: Document business rules and expectations

This pattern is fundamental to ADD's technology independence and testability.