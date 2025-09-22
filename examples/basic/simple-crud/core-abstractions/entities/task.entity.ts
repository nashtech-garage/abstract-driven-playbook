// CORE ABSTRACTIONS - Domain entity
// This represents the core business concept of a Task

import { TaskId } from '../value-objects/task-id';
import { TaskStatus } from '../value-objects/task-status';
import { TaskPriority } from '../value-objects/task-priority';
import { CreateTaskDto } from '../../boundary/dto/create-task.dto';

export class Task {
  constructor(
    public readonly id: TaskId,
    public readonly title: string,
    public readonly description: string,
    public readonly priority: TaskPriority,
    public readonly status: TaskStatus,
    public readonly dueDate: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {
    // Validation in constructor - keep entities thin but valid
    this.validateTitle(title);
    this.validateDescription(description);
  }

  // Factory method for creating new tasks
  static create(dto: CreateTaskDto): Task {
    return new Task(
      TaskId.generate(),
      dto.title.trim(),
      dto.description.trim(),
      TaskPriority.fromString(dto.priority),
      TaskStatus.PENDING, // New tasks start as pending
      dto.dueDate ? new Date(dto.dueDate) : null,
      new Date(),
      new Date()
    );
  }

  // Business methods - keep minimal, focus on state changes
  updateStatus(newStatus: TaskStatus): Task {
    return new Task(
      this.id,
      this.title,
      this.description,
      this.priority,
      newStatus,
      this.dueDate,
      this.createdAt,
      new Date() // Update timestamp
    );
  }

  updateContent(title: string, description: string): Task {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    this.validateTitle(trimmedTitle);
    this.validateDescription(trimmedDescription);

    return new Task(
      this.id,
      trimmedTitle,
      trimmedDescription,
      this.priority,
      this.status,
      this.dueDate,
      this.createdAt,
      new Date()
    );
  }

  // Business rules - validation only
  private validateTitle(title: string): void {
    if (!title || title.length === 0) {
      throw new Error('Task title cannot be empty');
    }
    if (title.length > 200) {
      throw new Error('Task title cannot exceed 200 characters');
    }
  }

  private validateDescription(description: string): void {
    if (!description || description.length === 0) {
      throw new Error('Task description cannot be empty');
    }
    if (description.length > 1000) {
      throw new Error('Task description cannot exceed 1000 characters');
    }
  }

  // Query methods
  isOverdue(): boolean {
    return this.dueDate !== null && this.dueDate < new Date() && !this.isCompleted();
  }

  isCompleted(): boolean {
    return this.status.equals(TaskStatus.COMPLETED);
  }

  canBeCompleted(): boolean {
    return !this.status.equals(TaskStatus.COMPLETED) && !this.status.equals(TaskStatus.CANCELLED);
  }
}