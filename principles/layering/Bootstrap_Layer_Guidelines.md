# Bootstrap Layer Guidelines

## Purpose
The Bootstrap layer is responsible for application startup, dependency injection configuration, and wiring all the layers together. This is where the entire ADD architecture comes to life through proper dependency resolution.

## Core Responsibilities

### 1. **Dependency Injection Configuration**
- Register all implementations against their interfaces
- Configure service lifetimes (singleton, transient, scoped)
- Set up complex dependency graphs
- Handle conditional registrations based on environment

### 2. **Application Initialization**
- Database connections and migrations
- External service configurations
- Infrastructure setup (logging, monitoring, caching)
- Health checks and readiness probes

### 3. **Environment-Specific Configuration**
- Development, testing, staging, production configurations
- Feature flags and toggles
- Configuration validation
- Secrets management

## Implementation Guidelines

### ✅ What Belongs in Bootstrap Layer

#### Main DI Container Configuration
```typescript
// Main container configuration
export class DIContainer {
  static create(environment: Environment): Container {
    const container = new Container();

    // Configure based on environment
    switch (environment) {
      case Environment.DEVELOPMENT:
        return this.configureDevelopment(container);
      case Environment.TESTING:
        return this.configureTesting(container);
      case Environment.STAGING:
        return this.configureStaging(container);
      case Environment.PRODUCTION:
        return this.configureProduction(container);
      default:
        throw new Error(`Unsupported environment: ${environment}`);
    }
  }

  // Development configuration - fast, local services
  private static configureDevelopment(container: Container): Container {
    // Infrastructure
    this.configureInfrastructure(container, {
      database: 'in-memory',
      cache: 'in-memory',
      eventBus: 'in-memory',
      logger: 'console'
    });

    // Repositories - fast in-memory implementations
    container.bind<IUserRepository>('IUserRepository')
      .to(InMemoryUserRepository)
      .inSingletonScope();

    container.bind<IOrderRepository>('IOrderRepository')
      .to(InMemoryOrderRepository)
      .inSingletonScope();

    // Services - mock/console implementations
    container.bind<IEmailService>('IEmailService')
      .to(ConsoleEmailService)
      .inSingletonScope();

    container.bind<IPaymentService>('IPaymentService')
      .toDynamicValue(() => {
        const mockService = new MockPaymentService();
        mockService.setSuccessMode(true); // Always succeed in development
        return mockService;
      })
      .inSingletonScope();

    container.bind<INotificationService>('INotificationService')
      .to(ConsoleNotificationService)
      .inSingletonScope();

    // Register business logic
    this.registerOperators(container);
    this.registerEventHandlers(container);

    return container;
  }

  // Testing configuration - deterministic, isolated
  private static configureTesting(container: Container): Container {
    // Infrastructure for testing
    this.configureInfrastructure(container, {
      database: 'in-memory',
      cache: 'in-memory',
      eventBus: 'synchronous',
      logger: 'null'
    });

    // Repositories - in-memory for isolation
    container.bind<IUserRepository>('IUserRepository')
      .to(InMemoryUserRepository)
      .inTransientScope(); // New instance per test

    container.bind<IOrderRepository>('IOrderRepository')
      .to(InMemoryOrderRepository)
      .inTransientScope();

    // Services - spy/mock implementations
    container.bind<IEmailService>('IEmailService')
      .to(SpyEmailService) // Captures calls for assertions
      .inTransientScope();

    container.bind<IPaymentService>('IPaymentService')
      .to(MockPaymentService)
      .inTransientScope();

    container.bind<INotificationService>('INotificationService')
      .to(SpyNotificationService)
      .inTransientScope();

    this.registerOperators(container);
    this.registerEventHandlers(container);

    return container;
  }

  // Staging configuration - production-like but safe
  private static configureStaging(container: Container): Container {
    // Infrastructure
    this.configureInfrastructure(container, {
      database: 'postgres',
      cache: 'redis',
      eventBus: 'redis',
      logger: 'structured'
    });

    // Repositories - real database with staging data
    container.bind<IUserRepository>('IUserRepository')
      .toDynamicValue((context) => {
        const db = context.container.get<Pool>('DatabasePool');
        const logger = context.container.get<ILogger>('Logger');
        return new PostgresUserRepository(db, logger);
      })
      .inSingletonScope();

    container.bind<IOrderRepository>('IOrderRepository')
      .toDynamicValue((context) => {
        const db = context.container.get<Pool>('DatabasePool');
        const logger = context.container.get<ILogger>('Logger');
        return new PostgresOrderRepository(db, logger);
      })
      .inSingletonScope();

    // Services - staging/sandbox versions
    container.bind<IEmailService>('IEmailService')
      .toDynamicValue((context) => {
        const config = context.container.get<EmailConfig>('EmailConfig');
        const logger = context.container.get<ILogger>('Logger');
        // Use email service that prefixes subject with [STAGING]
        return new StagingEmailService(config, logger);
      })
      .inSingletonScope();

    container.bind<IPaymentService>('IPaymentService')
      .toDynamicValue((context) => {
        const logger = context.container.get<ILogger>('Logger');
        // Use Stripe test mode
        const stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY!, {
          apiVersion: '2023-10-16'
        });
        return new StripePaymentService(stripe, logger);
      })
      .inSingletonScope();

    this.registerOperators(container);
    this.registerEventHandlers(container);

    return container;
  }

  // Production configuration - real services, monitoring
  private static configureProduction(container: Container): Container {
    // Infrastructure
    this.configureInfrastructure(container, {
      database: 'postgres',
      cache: 'redis',
      eventBus: 'redis',
      logger: 'structured',
      monitoring: true,
      healthChecks: true
    });

    // Repositories - production database with connection pooling
    container.bind<IUserRepository>('IUserRepository')
      .toDynamicValue((context) => {
        const db = context.container.get<Pool>('DatabasePool');
        const logger = context.container.get<ILogger>('Logger');
        const cache = context.container.get<ICache>('Cache');
        // Wrap with caching decorator
        const baseRepo = new PostgresUserRepository(db, logger);
        return new CachedUserRepository(baseRepo, cache, logger);
      })
      .inSingletonScope();

    container.bind<IOrderRepository>('IOrderRepository')
      .toDynamicValue((context) => {
        const db = context.container.get<Pool>('DatabasePool');
        const logger = context.container.get<ILogger>('Logger');
        const metrics = context.container.get<IMetrics>('Metrics');
        // Wrap with metrics decorator
        const baseRepo = new PostgresOrderRepository(db, logger);
        return new MetricsOrderRepository(baseRepo, metrics);
      })
      .inSingletonScope();

    // Services - production implementations with monitoring
    container.bind<IEmailService>('IEmailService')
      .toDynamicValue((context) => {
        const logger = context.container.get<ILogger>('Logger');
        const metrics = context.container.get<IMetrics>('Metrics');

        if (process.env.EMAIL_PROVIDER === 'sendgrid') {
          const client = context.container.get<SendGridClient>('SendGridClient');
          const config = context.container.get<EmailConfig>('EmailConfig');
          const baseService = new SendGridEmailService(client, config, logger);
          return new MetricsEmailService(baseService, metrics);
        } else {
          const transporter = context.container.get<nodemailer.Transporter>('EmailTransporter');
          const config = context.container.get<EmailConfig>('EmailConfig');
          const baseService = new SmtpEmailService(transporter, config, logger);
          return new MetricsEmailService(baseService, metrics);
        }
      })
      .inSingletonScope();

    container.bind<IPaymentService>('IPaymentService')
      .toDynamicValue((context) => {
        const logger = context.container.get<ILogger>('Logger');
        const metrics = context.container.get<IMetrics>('Metrics');

        if (process.env.PAYMENT_PROVIDER === 'stripe') {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: '2023-10-16'
          });
          const baseService = new StripePaymentService(stripe, logger);
          return new MetricsPaymentService(baseService, metrics);
        } else if (process.env.PAYMENT_PROVIDER === 'paypal') {
          const paypal = context.container.get<PayPalClient>('PayPalClient');
          const baseService = new PayPalPaymentService(paypal, logger);
          return new MetricsPaymentService(baseService, metrics);
        } else {
          throw new Error('Payment provider not configured');
        }
      })
      .inSingletonScope();

    this.registerOperators(container);
    this.registerEventHandlers(container);

    return container;
  }

  // Infrastructure configuration helper
  private static configureInfrastructure(
    container: Container,
    options: InfrastructureOptions
  ): void {
    // Database configuration
    if (options.database === 'postgres') {
      const dbConfig = this.loadDatabaseConfig();
      container.bind<Pool>('DatabasePool')
        .toConstantValue(new Pool(dbConfig))
        .inSingletonScope();
    }

    // Cache configuration
    if (options.cache === 'redis') {
      const redisConfig = this.loadRedisConfig();
      container.bind<Redis>('RedisClient')
        .toConstantValue(new Redis(redisConfig))
        .inSingletonScope();

      container.bind<ICache>('Cache')
        .toDynamicValue((context) => {
          const redis = context.container.get<Redis>('RedisClient');
          return new RedisCache(redis);
        })
        .inSingletonScope();
    } else if (options.cache === 'in-memory') {
      container.bind<ICache>('Cache')
        .to(InMemoryCache)
        .inSingletonScope();
    }

    // Event bus configuration
    if (options.eventBus === 'redis') {
      container.bind<IEventBus>('EventBus')
        .toDynamicValue((context) => {
          const redis = context.container.get<Redis>('RedisClient');
          const logger = context.container.get<ILogger>('Logger');
          return new RedisEventBus(redis, logger);
        })
        .inSingletonScope();
    } else if (options.eventBus === 'in-memory') {
      container.bind<IEventBus>('EventBus')
        .to(InMemoryEventBus)
        .inSingletonScope();
    } else if (options.eventBus === 'synchronous') {
      container.bind<IEventBus>('EventBus')
        .to(SynchronousEventBus) // For testing
        .inSingletonScope();
    }

    // Logger configuration
    if (options.logger === 'structured') {
      const loggerConfig = this.loadLoggerConfig();
      container.bind<ILogger>('Logger')
        .toConstantValue(winston.createLogger(loggerConfig))
        .inSingletonScope();
    } else if (options.logger === 'console') {
      container.bind<ILogger>('Logger')
        .to(ConsoleLogger)
        .inSingletonScope();
    } else if (options.logger === 'null') {
      container.bind<ILogger>('Logger')
        .to(NullLogger) // Silent for testing
        .inSingletonScope();
    }

    // Monitoring (production only)
    if (options.monitoring) {
      container.bind<IMetrics>('Metrics')
        .toDynamicValue(() => {
          return new PrometheusMetrics({
            host: process.env.METRICS_HOST || 'localhost',
            port: parseInt(process.env.METRICS_PORT || '9090')
          });
        })
        .inSingletonScope();
    }

    // Health checks (production/staging)
    if (options.healthChecks) {
      container.bind<IHealthCheck>('HealthCheck')
        .toDynamicValue((context) => {
          const db = context.container.get<Pool>('DatabasePool');
          const redis = context.container.get<Redis>('RedisClient');
          return new CompositeHealthCheck([
            new DatabaseHealthCheck(db),
            new RedisHealthCheck(redis)
          ]);
        })
        .inSingletonScope();
    }
  }

  // Business logic registration (same across all environments)
  private static registerOperators(container: Container): void {
    container.bind<UserOperator>('UserOperator')
      .toDynamicValue((context) => {
        return new UserOperator(
          context.container.get<IUserRepository>('IUserRepository'),
          context.container.get<IEmailService>('IEmailService'),
          context.container.get<IEventBus>('EventBus'),
          context.container.get<ILogger>('Logger')
        );
      })
      .inSingletonScope();

    container.bind<OrderOperator>('OrderOperator')
      .toDynamicValue((context) => {
        return new OrderOperator(
          context.container.get<IOrderRepository>('IOrderRepository'),
          context.container.get<IInventoryService>('IInventoryService'),
          context.container.get<IPaymentService>('IPaymentService'),
          context.container.get<IShippingService>('IShippingService'),
          context.container.get<INotificationService>('INotificationService'),
          context.container.get<IEventBus>('EventBus'),
          context.container.get<ILogger>('Logger')
        );
      })
      .inSingletonScope();

    // Register other operators...
  }

  // Event handler registration
  private static registerEventHandlers(container: Container): void {
    container.bind<UserEventOperator>('UserEventOperator')
      .toDynamicValue((context) => {
        return new UserEventOperator(
          context.container.get<IUserRepository>('IUserRepository'),
          context.container.get<ILoyaltyService>('ILoyaltyService'),
          context.container.get<IAnalyticsService>('IAnalyticsService'),
          context.container.get<IMarketingService>('IMarketingService'),
          context.container.get<ILogger>('Logger')
        );
      })
      .inSingletonScope();

    // Register other event handlers...
  }

  // Configuration loading helpers
  private static loadDatabaseConfig(): PoolConfig {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app_db',
      user: process.env.DB_USER || 'app_user',
      password: process.env.DB_PASSWORD || 'password',
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000')
    };
  }

  private static loadRedisConfig(): RedisOptions {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    };
  }

  private static loadLoggerConfig(): winston.LoggerOptions {
    return {
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/combined.log'
        })
      ]
    };
  }
}
```

#### Application Startup
```typescript
// Application initialization and startup
export class Application {
  private container: Container;
  private server: Server;
  private isInitialized = false;

  constructor(private readonly environment: Environment) {
    this.container = DIContainer.create(environment);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Application already initialized');
    }

    const logger = this.container.get<ILogger>('Logger');
    logger.info('Initializing application', { environment: this.environment });

    try {
      // Initialize infrastructure
      await this.initializeInfrastructure();

      // Run database migrations
      await this.runDatabaseMigrations();

      // Validate configuration
      await this.validateConfiguration();

      // Set up health checks
      await this.setupHealthChecks();

      // Initialize event handlers
      await this.initializeEventHandlers();

      // Start web server
      await this.startWebServer();

      this.isInitialized = true;
      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Application initialization failed', { error: error.message });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    const logger = this.container.get<ILogger>('Logger');
    logger.info('Shutting down application');

    try {
      // Close web server
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server.close(() => resolve());
        });
      }

      // Close database connections
      await this.closeDatabaseConnections();

      // Close Redis connections
      await this.closeRedisConnections();

      // Stop event processing
      await this.stopEventProcessing();

      logger.info('Application shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      throw error;
    }
  }

  getContainer(): Container {
    if (!this.isInitialized) {
      throw new Error('Application not initialized');
    }
    return this.container;
  }

  private async initializeInfrastructure(): Promise<void> {
    // Test database connection
    if (this.container.isBound('DatabasePool')) {
      const db = this.container.get<Pool>('DatabasePool');
      await db.query('SELECT 1');
    }

    // Test Redis connection
    if (this.container.isBound('RedisClient')) {
      const redis = this.container.get<Redis>('RedisClient');
      await redis.ping();
    }
  }

  private async runDatabaseMigrations(): Promise<void> {
    if (!this.container.isBound('DatabasePool')) {
      return; // Skip if not using database
    }

    const logger = this.container.get<ILogger>('Logger');
    const db = this.container.get<Pool>('DatabasePool');

    logger.info('Running database migrations');

    try {
      const migrator = new DatabaseMigrator(db, logger);
      await migrator.migrate();
      logger.info('Database migrations completed');
    } catch (error) {
      logger.error('Database migration failed', { error: error.message });
      throw error;
    }
  }

  private async validateConfiguration(): Promise<void> {
    const logger = this.container.get<ILogger>('Logger');
    logger.info('Validating configuration');

    const validator = new ConfigurationValidator();

    // Validate required environment variables
    const requiredVars = this.getRequiredEnvironmentVariables();
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Required environment variable ${varName} is not set`);
      }
    }

    // Validate service configurations
    await validator.validateEmailConfiguration();
    await validator.validatePaymentConfiguration();

    logger.info('Configuration validation completed');
  }

  private async setupHealthChecks(): Promise<void> {
    if (!this.container.isBound('HealthCheck')) {
      return; // Skip if health checks not configured
    }

    const healthCheck = this.container.get<IHealthCheck>('HealthCheck');
    const logger = this.container.get<ILogger>('Logger');

    // Run initial health check
    const result = await healthCheck.check();
    if (!result.healthy) {
      throw new Error(`Health check failed: ${result.message}`);
    }

    logger.info('Health checks configured');
  }

  private async initializeEventHandlers(): Promise<void> {
    const eventBus = this.container.get<IEventBus>('EventBus');
    const logger = this.container.get<ILogger>('Logger');

    // Register event handlers
    const userEventOperator = this.container.get<UserEventOperator>('UserEventOperator');
    await eventBus.subscribe('UserRegisteredEvent', userEventOperator.handleUserRegistered.bind(userEventOperator));
    await eventBus.subscribe('UserUpgradedToVipEvent', userEventOperator.handleUserUpgradedToVip.bind(userEventOperator));

    // Register other event handlers...

    logger.info('Event handlers initialized');
  }

  private async startWebServer(): Promise<void> {
    const app = this.createExpressApp();
    const port = parseInt(process.env.PORT || '3000');

    this.server = app.listen(port, () => {
      const logger = this.container.get<ILogger>('Logger');
      logger.info('Web server started', { port });
    });
  }

  private createExpressApp(): Express {
    const app = express();

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Health check endpoint
    if (this.container.isBound('HealthCheck')) {
      const healthCheck = this.container.get<IHealthCheck>('HealthCheck');
      app.get('/health', async (req, res) => {
        const result = await healthCheck.check();
        res.status(result.healthy ? 200 : 503).json(result);
      });
    }

    // API routes
    this.setupRoutes(app);

    // Error handling
    app.use(this.createErrorHandler());

    return app;
  }

  private setupRoutes(app: Express): void {
    const userOperator = this.container.get<UserOperator>('UserOperator');
    const orderOperator = this.container.get<OrderOperator>('OrderOperator');

    // User routes
    const userController = new UserController(userOperator);
    app.post('/api/users', userController.createUser.bind(userController));
    app.get('/api/users/:id', userController.getUser.bind(userController));

    // Order routes
    const orderController = new OrderController(orderOperator);
    app.post('/api/orders', orderController.createOrder.bind(orderController));
    app.get('/api/orders/:id', orderController.getOrder.bind(orderController));
  }

  private createErrorHandler(): ErrorRequestHandler {
    const logger = this.container.get<ILogger>('Logger');

    return (error: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });

      res.status(500).json({
        error: 'Internal server error',
        ...(this.environment === Environment.DEVELOPMENT && { details: error.message })
      });
    };
  }

  private getRequiredEnvironmentVariables(): string[] {
    const baseVars = ['NODE_ENV'];

    switch (this.environment) {
      case Environment.PRODUCTION:
        return [
          ...baseVars,
          'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
          'REDIS_HOST', 'REDIS_PASSWORD',
          'EMAIL_PROVIDER', 'PAYMENT_PROVIDER'
        ];
      case Environment.STAGING:
        return [
          ...baseVars,
          'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
          'REDIS_HOST'
        ];
      default:
        return baseVars;
    }
  }

  private async closeDatabaseConnections(): Promise<void> {
    if (this.container.isBound('DatabasePool')) {
      const db = this.container.get<Pool>('DatabasePool');
      await db.end();
    }
  }

  private async closeRedisConnections(): Promise<void> {
    if (this.container.isBound('RedisClient')) {
      const redis = this.container.get<Redis>('RedisClient');
      redis.disconnect();
    }
  }

  private async stopEventProcessing(): Promise<void> {
    if (this.container.isBound('EventBus')) {
      const eventBus = this.container.get<IEventBus>('EventBus');
      await eventBus.shutdown();
    }
  }
}
```

#### Configuration Management
```typescript
// Configuration validation and management
export class ConfigurationValidator {
  async validateEmailConfiguration(): Promise<void> {
    const provider = process.env.EMAIL_PROVIDER;

    if (!provider) {
      throw new Error('EMAIL_PROVIDER environment variable is required');
    }

    switch (provider) {
      case 'smtp':
        this.validateSmtpConfig();
        break;
      case 'sendgrid':
        this.validateSendGridConfig();
        break;
      default:
        throw new Error(`Unsupported email provider: ${provider}`);
    }
  }

  async validatePaymentConfiguration(): Promise<void> {
    const provider = process.env.PAYMENT_PROVIDER;

    if (!provider) {
      throw new Error('PAYMENT_PROVIDER environment variable is required');
    }

    switch (provider) {
      case 'stripe':
        this.validateStripeConfig();
        break;
      case 'paypal':
        this.validatePayPalConfig();
        break;
      default:
        throw new Error(`Unsupported payment provider: ${provider}`);
    }
  }

  private validateSmtpConfig(): void {
    const requiredVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`SMTP configuration incomplete: ${varName} is required`);
      }
    }
  }

  private validateSendGridConfig(): void {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SendGrid configuration incomplete: SENDGRID_API_KEY is required');
    }
  }

  private validateStripeConfig(): void {
    const secretKey = process.env.NODE_ENV === 'production'
      ? process.env.STRIPE_SECRET_KEY
      : process.env.STRIPE_TEST_SECRET_KEY;

    if (!secretKey) {
      throw new Error('Stripe configuration incomplete: Secret key is required');
    }
  }

  private validatePayPalConfig(): void {
    const requiredVars = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'];
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`PayPal configuration incomplete: ${varName} is required`);
      }
    }
  }
}

// Database migration management
export class DatabaseMigrator {
  constructor(
    private readonly db: Pool,
    private readonly logger: ILogger
  ) {}

  async migrate(): Promise<void> {
    await this.ensureMigrationsTable();

    const appliedMigrations = await this.getAppliedMigrations();
    const availableMigrations = await this.getAvailableMigrations();

    const pendingMigrations = availableMigrations.filter(
      migration => !appliedMigrations.includes(migration.id)
    );

    if (pendingMigrations.length === 0) {
      this.logger.info('No pending migrations');
      return;
    }

    this.logger.info('Applying migrations', { count: pendingMigrations.length });

    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }

    this.logger.info('All migrations applied successfully');
  }

  private async ensureMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.db.query(query);
  }

  private async getAppliedMigrations(): Promise<string[]> {
    const query = 'SELECT id FROM migrations ORDER BY applied_at';
    const result = await this.db.query(query);
    return result.rows.map(row => row.id);
  }

  private async getAvailableMigrations(): Promise<Migration[]> {
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const files = await fs.readdir(migrationsDir);

    return files
      .filter(file => file.endsWith('.sql'))
      .sort()
      .map(file => ({
        id: file.replace('.sql', ''),
        filename: file,
        path: path.join(migrationsDir, file)
      }));
  }

  private async applyMigration(migration: Migration): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Read and execute migration SQL
      const sql = await fs.readFile(migration.path, 'utf8');
      await client.query(sql);

      // Record migration as applied
      await client.query(
        'INSERT INTO migrations (id) VALUES ($1)',
        [migration.id]
      );

      await client.query('COMMIT');

      this.logger.info('Migration applied', { id: migration.id });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Migration failed', {
        id: migration.id,
        error: error.message
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
```

### ❌ What Does NOT Belong in Bootstrap Layer

#### Business Logic
```typescript
// ❌ DON'T: Business logic in bootstrap
export class DIContainer {
  static configure(): Container {
    const container = new Container();

    container.bind<UserOperator>('UserOperator')
      .toDynamicValue((context) => {
        const operator = new UserOperator(/* dependencies */);

        // Business configuration doesn't belong here
        operator.setWelcomeBonusAmount(100);
        operator.configureValidationRules([
          new EmailValidationRule(),
          new AgeValidationRule()
        ]);

        return operator;
      });

    return container;
  }
}

// ✅ DO: Pure dependency wiring
export class DIContainer {
  static configure(): Container {
    const container = new Container();

    container.bind<UserOperator>('UserOperator')
      .toDynamicValue((context) => {
        return new UserOperator(
          context.container.get<IUserRepository>('IUserRepository'),
          context.container.get<IEmailService>('IEmailService'),
          context.container.get<IEventBus>('EventBus'),
          context.container.get<ILogger>('Logger')
        );
      });

    return container;
  }
}
```

#### Request Processing
```typescript
// ❌ DON'T: Request handling in bootstrap
export class Application {
  async initialize(): Promise<void> {
    const app = express();

    // Request processing doesn't belong here
    app.post('/users', async (req, res) => {
      const userOperator = this.container.get<UserOperator>('UserOperator');
      try {
        const user = await userOperator.createUser(req.body);
        res.json(user);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });
  }
}

// ✅ DO: Delegate to proper controllers
export class Application {
  private setupRoutes(app: Express): void {
    const userOperator = this.container.get<UserOperator>('UserOperator');
    const userController = new UserController(userOperator);

    app.post('/api/users', userController.createUser.bind(userController));
  }
}
```

## File Organization

```
src/bootstrap/
├── container.ts              # Main DI configuration
├── application.ts            # Application startup/shutdown
├── config/
│   ├── database.config.ts    # Database configuration
│   ├── redis.config.ts       # Redis configuration
│   ├── email.config.ts       # Email service configuration
│   └── environment.config.ts # Environment-specific settings
├── migration/
│   ├── migrator.ts          # Database migration runner
│   └── health-check.ts      # Health check implementations
├── validation/
│   └── config-validator.ts  # Configuration validation
└── types/
    ├── container.types.ts    # DI container types
    └── environment.types.ts  # Environment definitions
```

## Main Entry Point

```typescript
// src/main.ts
import { Application } from './bootstrap/application';
import { Environment } from './bootstrap/types/environment.types';

async function bootstrap() {
  const environment = process.env.NODE_ENV as Environment || Environment.DEVELOPMENT;
  const app = new Application(environment);

  try {
    await app.initialize();

    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully');
      await app.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully');
      await app.shutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

bootstrap();
```

## Testing Bootstrap Layer

```typescript
describe('DIContainer', () => {
  it('should configure development environment correctly', () => {
    const container = DIContainer.create(Environment.DEVELOPMENT);

    expect(container.get<IUserRepository>('IUserRepository')).toBeInstanceOf(InMemoryUserRepository);
    expect(container.get<IEmailService>('IEmailService')).toBeInstanceOf(ConsoleEmailService);
    expect(container.get<UserOperator>('UserOperator')).toBeInstanceOf(UserOperator);
  });

  it('should configure production environment correctly', () => {
    // Set production environment variables
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'test_db';

    const container = DIContainer.create(Environment.PRODUCTION);

    expect(container.get<IUserRepository>('IUserRepository')).toBeInstanceOf(PostgresUserRepository);
    expect(container.get<UserOperator>('UserOperator')).toBeInstanceOf(UserOperator);
  });
});

describe('Application', () => {
  it('should initialize and shutdown cleanly', async () => {
    const app = new Application(Environment.TESTING);

    await app.initialize();
    expect(app.getContainer()).toBeDefined();

    await app.shutdown();
  });
});
```

The Bootstrap layer is where your ADD architecture comes together—focus on proper dependency wiring and environment configuration while keeping business logic in appropriate layers.