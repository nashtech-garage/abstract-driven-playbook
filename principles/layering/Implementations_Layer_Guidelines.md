# Implementations Layer Guidelines

## Purpose
The Implementations layer provides concrete implementations of the interfaces (ports) defined in Core Abstractions. This layer handles all technical concerns, external system integrations, and infrastructure details.

## Core Responsibilities

### 1. **External System Integration**
- Database access and persistence
- Third-party API communication
- Message queue operations
- File system operations
- Network communication

### 2. **Technical Implementation**
- Convert business operations to technical operations
- Handle technology-specific concerns
- Manage connections and resources
- Implement caching, retry logic, and error handling

### 3. **Data Mapping**
- Transform business entities to/from external formats
- Handle serialization and deserialization
- Map between different data models
- Manage data type conversions

## Implementation Guidelines

### ✅ What Belongs in Implementations Layer

#### Repository Implementations
```typescript
// PostgreSQL repository implementation
export class PostgresUserRepository implements IUserRepository {
  constructor(
    private readonly db: Pool,
    private readonly logger: ILogger
  ) {}

  async save(user: User): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Convert business entity to database format
      const userData = this.mapUserToRow(user);

      const query = `
        INSERT INTO users (id, email, full_name, birth_date, is_active, created_at, last_login_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          is_active = EXCLUDED.is_active,
          last_login_at = EXCLUDED.last_login_at,
          updated_at = NOW()
      `;

      await client.query(query, [
        userData.id,
        userData.email,
        userData.fullName,
        userData.birthDate,
        userData.isActive,
        userData.createdAt,
        userData.lastLoginAt
      ]);

      // Save user preferences separately
      if (user.preferences) {
        await this.saveUserPreferences(client, user.id, user.preferences);
      }

      await client.query('COMMIT');

      this.logger.debug('User saved successfully', { userId: user.id.value });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to save user', {
        userId: user.id.value,
        error: error.message
      });
      throw new DatabaseError('Failed to save user', error);
    } finally {
      client.release();
    }
  }

  async findById(id: UserId): Promise<User | null> {
    try {
      const query = `
        SELECT u.*, up.preferences
        FROM users u
        LEFT JOIN user_preferences up ON u.id = up.user_id
        WHERE u.id = $1 AND u.deleted_at IS NULL
      `;

      const result = await this.db.query(query, [id.value]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to find user by ID', {
        userId: id.value,
        error: error.message
      });
      throw new DatabaseError('Failed to find user', error);
    }
  }

  async findByEmail(email: Email): Promise<User | null> {
    try {
      const query = `
        SELECT u.*, up.preferences
        FROM users u
        LEFT JOIN user_preferences up ON u.id = up.user_id
        WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL
      `;

      const result = await this.db.query(query, [email.value]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to find user by email', {
        email: email.value,
        error: error.message
      });
      throw new DatabaseError('Failed to find user', error);
    }
  }

  async findActiveUsers(): Promise<User[]> {
    try {
      const query = `
        SELECT u.*, up.preferences
        FROM users u
        LEFT JOIN user_preferences up ON u.id = up.user_id
        WHERE u.is_active = true AND u.deleted_at IS NULL
        ORDER BY u.created_at DESC
      `;

      const result = await this.db.query(query);
      return result.rows.map(row => this.mapRowToUser(row));
    } catch (error) {
      this.logger.error('Failed to find active users', { error: error.message });
      throw new DatabaseError('Failed to find active users', error);
    }
  }

  async findUsersRegisteredAfter(date: Date): Promise<User[]> {
    try {
      const query = `
        SELECT u.*, up.preferences
        FROM users u
        LEFT JOIN user_preferences up ON u.id = up.user_id
        WHERE u.created_at > $1 AND u.deleted_at IS NULL
        ORDER BY u.created_at DESC
      `;

      const result = await this.db.query(query, [date]);
      return result.rows.map(row => this.mapRowToUser(row));
    } catch (error) {
      this.logger.error('Failed to find users registered after date', {
        date: date.toISOString(),
        error: error.message
      });
      throw new DatabaseError('Failed to find users', error);
    }
  }

  async countActiveUsers(): Promise<number> {
    try {
      const query = 'SELECT COUNT(*) as count FROM users WHERE is_active = true AND deleted_at IS NULL';
      const result = await this.db.query(query);
      return parseInt(result.rows[0].count);
    } catch (error) {
      this.logger.error('Failed to count active users', { error: error.message });
      throw new DatabaseError('Failed to count users', error);
    }
  }

  async deactivateInactiveUsers(daysSinceLastLogin: number): Promise<number> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const query = `
        UPDATE users
        SET is_active = false, updated_at = NOW()
        WHERE is_active = true
          AND (last_login_at IS NULL OR last_login_at < NOW() - INTERVAL '${daysSinceLastLogin} days')
          AND deleted_at IS NULL
      `;

      const result = await client.query(query);
      await client.query('COMMIT');

      this.logger.info('Deactivated inactive users', {
        count: result.rowCount,
        daysSinceLastLogin
      });

      return result.rowCount || 0;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to deactivate inactive users', {
        daysSinceLastLogin,
        error: error.message
      });
      throw new DatabaseError('Failed to deactivate users', error);
    } finally {
      client.release();
    }
  }

  // Private mapping methods
  private mapUserToRow(user: User): UserRow {
    return {
      id: user.id.value,
      email: user.email.value,
      fullName: user.fullName.value,
      birthDate: user.birthDate,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    };
  }

  private mapRowToUser(row: any): User {
    const preferences = row.preferences
      ? UserPreferences.fromJson(row.preferences)
      : UserPreferences.default();

    return new User(
      UserId.fromString(row.id),
      new Email(row.email),
      FullName.fromString(row.full_name),
      new Date(row.birth_date),
      preferences,
      row.is_active,
      new Date(row.created_at),
      row.last_login_at ? new Date(row.last_login_at) : null
    );
  }

  private async saveUserPreferences(
    client: PoolClient,
    userId: UserId,
    preferences: UserPreferences
  ): Promise<void> {
    const query = `
      INSERT INTO user_preferences (user_id, preferences)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET
        preferences = EXCLUDED.preferences,
        updated_at = NOW()
    `;

    await client.query(query, [userId.value, preferences.toJson()]);
  }
}

// MongoDB repository implementation
export class MongoUserRepository implements IUserRepository {
  constructor(
    private readonly collection: Collection<UserDocument>,
    private readonly logger: ILogger
  ) {}

  async save(user: User): Promise<void> {
    try {
      const document = this.mapUserToDocument(user);

      await this.collection.replaceOne(
        { _id: user.id.value },
        document,
        { upsert: true }
      );

      this.logger.debug('User saved successfully', { userId: user.id.value });
    } catch (error) {
      this.logger.error('Failed to save user', {
        userId: user.id.value,
        error: error.message
      });
      throw new DatabaseError('Failed to save user', error);
    }
  }

  async findById(id: UserId): Promise<User | null> {
    try {
      const document = await this.collection.findOne({ _id: id.value });
      return document ? this.mapDocumentToUser(document) : null;
    } catch (error) {
      this.logger.error('Failed to find user by ID', {
        userId: id.value,
        error: error.message
      });
      throw new DatabaseError('Failed to find user', error);
    }
  }

  async findByEmail(email: Email): Promise<User | null> {
    try {
      const document = await this.collection.findOne({
        email: { $regex: new RegExp(`^${email.value}$`, 'i') }
      });

      return document ? this.mapDocumentToUser(document) : null;
    } catch (error) {
      this.logger.error('Failed to find user by email', {
        email: email.value,
        error: error.message
      });
      throw new DatabaseError('Failed to find user', error);
    }
  }

  private mapUserToDocument(user: User): UserDocument {
    return {
      _id: user.id.value,
      email: user.email.value,
      fullName: user.fullName.value,
      birthDate: user.birthDate,
      preferences: user.preferences.toJson(),
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      updatedAt: new Date()
    };
  }

  private mapDocumentToUser(doc: UserDocument): User {
    return new User(
      UserId.fromString(doc._id),
      new Email(doc.email),
      FullName.fromString(doc.fullName),
      doc.birthDate,
      UserPreferences.fromJson(doc.preferences),
      doc.isActive,
      doc.createdAt,
      doc.lastLoginAt
    );
  }
}

// In-memory repository for testing
export class InMemoryUserRepository implements IUserRepository {
  private users = new Map<string, User>();

  async save(user: User): Promise<void> {
    this.users.set(user.id.value, user);
  }

  async findById(id: UserId): Promise<User | null> {
    return this.users.get(id.value) || null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email.equals(email)) {
        return user;
      }
    }
    return null;
  }

  async findActiveUsers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.isActive);
  }

  async findUsersRegisteredAfter(date: Date): Promise<User[]> {
    return Array.from(this.users.values())
      .filter(user => user.createdAt > date);
  }

  async countActiveUsers(): Promise<number> {
    return Array.from(this.users.values())
      .filter(user => user.isActive).length;
  }

  async deactivateInactiveUsers(daysSinceLastLogin: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastLogin);

    let count = 0;
    for (const [id, user] of this.users.entries()) {
      if (user.isActive && (!user.lastLoginAt || user.lastLoginAt < cutoffDate)) {
        const deactivatedUser = user.deactivate('INACTIVE');
        this.users.set(id, deactivatedUser);
        count++;
      }
    }

    return count;
  }

  // Test helper methods
  clear(): void {
    this.users.clear();
  }

  size(): number {
    return this.users.size;
  }
}
```

#### External Service Implementations
```typescript
// SMTP email service implementation
export class SmtpEmailService implements IEmailService {
  constructor(
    private readonly transporter: nodemailer.Transporter,
    private readonly config: EmailConfig,
    private readonly logger: ILogger
  ) {}

  async sendWelcomeEmail(email: Email, userName: string): Promise<void> {
    try {
      const template = await this.loadTemplate('welcome');
      const htmlContent = template.render({ userName });

      await this.transporter.sendMail({
        from: this.config.fromAddress,
        to: email.value,
        subject: 'Welcome to our platform!',
        html: htmlContent,
        text: this.extractTextFromHtml(htmlContent)
      });

      this.logger.info('Welcome email sent successfully', {
        recipient: email.value,
        userName
      });
    } catch (error) {
      this.logger.error('Failed to send welcome email', {
        recipient: email.value,
        error: error.message
      });
      throw new EmailDeliveryError('Failed to send welcome email', error);
    }
  }

  async sendPasswordResetEmail(email: Email, resetToken: string): Promise<void> {
    try {
      const resetUrl = `${this.config.baseUrl}/reset-password?token=${resetToken}`;
      const template = await this.loadTemplate('password-reset');
      const htmlContent = template.render({ resetUrl, email: email.value });

      await this.transporter.sendMail({
        from: this.config.fromAddress,
        to: email.value,
        subject: 'Password Reset Request',
        html: htmlContent,
        text: `Reset your password: ${resetUrl}`
      });

      this.logger.info('Password reset email sent successfully', {
        recipient: email.value
      });
    } catch (error) {
      this.logger.error('Failed to send password reset email', {
        recipient: email.value,
        error: error.message
      });
      throw new EmailDeliveryError('Failed to send password reset email', error);
    }
  }

  async isEmailDeliverable(email: Email): Promise<boolean> {
    try {
      // Use external email validation service
      const response = await this.validateEmailWithService(email.value);
      return response.isDeliverable;
    } catch (error) {
      this.logger.warn('Email deliverability check failed', {
        email: email.value,
        error: error.message
      });
      // Return true if validation service fails - don't block user registration
      return true;
    }
  }

  private async loadTemplate(templateName: string): Promise<EmailTemplate> {
    const templatePath = path.join(this.config.templatesDir, `${templateName}.hbs`);
    const templateContent = await fs.readFile(templatePath, 'utf8');
    return new EmailTemplate(templateContent);
  }

  private extractTextFromHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  private async validateEmailWithService(email: string): Promise<EmailValidationResult> {
    const response = await fetch(`${this.config.validationServiceUrl}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      throw new Error(`Validation service error: ${response.status}`);
    }

    return await response.json();
  }
}

// SendGrid email service implementation
export class SendGridEmailService implements IEmailService {
  constructor(
    private readonly client: SendGridClient,
    private readonly config: EmailConfig,
    private readonly logger: ILogger
  ) {}

  async sendWelcomeEmail(email: Email, userName: string): Promise<void> {
    try {
      await this.client.send({
        to: email.value,
        from: this.config.fromAddress,
        templateId: this.config.templates.welcome,
        dynamicTemplateData: {
          userName,
          loginUrl: `${this.config.baseUrl}/login`
        }
      });

      this.logger.info('Welcome email sent via SendGrid', {
        recipient: email.value,
        userName
      });
    } catch (error) {
      this.logger.error('Failed to send welcome email via SendGrid', {
        recipient: email.value,
        error: error.message
      });
      throw new EmailDeliveryError('Failed to send welcome email', error);
    }
  }

  async sendPasswordResetEmail(email: Email, resetToken: string): Promise<void> {
    try {
      const resetUrl = `${this.config.baseUrl}/reset-password?token=${resetToken}`;

      await this.client.send({
        to: email.value,
        from: this.config.fromAddress,
        templateId: this.config.templates.passwordReset,
        dynamicTemplateData: {
          resetUrl,
          email: email.value,
          expirationHours: 24
        }
      });

      this.logger.info('Password reset email sent via SendGrid', {
        recipient: email.value
      });
    } catch (error) {
      this.logger.error('Failed to send password reset email via SendGrid', {
        recipient: email.value,
        error: error.message
      });
      throw new EmailDeliveryError('Failed to send password reset email', error);
    }
  }

  async isEmailDeliverable(email: Email): Promise<boolean> {
    try {
      // Use SendGrid's email validation API
      const response = await this.client.validateEmail(email.value);
      return response.result.valid;
    } catch (error) {
      this.logger.warn('SendGrid email validation failed', {
        email: email.value,
        error: error.message
      });
      return true; // Fail open
    }
  }
}

// Console email service for development
export class ConsoleEmailService implements IEmailService {
  constructor(private readonly logger: ILogger) {}

  async sendWelcomeEmail(email: Email, userName: string): Promise<void> {
    const message = `
=== WELCOME EMAIL ===
To: ${email.value}
Subject: Welcome to our platform!

Hi ${userName},

Welcome to our platform! We're excited to have you on board.

Best regards,
The Team
==================
    `;

    console.log(message);
    this.logger.info('Welcome email logged to console', {
      recipient: email.value,
      userName
    });
  }

  async sendPasswordResetEmail(email: Email, resetToken: string): Promise<void> {
    const message = `
=== PASSWORD RESET EMAIL ===
To: ${email.value}
Subject: Password Reset Request

Click the following link to reset your password:
http://localhost:3000/reset-password?token=${resetToken}

This link expires in 24 hours.
=========================
    `;

    console.log(message);
    this.logger.info('Password reset email logged to console', {
      recipient: email.value
    });
  }

  async isEmailDeliverable(email: Email): Promise<boolean> {
    this.logger.info('Email deliverability check (console mode)', {
      email: email.value,
      result: true
    });
    return true; // Always return true in console mode
  }
}
```

#### Payment Service Implementations
```typescript
// Stripe payment service implementation
export class StripePaymentService implements IPaymentService {
  constructor(
    private readonly stripe: Stripe,
    private readonly logger: ILogger
  ) {}

  async chargeCustomer(customerId: CustomerId, amount: Money): Promise<PaymentResult> {
    try {
      const charge = await this.stripe.charges.create({
        amount: amount.cents, // Stripe expects cents
        currency: amount.currency.toLowerCase(),
        customer: customerId.value,
        description: 'Order payment'
      });

      this.logger.info('Payment processed successfully', {
        customerId: customerId.value,
        amount: amount.value,
        chargeId: charge.id
      });

      return PaymentResult.success(charge.id, amount);
    } catch (error) {
      this.logger.error('Payment processing failed', {
        customerId: customerId.value,
        amount: amount.value,
        error: error.message
      });

      return PaymentResult.failure(this.mapStripeError(error));
    }
  }

  async refundPayment(paymentId: string, amount: Money): Promise<RefundResult> {
    try {
      const refund = await this.stripe.refunds.create({
        charge: paymentId,
        amount: amount.cents
      });

      this.logger.info('Refund processed successfully', {
        paymentId,
        amount: amount.value,
        refundId: refund.id
      });

      return RefundResult.success(refund.id, amount);
    } catch (error) {
      this.logger.error('Refund processing failed', {
        paymentId,
        amount: amount.value,
        error: error.message
      });

      return RefundResult.failure(this.mapStripeError(error));
    }
  }

  async getCustomerPaymentMethods(customerId: CustomerId): Promise<PaymentMethod[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId.value,
        type: 'card'
      });

      return paymentMethods.data.map(pm => this.mapStripePaymentMethod(pm));
    } catch (error) {
      this.logger.error('Failed to retrieve payment methods', {
        customerId: customerId.value,
        error: error.message
      });
      throw new PaymentServiceError('Failed to retrieve payment methods', error);
    }
  }

  private mapStripeError(error: any): string {
    if (error.type === 'StripeCardError') {
      return `Card error: ${error.message}`;
    } else if (error.type === 'StripeInvalidRequestError') {
      return `Invalid request: ${error.message}`;
    } else {
      return `Payment error: ${error.message}`;
    }
  }

  private mapStripePaymentMethod(pm: any): PaymentMethod {
    return new PaymentMethod(
      pm.id,
      pm.card.brand,
      pm.card.last4,
      pm.card.exp_month,
      pm.card.exp_year
    );
  }
}

// PayPal payment service implementation
export class PayPalPaymentService implements IPaymentService {
  constructor(
    private readonly paypalClient: PayPalClient,
    private readonly logger: ILogger
  ) {}

  async chargeCustomer(customerId: CustomerId, amount: Money): Promise<PaymentResult> {
    try {
      const payment = await this.paypalClient.payment.create({
        intent: 'sale',
        payer: { payment_method: 'paypal' },
        transactions: [{
          amount: {
            total: amount.value.toString(),
            currency: amount.currency
          },
          description: 'Order payment'
        }]
      });

      this.logger.info('PayPal payment created', {
        customerId: customerId.value,
        amount: amount.value,
        paymentId: payment.id
      });

      return PaymentResult.success(payment.id, amount);
    } catch (error) {
      this.logger.error('PayPal payment failed', {
        customerId: customerId.value,
        amount: amount.value,
        error: error.message
      });

      return PaymentResult.failure(error.message);
    }
  }

  async refundPayment(paymentId: string, amount: Money): Promise<RefundResult> {
    try {
      const refund = await this.paypalClient.sale.refund(paymentId, {
        amount: {
          total: amount.value.toString(),
          currency: amount.currency
        }
      });

      this.logger.info('PayPal refund processed', {
        paymentId,
        amount: amount.value,
        refundId: refund.id
      });

      return RefundResult.success(refund.id, amount);
    } catch (error) {
      this.logger.error('PayPal refund failed', {
        paymentId,
        amount: amount.value,
        error: error.message
      });

      return RefundResult.failure(error.message);
    }
  }

  async getCustomerPaymentMethods(customerId: CustomerId): Promise<PaymentMethod[]> {
    try {
      // PayPal doesn't store payment methods the same way as Stripe
      // This would integrate with PayPal's customer vault or similar service
      const methods = await this.paypalClient.customer.getPaymentMethods(customerId.value);
      return methods.map(method => this.mapPayPalPaymentMethod(method));
    } catch (error) {
      this.logger.error('Failed to retrieve PayPal payment methods', {
        customerId: customerId.value,
        error: error.message
      });
      throw new PaymentServiceError('Failed to retrieve payment methods', error);
    }
  }

  private mapPayPalPaymentMethod(method: any): PaymentMethod {
    return new PaymentMethod(
      method.id,
      'PayPal',
      method.email, // PayPal uses email instead of card numbers
      null,
      null
    );
  }
}

// Mock payment service for testing
export class MockPaymentService implements IPaymentService {
  private shouldSucceed = true;
  private paymentMethods: PaymentMethod[] = [];

  setSuccessMode(succeed: boolean): void {
    this.shouldSucceed = succeed;
  }

  addMockPaymentMethod(method: PaymentMethod): void {
    this.paymentMethods.push(method);
  }

  async chargeCustomer(customerId: CustomerId, amount: Money): Promise<PaymentResult> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    if (this.shouldSucceed) {
      const paymentId = `mock-payment-${Date.now()}`;
      return PaymentResult.success(paymentId, amount);
    } else {
      return PaymentResult.failure('Mock payment failure');
    }
  }

  async refundPayment(paymentId: string, amount: Money): Promise<RefundResult> {
    await new Promise(resolve => setTimeout(resolve, 100));

    if (this.shouldSucceed) {
      const refundId = `mock-refund-${Date.now()}`;
      return RefundResult.success(refundId, amount);
    } else {
      return RefundResult.failure('Mock refund failure');
    }
  }

  async getCustomerPaymentMethods(customerId: CustomerId): Promise<PaymentMethod[]> {
    return [...this.paymentMethods];
  }
}
```

### ❌ What Does NOT Belong in Implementations Layer

#### Business Logic
```typescript
// ❌ DON'T: Business rules in repository
export class PostgresUserRepository implements IUserRepository {
  async save(user: User): Promise<void> {
    // Business validation doesn't belong here
    if (user.email.value.includes('test')) {
      throw new Error('Test emails not allowed in production');
    }

    // Business rule doesn't belong here
    const age = this.calculateAge(user.birthDate);
    if (age < 13) {
      throw new Error('User must be at least 13 years old');
    }

    // Database operation - this is correct
    await this.db.query(/* ... */);
  }
}

// ✅ DO: Focus on technical implementation
export class PostgresUserRepository implements IUserRepository {
  async save(user: User): Promise<void> {
    try {
      const userData = this.mapUserToRow(user);
      await this.db.query(/* SQL query */, userData);
    } catch (error) {
      throw new DatabaseError('Failed to save user', error);
    }
  }
}
```

#### Business Event Creation
```typescript
// ❌ DON'T: Emit business events in implementations
export class PostgresUserRepository implements IUserRepository {
  async save(user: User): Promise<void> {
    await this.db.query(/* save user */);

    // Business event emission belongs in Operators
    await this.eventBus.emit(new UserCreatedEvent(user.id.value));
  }
}

// ✅ DO: Handle only technical concerns
export class PostgresUserRepository implements IUserRepository {
  async save(user: User): Promise<void> {
    await this.db.query(/* save user */);
    // No business event emission here
  }
}
```

#### Complex Business Calculations
```typescript
// ❌ DON'T: Business calculations in service implementations
export class StripePaymentService implements IPaymentService {
  async chargeCustomer(customerId: CustomerId, amount: Money): Promise<PaymentResult> {
    // Business logic doesn't belong here
    const discount = this.calculateCustomerDiscount(customerId);
    const finalAmount = amount.subtract(discount);

    // Stripe integration - this is correct
    const charge = await this.stripe.charges.create({
      amount: finalAmount.cents,
      currency: finalAmount.currency,
      customer: customerId.value
    });

    return PaymentResult.success(charge.id, finalAmount);
  }
}

// ✅ DO: Focus on external service integration
export class StripePaymentService implements IPaymentService {
  async chargeCustomer(customerId: CustomerId, amount: Money): Promise<PaymentResult> {
    try {
      const charge = await this.stripe.charges.create({
        amount: amount.cents,
        currency: amount.currency,
        customer: customerId.value
      });

      return PaymentResult.success(charge.id, amount);
    } catch (error) {
      return PaymentResult.failure(this.mapStripeError(error));
    }
  }
}
```

## File Organization

```
src/implementations/
├── repositories/
│   ├── postgres/
│   │   ├── postgres-user.repository.ts
│   │   ├── postgres-order.repository.ts
│   │   └── postgres-connection.ts
│   ├── mongodb/
│   │   ├── mongo-user.repository.ts
│   │   ├── mongo-order.repository.ts
│   │   └── mongo-connection.ts
│   └── memory/
│       ├── memory-user.repository.ts
│       └── memory-order.repository.ts
├── services/
│   ├── email/
│   │   ├── smtp-email.service.ts
│   │   ├── sendgrid-email.service.ts
│   │   └── console-email.service.ts
│   ├── payment/
│   │   ├── stripe-payment.service.ts
│   │   ├── paypal-payment.service.ts
│   │   └── mock-payment.service.ts
│   └── notification/
│       ├── sms-notification.service.ts
│       └── push-notification.service.ts
├── infrastructure/
│   ├── event-bus/
│   │   ├── redis-event-bus.ts
│   │   └── memory-event-bus.ts
│   ├── logger/
│   │   ├── winston-logger.ts
│   │   └── console-logger.ts
│   └── cache/
│       ├── redis-cache.ts
│       └── memory-cache.ts
├── external-apis/
│   ├── geocoding.service.ts
│   ├── analytics.service.ts
│   └── third-party-integrations.ts
└── shared/
    ├── database-error.ts
    ├── connection-managers.ts
    └── common-mappers.ts
```

## Testing Implementations

### Unit Testing
```typescript
describe('PostgresUserRepository', () => {
  let repository: PostgresUserRepository;
  let mockDb: jest.Mocked<Pool>;
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    mockDb = {
      connect: jest.fn(),
      query: jest.fn()
    } as any;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn()
    } as any;

    repository = new PostgresUserRepository(mockDb, mockLogger);
  });

  it('should save user successfully', async () => {
    const user = createTestUser();
    const mockClient = {
      query: jest.fn().mockResolvedValue({}),
      release: jest.fn()
    };

    mockDb.connect.mockResolvedValue(mockClient as any);

    await repository.save(user);

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.any(Array)
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should handle database errors gracefully', async () => {
    const user = createTestUser();
    const dbError = new Error('Connection failed');

    mockDb.connect.mockRejectedValue(dbError);

    await expect(repository.save(user)).rejects.toThrow(DatabaseError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to save user',
      expect.objectContaining({ error: dbError.message })
    );
  });
});
```

### Integration Testing
```typescript
describe('StripePaymentService Integration', () => {
  let paymentService: StripePaymentService;
  let stripe: Stripe;

  beforeAll(() => {
    stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY!, {
      apiVersion: '2023-10-16'
    });

    paymentService = new StripePaymentService(stripe, mockLogger);
  });

  it('should process payment successfully', async () => {
    const customerId = CustomerId.fromString('cus_test_customer');
    const amount = new Money(10.00, 'USD');

    const result = await paymentService.chargeCustomer(customerId, amount);

    expect(result.success).toBe(true);
    expect(result.paymentId).toBeDefined();
    expect(result.amount.equals(amount)).toBe(true);
  });

  it('should handle payment failures', async () => {
    const customerId = CustomerId.fromString('cus_invalid_customer');
    const amount = new Money(10.00, 'USD');

    const result = await paymentService.chargeCustomer(customerId, amount);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBeDefined();
  });
});
```

The Implementations layer bridges the gap between your business logic and the outside world—focus on reliable, efficient technical implementations while keeping business concerns in other layers.