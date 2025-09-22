// OPERATORS - Business orchestration layer
// This is where business logic coordination happens

import { Task } from '../core-abstractions/entities/task.entity';
import { TaskId } from '../core-abstractions/value-objects/task-id';
import { TaskStatus } from '../core-abstractions/value-objects/task-status';
import { ITaskRepository } from '../core-abstractions/ports/task.repository';
import { IEventBus } from '../core-abstractions/ports/event-bus';

import { CreateTaskDto } from '../boundary/dto/create-task.dto';
import { UpdateTaskDto } from '../boundary/dto/update-task.dto';
import { TaskResponseDto, TaskListResponseDto } from '../boundary/dto/task-response.dto';

import { TaskCreatedEvent, TaskStatusChangedEvent, TaskDeletedEvent } from '../core-abstractions/events/task.core-events';

export class TaskOperator {
  constructor(
    private readonly taskRepository: ITaskRepository,
    private readonly eventBus: IEventBus
  ) {}

  // CREATE - Business use case: "Create a new task"
  async createTask(dto: CreateTaskDto): Promise<TaskResponseDto> {
    // 1. Create domain entity from DTO (DTO → Entity mapping)
    const task = Task.create(dto);

    // 2. Business rule: Check for duplicate titles (example business logic)
    const existingTasks = await this.taskRepository.searchByTitle(task.title);
    if (existingTasks.length > 0) {
      throw new Error(`Task with title "${task.title}" already exists`);
    }

    // 3. Persist via repository port
    await this.taskRepository.save(task);

    // 4. Emit domain event for side effects
    await this.eventBus.emit(new TaskCreatedEvent(
      task.id.value,
      task.title,
      task.priority.value,
      new Date()
    ));

    // 5. Return response DTO (Entity → DTO mapping)
    return this.mapToResponseDto(task);
  }

  // READ - Business use case: "Get task by ID"
  async getTaskById(id: string): Promise<TaskResponseDto | null> {
    const taskId = TaskId.fromString(id);
    const task = await this.taskRepository.findById(taskId);

    if (!task) {
      return null;
    }

    return this.mapToResponseDto(task);
  }

  // READ - Business use case: "List all tasks with pagination"
  async listTasks(page: number = 1, limit: number = 10): Promise<TaskListResponseDto> {
    // Business rule: Validate pagination parameters
    if (page < 1) page = 1;
    if (limit < 1 || limit > 100) limit = 10; // Max 100 items per page

    const result = await this.taskRepository.findWithPagination(page, limit);

    return {
      tasks: result.tasks.map(task => this.mapToResponseDto(task)),
      total: result.total,
      page,
      limit
    };
  }

  // UPDATE - Business use case: "Update task content"
  async updateTask(id: string, dto: UpdateTaskDto): Promise<TaskResponseDto> {
    const taskId = TaskId.fromString(id);

    // 1. Load existing task
    const existingTask = await this.taskRepository.findById(taskId);
    if (!existingTask) {
      throw new Error(`Task with ID ${id} not found`);
    }

    // 2. Business rule: Cannot update completed tasks
    if (existingTask.isCompleted()) {
      throw new Error('Cannot update completed tasks');
    }

    // 3. Apply changes (immutable update)
    const updatedTask = existingTask.updateContent(dto.title, dto.description);

    // 4. Persist changes
    await this.taskRepository.save(updatedTask);

    // 5. Return updated response
    return this.mapToResponseDto(updatedTask);
  }

  // UPDATE - Business use case: "Change task status"
  async changeTaskStatus(id: string, newStatus: string): Promise<TaskResponseDto> {
    const taskId = TaskId.fromString(id);
    const status = TaskStatus.fromString(newStatus);

    // 1. Load existing task
    const existingTask = await this.taskRepository.findById(taskId);
    if (!existingTask) {
      throw new Error(`Task with ID ${id} not found`);
    }

    // 2. Business rule: Validate status transition
    if (!existingTask.status.canTransitionTo(status)) {
      throw new Error(`Cannot transition from ${existingTask.status.value} to ${status.value}`);
    }

    // 3. Apply status change
    const updatedTask = existingTask.updateStatus(status);

    // 4. Persist changes
    await this.taskRepository.save(updatedTask);

    // 5. Emit domain event
    await this.eventBus.emit(new TaskStatusChangedEvent(
      updatedTask.id.value,
      existingTask.status.value,
      updatedTask.status.value,
      new Date()
    ));

    // 6. Return updated response
    return this.mapToResponseDto(updatedTask);
  }

  // DELETE - Business use case: "Delete a task"
  async deleteTask(id: string): Promise<boolean> {
    const taskId = TaskId.fromString(id);

    // 1. Check if task exists
    const existingTask = await this.taskRepository.findById(taskId);
    if (!existingTask) {
      return false;
    }

    // 2. Business rule: Cannot delete in-progress tasks
    if (existingTask.status.isInProgress()) {
      throw new Error('Cannot delete tasks that are in progress. Please complete or cancel them first.');
    }

    // 3. Delete from repository
    const deleted = await this.taskRepository.delete(taskId);

    // 4. Emit domain event if deleted
    if (deleted) {
      await this.eventBus.emit(new TaskDeletedEvent(
        existingTask.id.value,
        existingTask.title,
        new Date()
      ));
    }

    return deleted;
  }

  // QUERY - Business use case: "Get overdue tasks"
  async getOverdueTasks(): Promise<TaskResponseDto[]> {
    const overdueTasks = await this.taskRepository.findOverdueTasks();
    return overdueTasks.map(task => this.mapToResponseDto(task));
  }

  // QUERY - Business use case: "Get active tasks"
  async getActiveTasks(): Promise<TaskResponseDto[]> {
    const activeTasks = await this.taskRepository.findActiveTasks();
    return activeTasks.map(task => this.mapToResponseDto(task));
  }

  // UTILITY - Entity → DTO mapping (private helper)
  private mapToResponseDto(task: Task): TaskResponseDto {
    return {
      id: task.id.value,
      title: task.title,
      description: task.description,
      priority: task.priority.value as 'low' | 'medium' | 'high',
      status: task.status.value as 'pending' | 'in_progress' | 'completed' | 'cancelled',
      dueDate: task.dueDate?.toISOString() || undefined,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    };
  }
}

/*
Key ADD principles demonstrated:

1. **Dependency on Ports only**: TaskOperator depends on ITaskRepository and IEventBus interfaces,
   never on concrete implementations

2. **DTO ↔ Entity mapping**: All mapping happens here in the Operator layer
   - CreateTaskDto → Task entity (via Task.create())
   - Task entity → TaskResponseDto (via mapToResponseDto())

3. **Business logic coordination**:
   - Validation rules (duplicate titles, status transitions)
   - Business workflows (create → save → emit event)
   - Error handling with domain-meaningful messages

4. **Event emission**: Operators emit Core Events for side effects
   - Other parts of the system can react to these events
   - Keeps the operator focused on its primary responsibility

5. **No implementation details**:
   - No SQL queries, file operations, or HTTP calls
   - Pure business logic coordination

6. **Immutable entities**: Updates create new instances rather than mutating
   - This makes the code more predictable and testable

The Operator can be easily tested by mocking ITaskRepository and IEventBus!
*/