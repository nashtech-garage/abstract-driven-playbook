// IMPLEMENTATIONS - In-memory repository implementation
// Perfect for testing, development, and simple deployments

import { Task } from '../../core-abstractions/entities/task.entity';
import { TaskId } from '../../core-abstractions/value-objects/task-id';
import { TaskStatus } from '../../core-abstractions/value-objects/task-status';
import { TaskPriority } from '../../core-abstractions/value-objects/task-priority';
import { ITaskRepository } from '../../core-abstractions/ports/task.repository';

export class InMemoryTaskRepository implements ITaskRepository {
  private tasks: Map<string, Task> = new Map();

  // Basic CRUD operations
  async save(task: Task): Promise<void> {
    this.tasks.set(task.id.value, task);
  }

  async findById(id: TaskId): Promise<Task | null> {
    const task = this.tasks.get(id.value);
    return task || null;
  }

  async findAll(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  async delete(id: TaskId): Promise<boolean> {
    return this.tasks.delete(id.value);
  }

  // Query methods - implement business queries using in-memory operations
  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(task => task.status.equals(status));
  }

  async findByPriority(priority: TaskPriority): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(task => task.priority.equals(priority));
  }

  async findOverdueTasks(): Promise<Task[]> {
    const now = new Date();
    return Array.from(this.tasks.values())
      .filter(task => task.isOverdue());
  }

  async findActiveTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(task => task.status.isActive());
  }

  // Pagination support
  async findWithPagination(page: number, limit: number): Promise<{
    tasks: Task[];
    total: number;
    hasMore: boolean;
  }> {
    const allTasks = Array.from(this.tasks.values());
    const total = allTasks.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    // Sort by creation date (newest first) for consistent pagination
    const sortedTasks = allTasks.sort((a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime()
    );

    const tasks = sortedTasks.slice(startIndex, endIndex);
    const hasMore = endIndex < total;

    return { tasks, total, hasMore };
  }

  // Search functionality
  async searchByTitle(titlePattern: string): Promise<Task[]> {
    const lowerPattern = titlePattern.toLowerCase();
    return Array.from(this.tasks.values())
      .filter(task => task.title.toLowerCase().includes(lowerPattern));
  }

  // Bulk operations
  async saveMany(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      this.tasks.set(task.id.value, task);
    }
  }

  async deleteMany(ids: TaskId[]): Promise<number> {
    let deletedCount = 0;
    for (const id of ids) {
      if (this.tasks.delete(id.value)) {
        deletedCount++;
      }
    }
    return deletedCount;
  }

  // Repository health check
  async isHealthy(): Promise<boolean> {
    // In-memory repository is always healthy if we can access the Map
    try {
      this.tasks.size; // Simple check to ensure Map is accessible
      return true;
    } catch {
      return false;
    }
  }

  // Utility methods for testing and debugging
  clear(): void {
    this.tasks.clear();
  }

  size(): number {
    return this.tasks.size;
  }

  // Seed method for testing
  async seedWithSampleData(): Promise<void> {
    const sampleTasks = [
      Task.create({
        title: 'Complete project documentation',
        description: 'Write comprehensive documentation for the new project',
        priority: 'high',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
      }),
      Task.create({
        title: 'Review code changes',
        description: 'Review pending pull requests from team members',
        priority: 'medium',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days from now
      }),
      Task.create({
        title: 'Update dependencies',
        description: 'Update npm packages to latest versions',
        priority: 'low'
      })
    ];

    await this.saveMany(sampleTasks);

    // Create one in-progress task
    const inProgressTask = sampleTasks[1].updateStatus(TaskStatus.IN_PROGRESS);
    await this.save(inProgressTask);
  }
}

/*
Key implementation principles:

1. **Implements the Port interface**: Satisfies ITaskRepository contract completely

2. **No business logic**: Just storage and retrieval operations
   - Business rules are in the Entity and Operator layers
   - This layer focuses on data persistence mechanics

3. **Consistent with domain model**:
   - Returns Task entities, not raw data
   - Preserves all entity properties and behavior

4. **Simple and reliable**:
   - Perfect for testing (no external dependencies)
   - Good for MVPs and simple deployments
   - Easy to understand and debug

5. **Performance considerations**:
   - Sorting for pagination consistency
   - Efficient Map-based lookups
   - Simple filtering for queries

6. **Testing utilities**:
   - clear() method for test cleanup
   - seedWithSampleData() for integration tests
   - size() method for assertions

This implementation can be easily swapped with:
- PostgresTaskRepository
- FileSystemTaskRepository
- RedisTaskRepository
- MockTaskRepository (for unit tests)

The Operator layer will work exactly the same way!
*/