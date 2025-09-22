// BOOTSTRAP - Dependency Injection Container
// This is where all the wiring happens - the only place that knows about concrete implementations

import { ITaskRepository } from '../core-abstractions/ports/task.repository';
import { IEventBus } from '../core-abstractions/ports/event-bus';

import { TaskOperator } from '../operators/task.operator';

import { InMemoryTaskRepository } from '../implementations/repositories/task.in-memory.repository';
import { JsonFileTaskRepository } from '../implementations/repositories/task.json-file.repository';
import { SimpleEventBus } from '../implementations/events/simple.event-bus';

// Simple DI Container implementation
export class DIContainer {
  private registry = new Map<string, any>();
  private singletons = new Map<string, any>();

  // Register a service with its implementation
  register<T>(token: string, factory: () => T, singleton: boolean = true): void {
    this.registry.set(token, { factory, singleton });
  }

  // Resolve a service by token
  resolve<T>(token: string): T {
    const registration = this.registry.get(token);
    if (!registration) {
      throw new Error(`Service not registered: ${token}`);
    }

    const { factory, singleton } = registration;

    if (singleton) {
      if (!this.singletons.has(token)) {
        this.singletons.set(token, factory());
      }
      return this.singletons.get(token);
    }

    return factory();
  }

  // Clear all registrations (useful for testing)
  clear(): void {
    this.registry.clear();
    this.singletons.clear();
  }
}

// Container configuration
export class ContainerConfig {
  static configureForDevelopment(container: DIContainer): void {
    // Use in-memory implementations for development
    container.register<ITaskRepository>('ITaskRepository', () => {
      const repo = new InMemoryTaskRepository();
      // Seed with sample data in development
      repo.seedWithSampleData();
      return repo;
    });

    container.register<IEventBus>('IEventBus', () => new SimpleEventBus());

    // Register the operator with its dependencies
    container.register<TaskOperator>('TaskOperator', () => {
      const taskRepository = container.resolve<ITaskRepository>('ITaskRepository');
      const eventBus = container.resolve<IEventBus>('IEventBus');
      return new TaskOperator(taskRepository, eventBus);
    });
  }

  static configureForProduction(container: DIContainer): void {
    // Use file-based storage for production (or could be database)
    container.register<ITaskRepository>('ITaskRepository', () => {
      return new JsonFileTaskRepository('./data/tasks.json');
    });

    container.register<IEventBus>('IEventBus', () => new SimpleEventBus());

    container.register<TaskOperator>('TaskOperator', () => {
      const taskRepository = container.resolve<ITaskRepository>('ITaskRepository');
      const eventBus = container.resolve<IEventBus>('IEventBus');
      return new TaskOperator(taskRepository, eventBus);
    });
  }

  static configureForTesting(container: DIContainer): void {
    // Use clean in-memory implementations for testing (no sample data)
    container.register<ITaskRepository>('ITaskRepository', () => {
      return new InMemoryTaskRepository();
    });

    container.register<IEventBus>('IEventBus', () => new SimpleEventBus());

    container.register<TaskOperator>('TaskOperator', () => {
      const taskRepository = container.resolve<ITaskRepository>('ITaskRepository');
      const eventBus = container.resolve<IEventBus>('IEventBus');
      return new TaskOperator(taskRepository, eventBus);
    });
  }
}

// Environment-aware container factory
export class ContainerFactory {
  static create(environment: 'development' | 'production' | 'testing' = 'development'): DIContainer {
    const container = new DIContainer();

    switch (environment) {
      case 'development':
        ContainerConfig.configureForDevelopment(container);
        break;
      case 'production':
        ContainerConfig.configureForProduction(container);
        break;
      case 'testing':
        ContainerConfig.configureForTesting(container);
        break;
      default:
        throw new Error(`Unknown environment: ${environment}`);
    }

    return container;
  }
}

/*
Key DI principles demonstrated:

1. **Single place for wiring**: Only Bootstrap knows about concrete implementations
   - TaskOperator doesn't know it's getting InMemoryTaskRepository
   - ITaskRepository interface abstracts the implementation choice

2. **Environment-specific configuration**:
   - Development: In-memory with sample data
   - Production: File-based storage
   - Testing: Clean in-memory

3. **Dependency graph resolution**:
   - TaskOperator depends on ITaskRepository and IEventBus
   - Container resolves dependencies automatically
   - Singleton pattern for shared services

4. **Easy swapping**:
   - Change one line to switch from InMemory to JsonFile repository
   - No changes needed in any other layer

5. **Testability**:
   - Testing configuration provides clean instances
   - Can easily inject mocks for unit testing

Usage examples:

```typescript
// Development
const container = ContainerFactory.create('development');
const taskOperator = container.resolve<TaskOperator>('TaskOperator');

// Production
const prodContainer = ContainerFactory.create('production');
const prodTaskOperator = prodContainer.resolve<TaskOperator>('TaskOperator');

// Testing
const testContainer = ContainerFactory.create('testing');
const testTaskOperator = testContainer.resolve<TaskOperator>('TaskOperator');
```

This is the power of ADD: same business logic, different implementations!
*/