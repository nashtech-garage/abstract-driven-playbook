// CORE ABSTRACTIONS - Value Object for Task ID
// Encapsulates ID generation and validation logic

export class TaskId {
  constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('TaskId cannot be empty');
    }

    if (!this.isValidFormat(value)) {
      throw new Error('TaskId must be in format: task_[alphanumeric]');
    }
  }

  // Factory method for generating new IDs
  static generate(): TaskId {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return new TaskId(`task_${timestamp}_${random}`);
  }

  // Factory method for existing IDs
  static fromString(id: string): TaskId {
    return new TaskId(id);
  }

  // Value object equality
  equals(other: TaskId): boolean {
    return this.value === other.value;
  }

  // String representation
  toString(): string {
    return this.value;
  }

  // Validation logic
  private isValidFormat(value: string): boolean {
    // Allow task_ prefix followed by alphanumeric and underscores
    return /^task_[a-zA-Z0-9_]+$/.test(value);
  }
}