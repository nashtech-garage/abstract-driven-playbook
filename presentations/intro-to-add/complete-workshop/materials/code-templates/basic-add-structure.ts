// ADD Basic Project Structure Template
// Copy this structure to start a new ADD project

// ================================
// 1. BOUNDARY - External contracts
// ================================

// boundary/dto/user.dto.ts
export interface CreateUserDto {
  email: string;
  fullName: string;
  birthDate: string; // ISO string for API stability
}

export interface UserResponseDto {
  id: string;
  email: string;
  fullName: string;
  birthDate: string;
  createdAt: string;
}

// boundary/events/user.events.ts
export class UserCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly timestamp: Date
  ) {}
}

// ================================
// 2. CORE ABSTRACTIONS - Internal contracts
// ================================

// core-abstractions/entities/user.entity.ts
export class User {
  constructor(
    public readonly id: UserId,
    public readonly email: Email,
    public readonly fullName: string,
    public readonly birthDate: Date,
    public readonly createdAt: Date = new Date()
  ) {}

  static create(dto: CreateUserDto): User {
    return new User(
      UserId.generate(),
      new Email(dto.email),
      dto.fullName,
      new Date(dto.birthDate)
    );
  }
}

// core-abstractions/value-objects/user-id.ts
export class UserId {
  constructor(public readonly value: string) {
    if (!value || value.length < 3) {
      throw new Error('Invalid UserId');
    }
  }

  static generate(): UserId {
    return new UserId(crypto.randomUUID());
  }
}

// core-abstractions/value-objects/email.ts
export class Email {
  constructor(public readonly value: string) {
    if (!this.isValid(value)) {
      throw new Error('Invalid email format');
    }
  }

  private isValid(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

// core-abstractions/ports/user.repository.ts
export interface IUserRepository {
  save(user: User): Promise<void>;
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
}

// core-abstractions/events/user.core-events.ts
export class UserValidatedEvent {
  constructor(
    public readonly userId: string,
    public readonly validatedAt: Date
  ) {}
}

// ================================
// 3. OPERATORS - Business orchestration
// ================================

// operators/user.operator.ts
export class UserOperator {
  constructor(
    private userRepository: IUserRepository,
    private eventBus: IEventBus
  ) {}

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    // Validate business rules
    const existingUser = await this.userRepository.findByEmail(new Email(dto.email));
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Create entity
    const user = User.create(dto);

    // Save via repository port
    await this.userRepository.save(user);

    // Emit core event
    await this.eventBus.emit(new UserValidatedEvent(
      user.id.value,
      new Date()
    ));

    // Map entity → response DTO
    return {
      id: user.id.value,
      email: user.email.value,
      fullName: user.fullName,
      birthDate: user.birthDate.toISOString(),
      createdAt: user.createdAt.toISOString()
    };
  }
}

// ================================
// 4. IMPLEMENTATIONS - Technical adapters
// ================================

// implementations/repositories/user.postgres.repository.ts
export class PostgresUserRepository implements IUserRepository {
  constructor(private db: PostgresClient) {}

  async save(user: User): Promise<void> {
    await this.db.query(`
      INSERT INTO users (id, email, full_name, birth_date, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      user.id.value,
      user.email.value,
      user.fullName,
      user.birthDate,
      user.createdAt
    ]);
  }

  async findById(id: UserId): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE id = $1',
      [id.value]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return new User(
      new UserId(row.id),
      new Email(row.email),
      row.full_name,
      new Date(row.birth_date),
      new Date(row.created_at)
    );
  }

  async findByEmail(email: Email): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE email = $1',
      [email.value]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return new User(
      new UserId(row.id),
      new Email(row.email),
      row.full_name,
      new Date(row.birth_date),
      new Date(row.created_at)
    );
  }
}

// implementations/events/in-memory.event-bus.ts
export class InMemoryEventBus implements IEventBus {
  private handlers = new Map<string, Function[]>();

  async emit(event: any): Promise<void> {
    const eventName = event.constructor.name;
    const handlers = this.handlers.get(eventName) || [];

    for (const handler of handlers) {
      await handler(event);
    }
  }

  subscribe(eventName: string, handler: Function): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler);
  }
}

// ================================
// 5. BOOTSTRAP - DI configuration
// ================================

// bootstrap/container.ts
export class DIContainer {
  private bindings = new Map<string, any>();

  bind<T>(token: string, implementation: new (...args: any[]) => T): void {
    this.bindings.set(token, implementation);
  }

  get<T>(token: string): T {
    const Implementation = this.bindings.get(token);
    if (!Implementation) {
      throw new Error(`No binding found for ${token}`);
    }

    // Simple instantiation - in real app, handle dependencies
    return new Implementation();
  }
}

// bootstrap/app.ts
export class App {
  private container = new DIContainer();

  configure(): void {
    // Wire implementations to ports
    this.container.bind('IUserRepository', PostgresUserRepository);
    this.container.bind('IEventBus', InMemoryEventBus);

    // Wire operators
    this.container.bind('UserOperator', UserOperator);
  }

  start(): void {
    this.configure();
    console.log('ADD App started with proper DI wiring');
  }
}

// Usage example:
// const app = new App();
// app.start();