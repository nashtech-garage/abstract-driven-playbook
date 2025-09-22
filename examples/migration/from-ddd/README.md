# DDD to ADD Migration Example

## Overview
Step-by-step migration from Domain Driven Design to Abstract Driven Development, showing how to preserve business logic while improving architecture.

**Learning Goals:**
- Understand mapping between DDD and ADD concepts
- See practical migration steps
- Maintain business continuity during transition
- Improve testability and maintainability

**Complexity:** ⭐⭐⭐ Intermediate
**Time to complete:** 4-6 hours

## Before & After Comparison

### DDD Structure (Before)
```
user-management-ddd/
├── src/
│   ├── domain/
│   │   ├── model/
│   │   │   ├── User.ts                    # Aggregate Root
│   │   │   ├── UserRepository.ts          # Repository Interface
│   │   │   └── DomainEvents.ts           # Domain Events
│   │   ├── services/
│   │   │   └── UserDomainService.ts      # Domain Service
│   │   └── specifications/
│   │       └── UserSpecifications.ts     # Business Rules
│   ├── application/
│   │   ├── commands/
│   │   │   └── CreateUserCommand.ts      # Command
│   │   ├── handlers/
│   │   │   └── CreateUserHandler.ts      # Command Handler
│   │   └── dto/
│   │       └── UserDto.ts               # Application DTO
│   ├── infrastructure/
│   │   ├── persistence/
│   │   │   └── SqlUserRepository.ts     # Repository Implementation
│   │   └── web/
│   │       └── UserController.ts        # Web Controller
│   └── shared/
│       └── ValueObjects.ts              # Shared Value Objects
```

### ADD Structure (After)
```
user-management-add/
├── boundary/
│   ├── dto/
│   │   ├── create-user.dto.ts           # External contracts
│   │   └── user-response.dto.ts
│   └── events/
│       └── user.boundary-events.ts      # External events
├── core-abstractions/
│   ├── entities/
│   │   └── user.entity.ts               # Thin entity (was Aggregate)
│   ├── value-objects/
│   │   ├── user-id.ts                   # From DDD Value Objects
│   │   └── email.ts
│   ├── ports/
│   │   ├── user.repository.ts           # From DDD Repository Interface
│   │   └── email.service.ts
│   └── events/
│       └── user.core-events.ts          # From DDD Domain Events
├── operators/
│   └── user.operator.ts                 # From DDD Command Handler + Domain Service
├── implementations/
│   ├── repositories/
│   │   └── user.sql.repository.ts       # From DDD Repository Implementation
│   └── services/
│       └── email.smtp.service.ts
└── bootstrap/
    ├── container.ts                     # DI Configuration
    └── app.ts                          # Application setup
```

## Migration Steps

### Step 1: Extract Boundary Contracts
**Goal:** Create stable external interfaces

**DDD → ADD Mapping:**
- Application DTOs → Boundary DTOs
- Controller responses → Boundary DTOs
- Domain Events → Boundary Events (for external systems)

**Before (DDD):**
```typescript
// application/dto/UserDto.ts
export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}
```

**After (ADD):**
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
  isActive: boolean;
  createdAt: string;
}
```

### Step 2: Simplify Domain Model to Core Abstractions
**Goal:** Extract essential business concepts

**DDD → ADD Mapping:**
- Aggregate Root → Entity (thin)
- Value Objects → Value Objects (keep as-is)
- Repository Interface → Port
- Domain Events → Core Events

**Before (DDD Aggregate):**
```typescript
// domain/model/User.ts
export class User {
  constructor(
    private id: UserId,
    private email: Email,
    private profile: UserProfile,
    private permissions: UserPermissions
  ) {}

  public changeEmail(newEmail: Email, emailService: IEmailService): void {
    if (!emailService.isValidDomain(newEmail.domain)) {
      throw new Error('Invalid email domain');
    }

    const oldEmail = this.email;
    this.email = newEmail;

    // Complex business logic mixed with coordination
    this.addDomainEvent(new UserEmailChangedEvent(this.id, oldEmail, newEmail));
    this.permissions.resetEmailVerification();
    this.profile.updateLastModified();
  }

  // Many other methods...
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
    public readonly isActive: boolean,
    public readonly createdAt: Date
  ) {
    // Only validation, no business logic coordination
    this.validateEmail(email);
    this.validateName(firstName, lastName);
  }

  static create(dto: CreateUserDto): User {
    return new User(
      UserId.generate(),
      new Email(dto.email),
      dto.firstName,
      dto.lastName,
      true,
      new Date()
    );
  }

  // Simple state changes only
  deactivate(): User {
    return new User(
      this.id,
      this.email,
      this.firstName,
      this.lastName,
      false,
      this.createdAt
    );
  }

  private validateEmail(email: Email): void {
    // Simple validation only
  }
}
```

### Step 3: Move Business Logic to Operators
**Goal:** Consolidate orchestration logic

**DDD → ADD Mapping:**
- Command Handler + Domain Service → Operator
- Application Service → Operator
- Complex Aggregate methods → Operator methods

**Before (DDD Command Handler + Domain Service):**
```typescript
// application/handlers/CreateUserHandler.ts
export class CreateUserHandler {
  async handle(command: CreateUserCommand): Promise<void> {
    const email = new Email(command.email);

    if (!await this.emailService.isValidDomain(email.domain)) {
      throw new Error('Invalid email domain');
    }

    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const user = User.create(command.email, command.firstName, command.lastName);
    await this.userRepository.save(user);

    await this.emailService.sendWelcomeEmail(user.email);
  }
}

// domain/services/UserDomainService.ts
export class UserDomainService {
  async changeUserEmail(user: User, newEmail: Email): Promise<void> {
    // More business logic...
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
    // Business validation
    const existingUser = await this.userRepository.findByEmail(new Email(dto.email));
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Create entity
    const user = User.create(dto);

    // Business coordination
    await this.userRepository.save(user);
    await this.eventBus.emit(new UserCreatedEvent(user.id.value, user.email.value));

    // Return response
    return this.mapToResponseDto(user);
  }

  async changeUserEmail(userId: string, newEmail: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(UserId.fromString(userId));
    if (!user) {
      throw new Error('User not found');
    }

    const email = new Email(newEmail);

    // Business rules
    if (!await this.emailService.isValidDomain(email.domain)) {
      throw new Error('Invalid email domain');
    }

    // Create updated user
    const updatedUser = new User(
      user.id,
      email,
      user.firstName,
      user.lastName,
      user.isActive,
      user.createdAt
    );

    // Coordinate changes
    await this.userRepository.save(updatedUser);
    await this.eventBus.emit(new UserEmailChangedEvent(
      user.id.value,
      user.email.value,
      email.value
    ));

    return this.mapToResponseDto(updatedUser);
  }
}
```

### Step 4: Convert Infrastructure to Implementations
**Goal:** Preserve technical implementations with cleaner interfaces

**DDD → ADD Mapping:**
- Repository Implementation → Repository Implementation (clean up)
- Infrastructure Services → Service Implementations
- External Adapters → Anti-corruption Layer

**Migration is mostly structural - move files and clean up dependencies.**

### Step 5: Add Bootstrap Layer
**Goal:** Centralize dependency configuration

**New in ADD:**
```typescript
// bootstrap/container.ts
export class ContainerConfig {
  static configure(container: DIContainer): void {
    // Repositories
    container.register<IUserRepository>('IUserRepository',
      () => new SqlUserRepository(/* config */));

    // Services
    container.register<IEmailService>('IEmailService',
      () => new SmtpEmailService(/* config */));

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

## Migration Benefits

### Before (DDD Challenges)
- ❌ Complex aggregates with mixed concerns
- ❌ Tight coupling between domain and application layers
- ❌ Difficult to test business logic in isolation
- ❌ Heavy tactical patterns overhead
- ❌ Domain events scattered across aggregates

### After (ADD Benefits)
- ✅ Clean separation of business logic and coordination
- ✅ Easy to test operators with mocked ports
- ✅ Simple, focused entities
- ✅ Centralized dependency management
- ✅ Clear event flow through system

## Migration Checklist

- [ ] **Phase 1: Boundary Extraction**
  - [ ] Create boundary DTOs from application DTOs
  - [ ] Map external events to boundary events
  - [ ] Ensure API compatibility

- [ ] **Phase 2: Core Abstractions**
  - [ ] Simplify aggregates to thin entities
  - [ ] Extract ports from repository interfaces
  - [ ] Move domain events to core events

- [ ] **Phase 3: Operator Creation**
  - [ ] Combine command handlers and domain services
  - [ ] Move business orchestration to operators
  - [ ] Add DTO ↔ Entity mapping

- [ ] **Phase 4: Implementation Migration**
  - [ ] Move repository implementations
  - [ ] Convert infrastructure services
  - [ ] Add anti-corruption layers where needed

- [ ] **Phase 5: Bootstrap Setup**
  - [ ] Create DI container
  - [ ] Configure all dependencies
  - [ ] Remove manual wiring

- [ ] **Phase 6: Testing & Validation**
  - [ ] Ensure all tests pass
  - [ ] Verify business logic preservation
  - [ ] Check performance impact

## Running the Migration

```bash
# See the original DDD structure
cd examples/migration/from-ddd/before

# See the migrated ADD structure
cd examples/migration/from-ddd/after

# Run comparison tests
npm run test:migration
```

This migration preserves all business logic while providing cleaner architecture, better testability, and improved maintainability.