// BOUNDARY - External response format
// This is what we send back to external systems

export interface TaskResponseDto {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  dueDate?: string;  // ISO string
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface TaskListResponseDto {
  tasks: TaskResponseDto[];
  total: number;
  page: number;
  limit: number;
}

// Example response:
// GET /api/tasks/123
// {
//   "id": "task_123",
//   "title": "Complete ADD example",
//   "description": "Build a simple CRUD example",
//   "priority": "high",
//   "status": "in_progress",
//   "dueDate": "2024-12-31T23:59:59.000Z",
//   "createdAt": "2024-01-15T10:30:00.000Z",
//   "updatedAt": "2024-01-15T14:20:00.000Z"
// }