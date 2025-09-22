// CORE ABSTRACTIONS - Value Object for Task Priority
// Encapsulates priority logic and ordering

export class TaskPriority {
  private constructor(
    public readonly value: string,
    public readonly numericValue: number
  ) {}

  // Predefined priority constants with ordering
  static readonly LOW = new TaskPriority('low', 1);
  static readonly MEDIUM = new TaskPriority('medium', 2);
  static readonly HIGH = new TaskPriority('high', 3);

  private static readonly ALL_PRIORITIES = [
    TaskPriority.LOW,
    TaskPriority.MEDIUM,
    TaskPriority.HIGH
  ];

  // Factory method from string
  static fromString(priority: string): TaskPriority {
    const found = TaskPriority.ALL_PRIORITIES.find(p => p.value === priority);
    if (!found) {
      throw new Error(`Invalid task priority: ${priority}. Valid priorities: ${TaskPriority.getValidPriorities().join(', ')}`);
    }
    return found;
  }

  // Factory method from numeric value
  static fromNumeric(numericValue: number): TaskPriority {
    const found = TaskPriority.ALL_PRIORITIES.find(p => p.numericValue === numericValue);
    if (!found) {
      throw new Error(`Invalid priority numeric value: ${numericValue}`);
    }
    return found;
  }

  // Get all valid priority strings
  static getValidPriorities(): string[] {
    return TaskPriority.ALL_PRIORITIES.map(p => p.value);
  }

  // Get priorities sorted by importance (high to low)
  static getSortedByImportance(): TaskPriority[] {
    return [...TaskPriority.ALL_PRIORITIES].sort((a, b) => b.numericValue - a.numericValue);
  }

  // Value object equality
  equals(other: TaskPriority): boolean {
    return this.value === other.value;
  }

  // Comparison methods for sorting
  isHigherThan(other: TaskPriority): boolean {
    return this.numericValue > other.numericValue;
  }

  isLowerThan(other: TaskPriority): boolean {
    return this.numericValue < other.numericValue;
  }

  isSamePriorityAs(other: TaskPriority): boolean {
    return this.numericValue === other.numericValue;
  }

  // String representation
  toString(): string {
    return this.value;
  }

  // Display representation
  toDisplayString(): string {
    const displayMap: { [key: string]: string } = {
      'low': '🟢 Low',
      'medium': '🟡 Medium',
      'high': '🔴 High'
    };
    return displayMap[this.value] || this.value;
  }

  // Query methods
  isLow(): boolean {
    return this.equals(TaskPriority.LOW);
  }

  isMedium(): boolean {
    return this.equals(TaskPriority.MEDIUM);
  }

  isHigh(): boolean {
    return this.equals(TaskPriority.HIGH);
  }

  requiresImmediateAttention(): boolean {
    return this.isHigh();
  }
}