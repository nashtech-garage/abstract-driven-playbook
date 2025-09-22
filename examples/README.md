# ADD Examples

Practical implementations demonstrating Abstract Driven Development principles and patterns.

## 🎯 Learning Path

### 1. Start Here: Basic Examples ⭐
**Perfect for:** First-time ADD learners, proof of concepts

- **[simple-crud/](basic/simple-crud/)** - Essential CRUD operations with all 5 ADD layers
- **[user-management/](basic/user-management/)** - User registration and authentication
- **[minimal-ecommerce/](basic/minimal-ecommerce/)** - Product catalog and shopping cart

**Time investment:** 1-2 hours each
**Key learnings:** 5-layer structure, DIP, DTO mapping, event flow

### 2. Advanced: Extended Examples ⭐⭐⭐⭐
**Perfect for:** Complex domains, enterprise applications

- **[complex-ecommerce/](extended/complex-ecommerce/)** - Multi-module system with ADD-Extended
- **[financial-system/](extended/financial-system/)** - Banking operations with strict compliance

**Time investment:** 4-8 hours each
**Key learnings:** Scope Modules, RuleSet + Checkpoint, TGO, Coordinators, Cross-module communication

### 3. Migration: From Other Architectures ⭐⭐⭐
**Perfect for:** Existing codebases, gradual adoption

- **[from-ddd/](migration/from-ddd/)** - Migrate Domain Driven Design to ADD
- **[from-clean-architecture/](migration/from-clean-architecture/)** - Simplify Clean Architecture with ADD
- **[from-layered-architecture/](migration/from-layered-architecture/)** - Modernize traditional N-tier applications

**Time investment:** 2-6 hours each
**Key learnings:** Mapping strategies, preservation of business logic, gradual migration

## 📚 Example Categories

### Basic Examples
| Example | Complexity | Focus Areas | Technologies |
|---------|------------|-------------|--------------|
| [Simple CRUD](basic/simple-crud/) | ⭐ | 5 layers, DIP, Basic patterns | TypeScript, In-memory |
| [User Management](basic/user-management/) | ⭐⭐ | Authentication, Validation, Events | TypeScript, JWT, Bcrypt |
| [Minimal E-commerce](basic/minimal-ecommerce/) | ⭐⭐ | Multiple entities, Relations | TypeScript, SQLite |

### Extended Examples
| Example | Complexity | Focus Areas | Technologies |
|---------|------------|-------------|--------------|
| [Complex E-commerce](extended/complex-ecommerce/) | ⭐⭐⭐⭐ | Scope Modules, TGO, Sagas | TypeScript, PostgreSQL, Redis |
| [Financial System](extended/financial-system/) | ⭐⭐⭐⭐ | Compliance, Audit, Security | TypeScript, PostgreSQL, Kafka |

### Migration Examples
| From Architecture | Complexity | Focus Areas | Benefits |
|------------------|------------|-------------|----------|
| [DDD](migration/from-ddd/) | ⭐⭐⭐ | Aggregate simplification, Service consolidation | Reduced complexity, Better testability |
| [Clean Architecture](migration/from-clean-architecture/) | ⭐⭐ | Layer consolidation, DI centralization | Fewer abstractions, Cleaner code |
| [Layered Architecture](migration/from-layered-architecture/) | ⭐⭐ | Dependency inversion, Boundary extraction | Modern architecture, Technology independence |

## 🚀 Quick Start

### 1. Choose Your Starting Point

**New to ADD?** Start with [Simple CRUD](basic/simple-crud/)
```bash
cd examples/basic/simple-crud
npm install
npm start
```

**Have existing DDD?** Check [DDD Migration](migration/from-ddd/)
```bash
cd examples/migration/from-ddd
# Compare before/ and after/ folders
```

**Building enterprise system?** Explore [Complex E-commerce](extended/complex-ecommerce/)
```bash
cd examples/extended/complex-ecommerce
npm install
npm run demo:all
```

### 2. Run Examples

Each example includes:
- **README.md** - Detailed explanation and learning goals
- **package.json** - Dependencies and run scripts
- **main.ts** - Runnable demonstration
- **tests/** - Comprehensive test suite

```bash
# General pattern for all examples
cd examples/{category}/{example-name}
npm install
npm start
npm test
```

### 3. Explore & Experiment

**Modify implementations:**
```bash
# Swap from in-memory to file storage
npm run demo:file-storage

# Switch from JSON to SQL
npm run demo:sql-storage
```

**Try different configurations:**
```bash
# Development mode with sample data
npm run dev

# Production mode with real databases
npm run prod
```

## 📖 What You'll Learn

### Core ADD Concepts
- **5-Layer Architecture**: Boundary, Core Abstractions, Operators, Implementations, Bootstrap
- **Dependency Inversion Principle**: Abstractions independent of implementations
- **Port & Adapter Pattern**: Clean interfaces for external dependencies
- **Event-Driven Communication**: Loose coupling between components

### Advanced Patterns (Extended Examples)
- **Scope Modules**: Self-contained business domains
- **RuleSet + Checkpoint**: Composable business rule validation
- **Transaction Group Operators**: Strong consistency boundaries
- **Coordinator Operators**: Saga pattern for distributed workflows
- **Anti-Corruption Layers**: Protection from external system changes

### Migration Strategies
- **Gradual Migration**: Step-by-step transformation
- **Business Logic Preservation**: Maintain functionality during transition
- **Architecture Mapping**: Convert between different architectural styles
- **Risk Mitigation**: Safe migration practices

## 🛠️ Technologies Used

### Languages & Frameworks
- **TypeScript** - Type safety and modern JavaScript features
- **Node.js** - Runtime environment
- **Express** - Web framework (where applicable)

### Databases & Storage
- **In-Memory** - Simple examples and testing
- **JSON Files** - Lightweight persistence
- **SQLite** - Embedded database
- **PostgreSQL** - Production database
- **Redis** - Caching and session storage

### Testing & Quality
- **Jest** - Testing framework
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **TypeScript Compiler** - Type checking

### Development Tools
- **ts-node** - TypeScript execution
- **nodemon** - Development server
- **Docker** - Containerization (extended examples)
- **Docker Compose** - Multi-service orchestration

## 🎯 Learning Objectives

### After Basic Examples
- ✅ Understand the 5 ADD layers and their responsibilities
- ✅ Implement dependency inversion with ports and adapters
- ✅ Create clean DTO ↔ Entity mappings
- ✅ Build testable business logic
- ✅ Configure dependency injection

### After Extended Examples
- ✅ Design self-contained scope modules
- ✅ Implement complex business rule validation
- ✅ Handle distributed transactions and sagas
- ✅ Manage cross-module communication
- ✅ Build enterprise-grade applications

### After Migration Examples
- ✅ Assess existing architecture for ADD migration
- ✅ Plan step-by-step migration strategy
- ✅ Preserve business logic during transformation
- ✅ Reduce architectural complexity
- ✅ Improve code maintainability and testability

## 🔧 Development Guidelines

### Code Style
- **Consistent naming**: Clear, descriptive names for classes and methods
- **Type safety**: Full TypeScript coverage
- **Single responsibility**: Each class/function has one clear purpose
- **Dependency injection**: Never instantiate dependencies directly

### Testing Strategy
- **Unit tests**: Test entities, value objects, and individual functions
- **Integration tests**: Test operators with real or in-memory implementations
- **End-to-end tests**: Test complete workflows through all layers
- **Architecture tests**: Verify dependency rules and layer boundaries

### Project Structure
```
example-name/
├── README.md                 # Detailed explanation
├── package.json             # Dependencies and scripts
├── main.ts                  # Runnable demonstration
├── boundary/                # External contracts
├── core-abstractions/       # Business vocabulary
├── operators/               # Business logic
├── implementations/         # Technical adapters
├── bootstrap/               # DI configuration
└── tests/                   # Test suites
```

## 🤝 Contributing

Want to add more examples? See our [contribution guidelines](../docs/contributing.md).

**Ideas for new examples:**
- IoT device management
- Content management system
- Real-time chat application
- Machine learning pipeline
- API gateway service

## 📞 Getting Help

- **Issues**: Found a bug or unclear explanation? [Open an issue](https://github.com/your-repo/issues)
- **Discussions**: Questions about ADD concepts? [Start a discussion](https://github.com/your-repo/discussions)
- **Documentation**: Check the [main theory docs](../theories/)

---

**Next Steps:**
1. 📖 Read [ADD Theory V3](../theories/v3/) if you haven't already
2. 🎯 Pick an example that matches your experience level
3. 💻 Clone, run, and experiment with the code
4. 🧪 Try modifying implementations to see ADD flexibility in action
5. 🚀 Apply ADD principles to your own projects