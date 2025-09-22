# Operators Layer Guidelines

## Purpose
The Operators layer orchestrates business logic by coordinating between Core Abstractions (entities, value objects) and external dependencies (through ports). This is where business workflows and use cases are implemented.

## Core Responsibilities

### 1. **Business Logic Orchestration**
- Coordinate multiple entities and value objects
- Implement business workflows and use cases
- Enforce business rules and validation
- Handle business transactions

### 2. **Dependency Coordination**
- Use ports to access external services
- Coordinate between different repositories
- Manage cross-cutting concerns (events, logging)
- Handle error scenarios and recovery

### 3. **Data Transformation**
- Convert DTOs to entities and vice versa
- Aggregate data from multiple sources
- Apply business calculations and transformations
- Prepare data for external consumption

## Implementation Guidelines

### ✅ What Belongs in Operators Layer

#### Business Use Case Implementation
```typescript
// User management operator
export class UserOperator {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly emailService: IEmailService,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger
  ) {}

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    this.logger.info('Creating new user', { email: dto.email });

    try {
      // Business validation
      await this.validateUniqueEmail(dto.email);
      await this.validateEmailDeliverability(dto.email);

      // Entity creation (delegates to Core Abstractions)
      const user = User.create(dto);

      // Persistence coordination
      await this.userRepository.save(user);

      // Business event emission
      await this.eventBus.emit(new UserRegisteredEvent(
        user.id.value,
        user.email.value,
        user.fullName.value
      ));

      // External service coordination
      await this.sendWelcomeNotification(user);

      this.logger.info('User created successfully', { userId: user.id.value });

      // Response transformation
      return this.mapToResponseDto(user);
    } catch (error) {
      this.logger.error('Failed to create user', { error: error.message, email: dto.email });
      throw new BusinessError('User creation failed', error.message);
    }
  }

  async updateUserEmail(id: string, newEmail: string): Promise<UserResponseDto> {
    this.logger.info('Updating user email', { userId: id, newEmail });

    // Validation
    await this.validateUniqueEmail(newEmail);
    const email = new Email(newEmail);

    // Entity retrieval and business operation
    const user = await this.findUserById(id);
    const oldEmail = user.email.value;
    const updatedUser = user.updateEmail(email);

    // Persistence
    await this.userRepository.save(updatedUser);

    // Business event
    await this.eventBus.emit(new UserEmailUpdatedEvent(
      user.id.value,
      oldEmail,
      newEmail
    ));

    // External service coordination
    await this.emailService.sendEmailChangeConfirmation(email, updatedUser.fullName.value);

    return this.mapToResponseDto(updatedUser);
  }

  async deactivateUser(id: string, reason: DeactivationReason): Promise<UserResponseDto> {
    const user = await this.findUserById(id);

    // Business rule validation
    if (!user.isActive) {
      throw new BusinessError('User is already deactivated');
    }

    // Business operation
    const deactivatedUser = user.deactivate(reason);

    // Persistence
    await this.userRepository.save(deactivatedUser);

    // Business event
    await this.eventBus.emit(new UserDeactivatedEvent(
      user.id.value,
      reason
    ));

    // Clean up related data
    await this.cleanupUserSessions(user.id);

    return this.mapToResponseDto(deactivatedUser);
  }

  async upgradeToVip(id: string): Promise<UserResponseDto> {
    const user = await this.findUserById(id);

    // Business eligibility check
    if (!user.isEligibleForVipStatus()) {
      throw new BusinessError('User is not eligible for VIP status');
    }

    // Business operation
    const vipBenefits = VipBenefits.standard();
    const vipUser = user.upgradeToVip(vipBenefits);

    // Persistence
    await this.userRepository.save(vipUser);

    // Business event
    await this.eventBus.emit(new UserUpgradedToVipEvent(
      user.id.value,
      'STANDARD',
      vipBenefits
    ));

    // External service coordination
    await this.emailService.sendVipUpgradeNotification(vipUser.email, vipBenefits);

    return this.mapToResponseDto(vipUser);
  }

  // Complex business query with aggregation
  async getUserSummary(id: string): Promise<UserSummaryDto> {
    const user = await this.findUserById(id);

    // Aggregate data from multiple sources
    const [orders, preferences, activitySummary] = await Promise.all([
      this.orderRepository.findByCustomerId(user.id),
      this.userPreferencesRepository.findByUserId(user.id),
      this.activityService.getUserActivitySummary(user.id)
    ]);

    // Business calculations
    const totalSpent = orders.reduce((sum, order) => sum.add(order.total), Money.zero());
    const orderCount = orders.length;
    const averageOrderValue = orderCount > 0 ? totalSpent.divide(orderCount) : Money.zero();

    return {
      user: this.mapToResponseDto(user),
      statistics: {
        totalOrders: orderCount,
        totalSpent: totalSpent.value,
        averageOrderValue: averageOrderValue.value,
        lastOrderDate: orders[0]?.createdAt.toISOString()
      },
      preferences: this.mapPreferencesToDto(preferences),
      activity: activitySummary
    };
  }

  // Business validation methods
  private async validateUniqueEmail(email: string): Promise<void> {
    const existingUser = await this.userRepository.findByEmail(new Email(email));
    if (existingUser) {
      throw new BusinessError('Email address is already registered');
    }
  }

  private async validateEmailDeliverability(email: string): Promise<void> {
    const emailObj = new Email(email);
    const isDeliverable = await this.emailService.isEmailDeliverable(emailObj);
    if (!isDeliverable) {
      throw new BusinessError('Email address is not deliverable');
    }
  }

  // Helper methods
  private async findUserById(id: string): Promise<User> {
    const user = await this.userRepository.findById(UserId.fromString(id));
    if (!user) {
      throw new BusinessError('User not found');
    }
    return user;
  }

  private async sendWelcomeNotification(user: User): Promise<void> {
    try {
      await this.emailService.sendWelcomeEmail(user.email, user.fullName.value);
    } catch (error) {
      // Log but don't fail user creation for notification failure
      this.logger.warn('Failed to send welcome email', {
        userId: user.id.value,
        error: error.message
      });
    }
  }

  private async cleanupUserSessions(userId: UserId): Promise<void> {
    try {
      await this.sessionService.invalidateUserSessions(userId);
    } catch (error) {
      this.logger.warn('Failed to cleanup user sessions', {
        userId: userId.value,
        error: error.message
      });
    }
  }

  // Data transformation methods
  private mapToResponseDto(user: User): UserResponseDto {
    return {
      id: user.id.value,
      email: user.email.value,
      fullName: user.fullName.value,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString()
    };
  }
}
```

#### Complex Business Workflow Orchestration
```typescript
// Order processing operator with complex workflow
export class OrderOperator {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly inventoryService: IInventoryService,
    private readonly paymentService: IPaymentService,
    private readonly shippingService: IShippingService,
    private readonly notificationService: INotificationService,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger
  ) {}

  async processOrder(dto: CreateOrderDto): Promise<OrderResponseDto> {
    const orderId = OrderId.generate();
    this.logger.info('Processing new order', { orderId: orderId.value });

    try {
      // Step 1: Business validation
      await this.validateOrderItems(dto.items);
      await this.validateShippingAddress(dto.shippingAddress);

      // Step 2: Inventory check and reservation
      const inventoryResults = await this.reserveInventory(dto.items);
      if (!inventoryResults.allItemsAvailable) {
        throw new BusinessError('Some items are not available in requested quantities');
      }

      // Step 3: Create order entity
      const order = Order.create(dto);

      // Step 4: Payment processing
      const paymentResult = await this.processPayment(order);
      if (!paymentResult.success) {
        // Rollback inventory reservation
        await this.releaseInventoryReservation(inventoryResults.reservationId);
        throw new BusinessError('Payment processing failed');
      }

      // Step 5: Confirm order
      const confirmedOrder = order.confirm();

      // Step 6: Persistence
      await this.orderRepository.save(confirmedOrder);

      // Step 7: Business events
      await this.emitOrderEvents(confirmedOrder, paymentResult);

      // Step 8: External service coordination
      await this.coordinatePostOrderServices(confirmedOrder);

      this.logger.info('Order processed successfully', { orderId: order.id.value });

      return this.mapToResponseDto(confirmedOrder);
    } catch (error) {
      this.logger.error('Order processing failed', {
        orderId: orderId.value,
        error: error.message
      });

      // Ensure cleanup on failure
      await this.handleOrderProcessingFailure(orderId, error);
      throw error;
    }
  }

  async cancelOrder(id: string, reason: CancellationReason): Promise<OrderResponseDto> {
    const order = await this.findOrderById(id);

    // Business rule validation
    if (!order.canBeCancelled()) {
      throw new BusinessError('Order cannot be cancelled in its current status');
    }

    // Business operation
    const cancelledOrder = order.cancel(reason);

    // Coordinate cancellation workflow
    await this.coordinateCancellation(cancelledOrder, reason);

    // Persistence
    await this.orderRepository.save(cancelledOrder);

    // Business event
    await this.eventBus.emit(new OrderCancelledEvent(
      order.id.value,
      reason,
      order.total.value
    ));

    return this.mapToResponseDto(cancelledOrder);
  }

  async shipOrder(id: string, trackingNumber: string): Promise<OrderResponseDto> {
    const order = await this.findOrderById(id);

    // Business validation
    if (order.status !== OrderStatus.CONFIRMED) {
      throw new BusinessError('Only confirmed orders can be shipped');
    }

    // Business operation
    const shippedOrder = order.ship(trackingNumber);

    // External service coordination
    await this.shippingService.createShipment({
      orderId: order.id.value,
      trackingNumber,
      items: order.items,
      shippingAddress: order.shippingAddress
    });

    // Persistence
    await this.orderRepository.save(shippedOrder);

    // Business event
    await this.eventBus.emit(new OrderShippedEvent(
      order.id.value,
      trackingNumber,
      'FedEx'
    ));

    // Customer notification
    await this.notificationService.notifyOrderShipped(
      order.customerId,
      order.id,
      trackingNumber
    );

    return this.mapToResponseDto(shippedOrder);
  }

  // Complex business query with calculations
  async getOrderAnalytics(customerId: string, period: AnalyticsPeriod): Promise<OrderAnalyticsDto> {
    const orders = await this.orderRepository.findByCustomerIdInPeriod(
      CustomerId.fromString(customerId),
      period.startDate,
      period.endDate
    );

    // Business calculations
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum.add(order.total), Money.zero());
    const averageOrderValue = totalOrders > 0 ? totalRevenue.divide(totalOrders) : Money.zero();

    const ordersByStatus = this.groupOrdersByStatus(orders);
    const topItems = await this.calculateTopOrderedItems(orders);

    return {
      period: {
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString()
      },
      summary: {
        totalOrders,
        totalRevenue: totalRevenue.value,
        averageOrderValue: averageOrderValue.value
      },
      statusBreakdown: ordersByStatus,
      topItems
    };
  }

  // Private workflow coordination methods
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

  private async validateShippingAddress(address: CreateAddressDto): Promise<void> {
    const addressObj = Address.fromDto(address);
    const isValid = await this.shippingService.validateAddress(addressObj);
    if (!isValid) {
      throw new BusinessError('Invalid shipping address');
    }
  }

  private async reserveInventory(items: CreateOrderItemDto[]): Promise<InventoryReservationResult> {
    const reservationRequests = items.map(item => ({
      productId: item.productId,
      quantity: item.quantity
    }));

    return await this.inventoryService.reserveItems(reservationRequests);
  }

  private async processPayment(order: Order): Promise<PaymentResult> {
    return await this.paymentService.chargeCustomer(
      order.customerId,
      order.total
    );
  }

  private async emitOrderEvents(order: Order, paymentResult: PaymentResult): Promise<void> {
    await Promise.all([
      this.eventBus.emit(new OrderCreatedEvent(
        order.id.value,
        order.customerId.value,
        order.total.value,
        order.total.currency
      )),
      this.eventBus.emit(new OrderConfirmedEvent(
        order.id.value,
        new Date()
      )),
      this.eventBus.emit(new PaymentProcessedEvent(
        paymentResult.paymentId,
        order.total.value
      ))
    ]);
  }

  private async coordinatePostOrderServices(order: Order): Promise<void> {
    // Run these in parallel as they're independent
    await Promise.allSettled([
      this.notificationService.notifyOrderConfirmation(order.customerId, order.id),
      this.updateCustomerLoyaltyPoints(order),
      this.triggerInventoryReorder(order.items)
    ]);
  }

  private async coordinateCancellation(order: Order, reason: CancellationReason): Promise<void> {
    // Coordinate cancellation workflow
    await Promise.all([
      this.refundPayment(order),
      this.releaseInventory(order.items),
      this.notificationService.notifyOrderCancellation(order.customerId, order.id, reason)
    ]);
  }

  private async handleOrderProcessingFailure(orderId: OrderId, error: Error): Promise<void> {
    // Cleanup logic for failed order processing
    try {
      // Log the failure for business analysis
      await this.eventBus.emit(new OrderProcessingFailedEvent(
        orderId.value,
        error.message,
        new Date()
      ));
    } catch (cleanupError) {
      this.logger.error('Failed to cleanup after order processing failure', {
        orderId: orderId.value,
        originalError: error.message,
        cleanupError: cleanupError.message
      });
    }
  }

  // Helper business methods
  private async findOrderById(id: string): Promise<Order> {
    const order = await this.orderRepository.findById(OrderId.fromString(id));
    if (!order) {
      throw new BusinessError('Order not found');
    }
    return order;
  }

  private groupOrdersByStatus(orders: Order[]): Record<string, number> {
    return orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private async calculateTopOrderedItems(orders: Order[]): Promise<TopItemDto[]> {
    const itemCounts = new Map<string, number>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const current = itemCounts.get(item.productId) || 0;
        itemCounts.set(item.productId, current + item.quantity);
      });
    });

    return Array.from(itemCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([productId, quantity]) => ({ productId, quantity }));
  }

  private mapToResponseDto(order: Order): OrderResponseDto {
    return {
      id: order.id.value,
      customerId: order.customerId.value,
      status: order.status,
      total: order.total.value,
      currency: order.total.currency,
      items: order.items.map(item => this.mapItemToDto(item)),
      shippingAddress: this.mapAddressToDto(order.shippingAddress),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    };
  }
}
```

#### Business Event Handling
```typescript
// Event-driven business operations
export class UserEventOperator {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly loyaltyService: ILoyaltyService,
    private readonly analyticsService: IAnalyticsService,
    private readonly marketingService: IMarketingService,
    private readonly logger: ILogger
  ) {}

  @EventHandler(UserRegisteredEvent)
  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    this.logger.info('Handling user registered event', { userId: event.userId });

    try {
      // Business operations triggered by user registration
      await Promise.allSettled([
        this.createLoyaltyAccount(event.userId),
        this.trackRegistrationMetrics(event),
        this.enrollInWelcomeCampaign(event.userId, event.email),
        this.setupDefaultPreferences(event.userId)
      ]);
    } catch (error) {
      this.logger.error('Failed to handle user registered event', {
        userId: event.userId,
        error: error.message
      });
      // Don't throw - event handling should be resilient
    }
  }

  @EventHandler(UserUpgradedToVipEvent)
  async handleUserUpgradedToVip(event: UserUpgradedToVipEvent): Promise<void> {
    this.logger.info('Handling VIP upgrade event', { userId: event.userId });

    try {
      // Business operations for VIP upgrade
      await Promise.all([
        this.upgradeUserLoyaltyTier(event.userId),
        this.enrollInVipPrograms(event.userId),
        this.updatePersonalizationProfile(event.userId, 'VIP'),
        this.trackVipUpgradeMetrics(event)
      ]);
    } catch (error) {
      this.logger.error('Failed to handle VIP upgrade event', {
        userId: event.userId,
        error: error.message
      });
    }
  }

  @EventHandler(OrderCreatedEvent)
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    this.logger.info('Handling order created event', { orderId: event.orderId });

    try {
      // Business operations triggered by order creation
      await Promise.allSettled([
        this.updateCustomerOrderHistory(event.customerId, event.orderId),
        this.calculateLoyaltyPoints(event.customerId, event.totalAmount),
        this.updateInventoryMetrics(event.orderId),
        this.triggerRecommendationUpdate(event.customerId)
      ]);
    } catch (error) {
      this.logger.error('Failed to handle order created event', {
        orderId: event.orderId,
        error: error.message
      });
    }
  }

  // Private business operation methods
  private async createLoyaltyAccount(userId: string): Promise<void> {
    await this.loyaltyService.createAccount({
      userId,
      tier: 'BRONZE',
      points: 0
    });
  }

  private async trackRegistrationMetrics(event: UserRegisteredEvent): Promise<void> {
    await this.analyticsService.track('user_registered', {
      userId: event.userId,
      email: event.email,
      timestamp: event.occurredAt
    });
  }

  private async enrollInWelcomeCampaign(userId: string, email: string): Promise<void> {
    await this.marketingService.enrollInCampaign({
      userId,
      email,
      campaignType: 'WELCOME_SERIES'
    });
  }
}
```

### ❌ What Does NOT Belong in Operators Layer

#### Direct Infrastructure Implementation
```typescript
// ❌ DON'T: Database queries in operators
export class UserOperator {
  constructor(private readonly database: Pool) {}

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    // Direct SQL in operator - belongs in implementations
    const query = `
      INSERT INTO users (id, email, full_name, birth_date, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await this.database.query(query, [
      uuidv4(),
      dto.email,
      dto.fullName,
      dto.birthDate,
      true,
      new Date()
    ]);

    return this.mapRowToDto(result.rows[0]);
  }
}

// ✅ DO: Use abstractions
export class UserOperator {
  constructor(private readonly userRepository: IUserRepository) {}

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    const user = User.create(dto);
    await this.userRepository.save(user);
    return this.mapToResponseDto(user);
  }
}
```

#### HTTP/Protocol Concerns
```typescript
// ❌ DON'T: HTTP concerns in operators
export class UserOperator {
  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const dto = req.body as CreateUserDto;

      // HTTP-specific validation
      if (!req.headers['content-type']?.includes('application/json')) {
        res.status(400).json({ error: 'Content-Type must be application/json' });
        return;
      }

      const user = User.create(dto);
      await this.userRepository.save(user);

      // HTTP response handling
      res.status(201).json({
        success: true,
        data: this.mapToResponseDto(user)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

// ✅ DO: Focus on business logic
export class UserOperator {
  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    const user = User.create(dto);
    await this.userRepository.save(user);
    return this.mapToResponseDto(user);
  }
}
```

#### Complex Infrastructure Configuration
```typescript
// ❌ DON'T: Infrastructure setup in operators
export class EmailOperator {
  private transporter: nodemailer.Transporter;

  constructor() {
    // SMTP configuration belongs in implementations/bootstrap
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    await this.transporter.sendMail({ to, subject, html: body });
  }
}

// ✅ DO: Use abstraction
export class UserOperator {
  constructor(private readonly emailService: IEmailService) {}

  async sendWelcomeEmail(user: User): Promise<void> {
    await this.emailService.sendWelcomeEmail(user.email, user.fullName.value);
  }
}
```

## File Organization

```
src/operators/
├── user.operator.ts
├── order.operator.ts
├── payment.operator.ts
├── inventory.operator.ts
├── notification.operator.ts
├── analytics.operator.ts
├── event-handlers/
│   ├── user-event.operator.ts
│   ├── order-event.operator.ts
│   └── payment-event.operator.ts
├── shared/
│   ├── business-error.ts
│   ├── validation-helpers.ts
│   └── common-mappings.ts
└── types/
    ├── operator-dtos.ts
    └── business-types.ts
```

## Testing Operators

### Unit Testing
```typescript
describe('UserOperator', () => {
  let userOperator: UserOperator;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockEmailService: jest.Mocked<IEmailService>;
  let mockEventBus: jest.Mocked<IEventBus>;

  beforeEach(() => {
    mockUserRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn()
    } as any;

    mockEmailService = {
      sendWelcomeEmail: jest.fn(),
      isEmailDeliverable: jest.fn()
    } as any;

    mockEventBus = {
      emit: jest.fn()
    } as any;

    userOperator = new UserOperator(
      mockUserRepository,
      mockEmailService,
      mockEventBus
    );
  });

  it('should create user successfully', async () => {
    // Arrange
    mockUserRepository.findByEmail.mockResolvedValue(null);
    mockEmailService.isEmailDeliverable.mockResolvedValue(true);

    const dto: CreateUserDto = {
      email: 'test@example.com',
      fullName: 'Test User',
      birthDate: '1990-01-01'
    };

    // Act
    const result = await userOperator.createUser(dto);

    // Assert
    expect(result.email).toBe(dto.email);
    expect(mockUserRepository.save).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.any(UserRegisteredEvent)
    );
  });

  it('should handle business rule violations', async () => {
    // Arrange
    mockUserRepository.findByEmail.mockResolvedValue(existingUser);

    const dto: CreateUserDto = {
      email: 'existing@example.com',
      fullName: 'Test User',
      birthDate: '1990-01-01'
    };

    // Act & Assert
    await expect(userOperator.createUser(dto))
      .rejects
      .toThrow('Email address is already registered');

    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });

  it('should handle external service failures gracefully', async () => {
    // Arrange
    mockUserRepository.findByEmail.mockResolvedValue(null);
    mockEmailService.isEmailDeliverable.mockResolvedValue(true);
    mockEmailService.sendWelcomeEmail.mockRejectedValue(new Error('SMTP Error'));

    const dto: CreateUserDto = {
      email: 'test@example.com',
      fullName: 'Test User',
      birthDate: '1990-01-01'
    };

    // Act
    const result = await userOperator.createUser(dto);

    // Assert - User should still be created even if email fails
    expect(result.email).toBe(dto.email);
    expect(mockUserRepository.save).toHaveBeenCalledTimes(1);
  });
});
```

### Integration Testing
```typescript
describe('UserOperator Integration', () => {
  let userOperator: UserOperator;
  let testContainer: Container;

  beforeAll(async () => {
    testContainer = await createTestContainer();
    userOperator = testContainer.get<UserOperator>('UserOperator');
  });

  it('should handle complete user lifecycle', async () => {
    // Create user
    const createDto: CreateUserDto = {
      email: 'integration@example.com',
      fullName: 'Integration Test',
      birthDate: '1990-01-01'
    };

    const createdUser = await userOperator.createUser(createDto);
    expect(createdUser.email).toBe(createDto.email);

    // Update email
    const updatedUser = await userOperator.updateUserEmail(
      createdUser.id,
      'updated@example.com'
    );
    expect(updatedUser.email).toBe('updated@example.com');

    // Deactivate user
    const deactivatedUser = await userOperator.deactivateUser(
      createdUser.id,
      'INTEGRATION_TEST'
    );
    expect(deactivatedUser.isActive).toBe(false);
  });
});
```

The Operators layer is where business logic comes to life—focus on orchestration, coordination, and business workflows while delegating technical concerns to other layers.