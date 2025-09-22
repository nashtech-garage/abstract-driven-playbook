// CORE ABSTRACTIONS - Value Object for Task Status
// Encapsulates status logic and valid transitions

export class TaskStatus {
  private constructor(public readonly value: string) {}

  // Predefined status constants
  static readonly PENDING = new TaskStatus('pending');
  static readonly IN_PROGRESS = new TaskStatus('in_progress');
  static readonly COMPLETED = new TaskStatus('completed');
  static readonly CANCELLED = new TaskStatus('cancelled');

  private static readonly ALL_STATUSES = [
    TaskStatus.PENDING,
    TaskStatus.IN_PROGRESS,
    TaskStatus.COMPLETED,
    TaskStatus.CANCELLED
  ];

  // Factory method from string
  static fromString(status: string): TaskStatus {
    const found = TaskStatus.ALL_STATUSES.find(s => s.value === status);
    if (!found) {
      throw new Error(`Invalid task status: ${status}. Valid statuses: ${TaskStatus.getValidStatuses().join(', ')}`);
    }
    return found;
  }

  // Get all valid status strings
  static getValidStatuses(): string[] {
    return TaskStatus.ALL_STATUSES.map(s => s.value);
  }

  // Business logic - valid status transitions
  canTransitionTo(newStatus: TaskStatus): boolean {
    // Define valid transitions
    const validTransitions: { [key: string]: string[] } = {
      'pending': ['in_progress', 'cancelled'],
      'in_progress': ['completed', 'cancelled', 'pending'],
      'completed': [], // Completed tasks cannot change status
      'cancelled': ['pending'] // Cancelled tasks can be reactivated
    };

    const allowedNextStatuses = validTransitions[this.value] || [];
    return allowedNextStatuses.includes(newStatus.value);
  }

  // Value object equality
  equals(other: TaskStatus): boolean {
    return this.value === other.value;
  }

  // String representation
  toString(): string {
    return this.value;
  }

  // Query methods
  isPending(): boolean {
    return this.equals(TaskStatus.PENDING);
  }

  isInProgress(): boolean {
    return this.equals(TaskStatus.IN_PROGRESS);
  }

  isCompleted(): boolean {
    return this.equals(TaskStatus.COMPLETED);
  }

  isCancelled(): boolean {
    return this.equals(TaskStatus.CANCELLED);
  }

  isActive(): boolean {
    return this.isPending() || this.isInProgress();
  }

  isFinal(): boolean {
    return this.isCompleted() || this.isCancelled();
  }
}