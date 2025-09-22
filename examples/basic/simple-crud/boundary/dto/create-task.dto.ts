// BOUNDARY - External contract for creating tasks
// This DTO represents what external systems send us

export interface CreateTaskDto {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';  // External enum format
  dueDate?: string;  // ISO string for API stability
}

// Validation schema (optional - for runtime validation)
export const CreateTaskDtoSchema = {
  title: { required: true, minLength: 1, maxLength: 200 },
  description: { required: true, minLength: 1, maxLength: 1000 },
  priority: { required: true, enum: ['low', 'medium', 'high'] },
  dueDate: { required: false, format: 'date-time' }
};

// Example usage:
// POST /api/tasks
// {
//   "title": "Complete ADD example",
//   "description": "Build a simple CRUD example following ADD principles",
//   "priority": "high",
//   "dueDate": "2024-12-31T23:59:59Z"
// }