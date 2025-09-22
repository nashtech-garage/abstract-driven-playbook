# Clean Architecture to ADD Migration Example

## Overview
Migration from Clean Architecture to Abstract Driven Development, showing the similarities and key improvements ADD provides.

**Learning Goals:**
- Understand the relationship between Clean Architecture and ADD
- See how ADD simplifies Clean Architecture concepts
- Learn when and why to migrate
- Maintain existing business logic during transition

**Complexity:** ⭐⭐ Beginner-Intermediate
**Time to complete:** 2-3 hours

## Architecture Comparison

### Clean Architecture Structure (Before)
```
user-service-clean/
├── src/
│   ├── entities/
│   │   ├── User.ts                     # Enterprise Business Rules
│   │   └── UserRepository.ts           # Abstract Repository
│   ├── use-cases/
│   │   ├── CreateUser.ts               # Application Business Rules
│   │   ├── GetUser.ts                  # Use Case
│   │   └── UserInteractor.ts           # Use Case Interactor
│   ├── interface-adapters/
│   │   ├── controllers/
│   │   │   └── UserController.ts       # Controller
│   │   ├── presenters/
│   │   │   └── UserPresenter.ts        # Presenter
│   │   └── gateways/
│   │       └── UserRepositoryImpl.ts   # Repository Implementation
│   └── frameworks-drivers/
│       ├── web/
│       │   └── ExpressServer.ts        # Web Framework
│       └── database/
│           └── PostgresConnection.ts   # Database Driver
```

### ADD Structure (After)
```
user-service-add/
├── boundary/
│   ├── dto/
│   │   ├── create-user.dto.ts          # From Controllers/Presenters
│   │   └── user-response.dto.ts
│   └── events/
│       └── user.boundary-events.ts
├── core-abstractions/
│   ├── entities/
│   │   └── user.entity.ts              # From Clean Entities
│   ├── value-objects/
│   │   └── user-id.ts
│   ├── ports/
│   │   └── user.repository.ts          # From Clean Repository Interface
│   └── events/
│       └── user.core-events.ts
├── operators/
│   └── user.operator.ts                # From Use Cases + Interactors
├── implementations/
│   ├── repositories/
│   │   └── user.postgres.repository.ts # From Gateways
│   └── web/
│       └── user.express.controller.ts  # From Controllers
└── bootstrap/
    ├── container.ts                    # New: DI Configuration
    └── app.ts                          # From Frameworks/Drivers
```

## Key Mapping Between Architectures

| Clean Architecture | ADD | Notes |
|-------------------|-----|-------|
| Entities | Core Abstractions/Entities | Keep business rules, simplify structure |
| Use Cases | Operators | Combine use cases and interactors |
| Interface Adapters | Boundary + Implementations | Split into external contracts and technical adapters |
| Frameworks & Drivers | Implementations + Bootstrap | Move config to Bootstrap |
| Repository Interface | Ports | Direct mapping |
| Repository Implementation | Implementations | Direct mapping |

## Migration Steps

### Step 1: Consolidate Use Cases into Operators
**Goal:** Simplify the use case layer

**Before (Clean Architecture):**
```typescript
// use-cases/CreateUser.ts
export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
}

export interface CreateUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

// use-cases/UserInteractor.ts
export class UserInteractor {
  constructor(
    private userRepository: UserRepository,
    private emailValidator: EmailValidator,
    private userPresenter: UserPresenter
  ) {}

  async createUser(request: CreateUserRequest): Promise<CreateUserResponse> {
    // Validation
    if (!this.emailValidator.isValid(request.email)) {
      throw new Error('Invalid email');
    }

    // Check duplicates
    const existingUser = await this.userRepository.findByEmail(request.email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Create entity
    const user = new User(
      generateId(),
      request.email,
      request.firstName,
      request.lastName
    );

    // Save
    await this.userRepository.save(user);

    // Return response
    return this.userPresenter.present(user);
  }
}
```

**After (ADD Operator):**
```typescript
// operators/user.operator.ts
export class UserOperator {
  constructor(
    private userRepository: IUserRepository,
    private emailService: IEmailService,
    private eventBus: IEventBus
  ) {}

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    // Business validation (was in use case)
    const existingUser = await this.userRepository.findByEmail(new Email(dto.email));
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Create entity (was in use case)
    const user = User.create(dto);

    // Save (was in use case)
    await this.userRepository.save(user);

    // Emit event (new - better than presenter pattern)
    await this.eventBus.emit(new UserCreatedEvent(user.id.value));

    // Map to response DTO (was presenter responsibility)
    return {
      id: user.id.value,
      email: user.email.value,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt.toISOString()
    };
  }
}
```

### Step 2: Create Boundary Layer
**Goal:** Stabilize external contracts

**Before (Interface Adapters):**
```typescript
// interface-adapters/controllers/UserController.ts
export class UserController {
  constructor(private userInteractor: UserInteractor) {}

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const request: CreateUserRequest = {
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName
      };

      const response = await this.userInteractor.createUser(request);
      res.status(201).json(response);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}

// interface-adapters/presenters/UserPresenter.ts
export class UserPresenter {
  present(user: User): CreateUserResponse {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    };
  }
}
```

**After (Boundary + Implementation):**
```typescript
// boundary/dto/create-user.dto.ts
export interface CreateUserDto {
  email: string;
  firstName: string;
  lastName: string;
}

// boundary/dto/user-response.dto.ts
export interface UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

// implementations/web/user.express.controller.ts
export class UserExpressController {
  constructor(private userOperator: UserOperator) {}

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      // DTO creation (boundary responsibility)
      const dto: CreateUserDto = {
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName
      };

      // Business operation
      const response = await this.userOperator.createUser(dto);

      // HTTP response (implementation detail)
      res.status(201).json(response);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}
```

### Step 3: Simplify Entity Layer
**Goal:** Keep entities focused on data and basic validation

**Before (Clean Architecture Entity):**
```typescript
// entities/User.ts
export class User {
  constructor(
    public id: string,
    public email: string,
    public firstName: string,
    public lastName: string
  ) {
    this.validateEmail(email);
    this.validateName(firstName, lastName);
  }

  changeEmail(newEmail: string): void {
    this.validateEmail(newEmail);
    this.email = newEmail;
  }

  private validateEmail(email: string): void {
    if (!email.includes('@')) {
      throw new Error('Invalid email format');
    }
  }

  private validateName(firstName: string, lastName: string): void {
    if (!firstName || !lastName) {
      throw new Error('First and last name are required');
    }
  }
}
```

**After (ADD Entity):**
```typescript
// core-abstractions/entities/user.entity.ts
export class User {
  constructor(
    public readonly id: UserId,
    public readonly email: Email,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly createdAt: Date
  ) {
    // Only basic validation - complex logic moved to operators
    this.validateName(firstName, lastName);
  }

  static create(dto: CreateUserDto): User {
    return new User(
      UserId.generate(),
      new Email(dto.email), // Email validation in value object
      dto.firstName,
      dto.lastName,
      new Date()
    );
  }

  private validateName(firstName: string, lastName: string): void {
    if (!firstName?.trim() || !lastName?.trim()) {
      throw new Error('First and last name are required');
    }
  }
}
```

### Step 4: Move Infrastructure to Implementations
**Goal:** Keep same implementations, improve organization

**Before (Clean Architecture):**
```typescript
// interface-adapters/gateways/UserRepositoryImpl.ts
export class UserRepositoryImpl implements UserRepository {
  constructor(private db: DatabaseConnection) {}

  async save(user: User): Promise<void> {
    await this.db.query(
      'INSERT INTO users (id, email, first_name, last_name) VALUES (?, ?, ?, ?)',
      [user.id, user.email, user.firstName, user.lastName]
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (!row) return null;

    return new User(row.id, row.email, row.first_name, row.last_name);
  }
}
```

**After (ADD Implementation):**
```typescript
// implementations/repositories/user.postgres.repository.ts
export class PostgresUserRepository implements IUserRepository {
  constructor(private db: DatabaseConnection) {}

  async save(user: User): Promise<void> {
    await this.db.query(
      'INSERT INTO users (id, email, first_name, last_name, created_at) VALUES ($1, $2, $3, $4, $5)',
      [user.id.value, user.email.value, user.firstName, user.lastName, user.createdAt]
    );
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.db.query(
      'SELECT * FROM users WHERE email = $1',
      [email.value]
    );

    if (!row) return null;

    return new User(
      UserId.fromString(row.id),
      new Email(row.email),
      row.first_name,
      row.last_name,
      new Date(row.created_at)
    );
  }
}
```

### Step 5: Add Bootstrap Layer
**Goal:** Centralize dependency injection (Clean Architecture weakness)

**New in ADD:**
```typescript
// bootstrap/container.ts
export class ContainerConfig {
  static configure(container: DIContainer): void {
    // Infrastructure
    container.register<DatabaseConnection>('DatabaseConnection',
      () => new PostgresConnection(process.env.DB_URL));

    // Repositories
    container.register<IUserRepository>('IUserRepository', () => {
      const db = container.resolve<DatabaseConnection>('DatabaseConnection');
      return new PostgresUserRepository(db);
    });

    // Services
    container.register<IEmailService>('IEmailService',
      () => new SmtpEmailService());

    // Event Bus
    container.register<IEventBus>('IEventBus',
      () => new SimpleEventBus());

    // Operators
    container.register<UserOperator>('UserOperator', () => {
      const userRepo = container.resolve<IUserRepository>('IUserRepository');
      const emailService = container.resolve<IEmailService>('IEmailService');
      const eventBus = container.resolve<IEventBus>('IEventBus');
      return new UserOperator(userRepo, emailService, eventBus);
    });
  }
}
```

## Why Migrate from Clean Architecture to ADD?

### Clean Architecture Challenges
- **Layer confusion**: Use cases vs. interactors vs. controllers
- **Over-abstraction**: Too many interfaces for simple operations
- **Presenter complexity**: Extra layer for data transformation
- **DI scattered**: No central dependency configuration
- **Testing complexity**: Many layers to mock

### ADD Improvements
- **Simpler layering**: 5 clear actors with distinct responsibilities
- **DIP focus**: Abstractions without over-engineering
- **Integrated transformation**: Operators handle DTO ↔ Entity mapping
- **Central DI**: Bootstrap layer handles all wiring
- **Easier testing**: Clear boundaries, fewer mocks needed

## Migration Benefits

### Code Reduction
- ~30% fewer files (consolidate use cases, remove presenters)
- ~25% less boilerplate (simpler interfaces)
- Clearer dependency flow

### Improved Testability
- Operators are easier to test than use case + interactor combinations
- Less mocking needed
- Business logic more concentrated

### Better AI Compatibility
- Cleaner interfaces for AI code generation
- Less architectural decision-making required
- More predictable patterns

## Migration Checklist

- [ ] **Phase 1: Analyze Current Structure**
  - [ ] Map entities to ADD entities
  - [ ] Identify use cases to consolidate
  - [ ] List interface adapters to split

- [ ] **Phase 2: Create ADD Structure**
  - [ ] Create boundary DTOs from controller/presenter contracts
  - [ ] Move entities to core abstractions
  - [ ] Extract ports from repository interfaces

- [ ] **Phase 3: Consolidate Use Cases**
  - [ ] Combine use cases and interactors into operators
  - [ ] Move presenter logic into operators
  - [ ] Add event emission where beneficial

- [ ] **Phase 4: Reorganize Infrastructure**
  - [ ] Move gateways to implementations
  - [ ] Split controllers into boundary + implementation
  - [ ] Organize by technology (postgres, redis, etc.)

- [ ] **Phase 5: Add Bootstrap**
  - [ ] Create DI container
  - [ ] Move all dependency wiring to bootstrap
  - [ ] Remove manual dependency creation

- [ ] **Phase 6: Test & Optimize**
  - [ ] Ensure all functionality preserved
  - [ ] Optimize based on reduced complexity
  - [ ] Update documentation

## Running the Migration

```bash
# Compare before and after
cd examples/migration/from-clean-architecture/before
npm test

cd examples/migration/from-clean-architecture/after
npm test

# See the differences
npm run compare:architectures
```

The migration preserves all Clean Architecture benefits while reducing complexity and improving maintainability.