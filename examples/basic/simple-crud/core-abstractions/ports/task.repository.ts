// CORE ABSTRACTIONS - Repository Port
// This interface defines what Operators need from storage, without knowing HOW it's implemented

import { Task } from '../entities/task.entity';
import { TaskId } from '../value-objects/task-id';
import { TaskStatus } from '../value-objects/task-status';
import { TaskPriority } from '../value-objects/task-priority';

export interface ITaskRepository {
  // Basic CRUD operations
  save(task: Task): Promise<void>;
  findById(id: TaskId): Promise<Task | null>;
  findAll(): Promise<Task[]>;
  delete(id: TaskId): Promise<boolean>;

  // Query methods - business-focused, not database-focused
  findByStatus(status: TaskStatus): Promise<Task[]>;
  findByPriority(priority: TaskPriority): Promise<Task[]>;
  findOverdueTasks(): Promise<Task[]>;
  findActiveTasks(): Promise<Task[]>; // pending + in_progress

  // Pagination support
  findWithPagination(page: number, limit: number): Promise<{
    tasks: Task[];
    total: number;
    hasMore: boolean;
  }>;

  // Search functionality
  searchByTitle(titlePattern: string): Promise<Task[]>;

  // Bulk operations
  saveMany(tasks: Task[]): Promise<void>;
  deleteMany(ids: TaskId[]): Promise<number>; // Returns count of deleted tasks

  // Repository health check
  isHealthy(): Promise<boolean>;
}

// Query options for complex searches (optional)
export interface TaskSearchOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  dueBefore?: Date;
  dueAfter?: Date;
  titleContains?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  sortBy?: 'createdAt' | 'updatedAt' | 'dueDate' | 'priority';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Extended repository interface for complex queries
export interface ITaskSearchRepository extends ITaskRepository {
  search(options: TaskSearchOptions): Promise<{
    tasks: Task[];
    total: number;
  }>;
}

/*
Key principles demonstrated here:

1. **Domain-focused methods**: findOverdueTasks(), findActiveTasks()
   - These express business concepts, not technical queries

2. **No implementation details**: No SQL, no MongoDB queries, no file paths
   - The interface is pure business logic

3. **Return domain objects**: Methods return Task entities, not DTOs or raw data
   - This keeps the boundary clean

4. **Async by default**: All methods return Promise for future flexibility
   - Even if current implementation is synchronous

5. **Business vocabulary**: Method names use domain language
   - "active tasks" vs "status IN ('pending', 'in_progress')"

This interface can be implemented by:
- InMemoryTaskRepository (for testing)
- PostgresTaskRepository (for production)
- FileSystemTaskRepository (for simple deployments)
- MockTaskRepository (for unit tests)

The Operator layer doesn't know or care which implementation is used!
*/