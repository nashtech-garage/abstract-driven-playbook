# Simple CRUD Example

## Overview
Basic CRUD operations for a Task entity demonstrating core ADD principles.

**Learning Goals:**
- Understand the 5 ADD layers
- See DTO ↔ Entity mapping
- Experience DIP in action
- Practice separation of concerns

**Complexity:** ⭐ Beginner
**Time to understand:** 30 minutes

## Architecture

```
simple-crud/
├── boundary/
│   ├── dto/
│   │   ├── create-task.dto.ts
│   │   ├── update-task.dto.ts
│   │   └── task-response.dto.ts
│   └── events/
│       └── task.boundary-events.ts
├── core-abstractions/
│   ├── entities/
│   │   └── task.entity.ts
│   ├── value-objects/
│   │   ├── task-id.ts
│   │   └── task-status.ts
│   ├── ports/
│   │   ├── task.repository.ts
│   │   └── event-bus.ts
│   └── events/
│       └── task.core-events.ts
├── operators/
│   └── task.operator.ts
├── implementations/
│   ├── repositories/
│   │   ├── task.in-memory.repository.ts
│   │   └── task.json-file.repository.ts
│   └── events/
│       └── simple.event-bus.ts
├── bootstrap/
│   ├── container.ts
│   └── app.ts
└── main.ts
```

## Key Features
- ✅ All 5 ADD layers implemented
- ✅ Multiple repository implementations (in-memory, file)
- ✅ Clean DTO ↔ Entity mapping
- ✅ Simple event system
- ✅ DI container setup
- ✅ Runnable example

## Running the Example
```bash
npm install
npm run start
```

## What You'll Learn
1. How to structure ADD projects
2. How to implement ports and adapters
3. How to swap implementations via DI
4. How to maintain clean boundaries between layers