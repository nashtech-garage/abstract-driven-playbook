# ADD Implementation Checklist

## Phase 1: Project Setup ✅

### Folder Structure
- [ ] Create `boundary/` folder
  - [ ] `dto/` - Data Transfer Objects
  - [ ] `events/` - Boundary Events (external)
- [ ] Create `core-abstractions/` folder
  - [ ] `entities/` - Domain entities
  - [ ] `value-objects/` - Value objects
  - [ ] `ports/` - Interfaces (repositories, services)
  - [ ] `events/` - Core Events (internal)
- [ ] Create `operators/` folder
- [ ] Create `implementations/` folder
  - [ ] `repositories/` - Database implementations
  - [ ] `services/` - External service implementations
  - [ ] `events/` - Event bus implementations
- [ ] Create `bootstrap/` folder
  - [ ] `container.ts` - DI container
  - [ ] `app.ts` - Application setup

## Phase 2: Core Abstractions First ✅

### Entities & Value Objects
- [ ] Define core entities as thin data holders
- [ ] Add validation only (no business logic)
- [ ] Create value objects for important concepts (IDs, Email, etc.)
- [ ] Ensure entities are technology-agnostic

### Ports (Interfaces)
- [ ] Define repository interfaces in `core-abstractions/ports/`
- [ ] Define service interfaces for external dependencies
- [ ] Keep interfaces focused and cohesive
- [ ] Use domain language (not technical terms)

### Events
- [ ] Define Core Events for internal communication
- [ ] Keep events immutable
- [ ] Include relevant data payload
- [ ] Use past tense naming (UserCreated, OrderShipped)

## Phase 3: Boundary Contracts ✅

### DTOs
- [ ] Create DTOs for all external APIs
- [ ] Use primitive types (string, number, boolean)
- [ ] Keep DTOs flat and simple
- [ ] Version DTOs when needed
- [ ] Separate input/output DTOs

### Boundary Events
- [ ] Define events for external system integration
- [ ] Include correlation IDs
- [ ] Use stable payload format

## Phase 4: Operators (Business Logic) ✅

### Implementation
- [ ] Create operators for each business use case
- [ ] Inject only ports (interfaces), never implementations
- [ ] Handle DTO ↔ Entity mapping
- [ ] Coordinate between different ports
- [ ] Emit Core Events for side effects

### Dependencies
- [ ] Operators depend only on:
  - [ ] Boundary DTOs
  - [ ] Core Abstractions (entities, ports, events)
- [ ] Never import from Implementations directly
- [ ] Never import infrastructure concerns

## Phase 5: Implementations ✅

### Repository Implementations
- [ ] Implement repository ports
- [ ] Handle entity ↔ persistence mapping
- [ ] Include error handling
- [ ] Consider connection management

### Service Implementations
- [ ] Implement external service ports
- [ ] Add anti-corruption layer for external APIs
- [ ] Handle retries and timeouts
- [ ] Map external data to internal formats

### Event Implementations
- [ ] Implement event bus ports
- [ ] Handle serialization/deserialization
- [ ] Consider message ordering
- [ ] Add error handling and dead letter queues

## Phase 6: Bootstrap & DI ✅

### Container Setup
- [ ] Configure DI container
- [ ] Bind all ports to implementations
- [ ] Handle dependency injection
- [ ] Support different environments (dev/prod)

### Application Startup
- [ ] Initialize all services
- [ ] Set up database connections
- [ ] Configure logging
- [ ] Handle graceful shutdown

## Phase 7: Testing Strategy ✅

### Unit Tests
- [ ] Test entities and value objects
- [ ] Test operators with mocked ports
- [ ] Test implementations independently
- [ ] Test pure functions (mappers, validators)

### Integration Tests
- [ ] Test operator flows with real implementations
- [ ] Test database operations
- [ ] Test external service integration
- [ ] Test event publishing/consuming

### Architecture Tests
- [ ] Verify dependency rules (operators don't import implementations)
- [ ] Check package dependencies
- [ ] Validate naming conventions

## Phase 8: Deployment & Monitoring ✅

### Configuration
- [ ] Environment-specific configs
- [ ] Feature flags support
- [ ] Secret management

### Observability
- [ ] Add logging at operator level
- [ ] Add metrics for business operations
- [ ] Add tracing for cross-service calls
- [ ] Monitor port health

## Common Pitfalls to Avoid ❌

- [ ] ❌ Don't put business logic in implementations
- [ ] ❌ Don't let operators import implementations directly
- [ ] ❌ Don't create anemic entities (but keep them thin)
- [ ] ❌ Don't leak infrastructure details to operators
- [ ] ❌ Don't create deep DTO hierarchies
- [ ] ❌ Don't ignore the single responsibility principle
- [ ] ❌ Don't skip the DI configuration
- [ ] ❌ Don't forget to test the unhappy paths

## Validation Questions ❓

1. Can I swap any implementation without changing operators?
2. Can I test operators without real infrastructure?
3. Are my entities technology-agnostic?
4. Do my DTOs expose only what external systems need?
5. Are my events immutable and well-named?
6. Is my DI configuration the only place that knows about concrete implementations?

## Success Metrics 📊

- [ ] **Zero imports** from implementations to operators
- [ ] **Fast unit tests** (< 1s for all operator tests)
- [ ] **Easy mock setup** for operator testing
- [ ] **Quick onboarding** (new devs productive in < 3 days)
- [ ] **Safe deployments** (can deploy new implementations independently)
- [ ] **Clear boundaries** (each layer has distinct responsibilities)