// Main entry point - demonstrates the ADD architecture in action

import { ContainerFactory } from './bootstrap/container';
import { TaskOperator } from './operators/task.operator';

async function main() {
  console.log('🚀 Starting Simple CRUD Example - ADD Architecture Demo\n');

  // 1. Bootstrap - Create and configure DI container
  const container = ContainerFactory.create('development');
  console.log('✅ DI Container configured for development');

  // 2. Resolve the main business service
  const taskOperator = container.resolve<TaskOperator>('TaskOperator');
  console.log('✅ TaskOperator resolved with all dependencies\n');

  // 3. Demonstrate CRUD operations
  await demonstrateCRUDOperations(taskOperator);

  // 4. Demonstrate business queries
  await demonstrateBusinessQueries(taskOperator);

  // 5. Demonstrate error handling
  await demonstrateErrorHandling(taskOperator);

  console.log('\n🎉 Demo completed! Check the code to see ADD principles in action.');
}

async function demonstrateCRUDOperations(taskOperator: TaskOperator) {
  console.log('📝 CRUD Operations Demo');
  console.log('======================');

  try {
    // CREATE - Add a new task
    console.log('\n1. Creating a new task...');
    const newTask = await taskOperator.createTask({
      title: 'Learn ADD Architecture',
      description: 'Study the principles and implement a simple example',
      priority: 'high',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    console.log(`   ✅ Created task: ${newTask.id} - "${newTask.title}"`);

    // READ - Get the task back
    console.log('\n2. Reading the task...');
    const retrievedTask = await taskOperator.getTaskById(newTask.id);
    console.log(`   ✅ Retrieved: ${retrievedTask?.title} (${retrievedTask?.status})`);

    // UPDATE - Change task status
    console.log('\n3. Updating task status...');
    const updatedTask = await taskOperator.changeTaskStatus(newTask.id, 'in_progress');
    console.log(`   ✅ Status changed to: ${updatedTask.status}`);

    // UPDATE - Modify task content
    console.log('\n4. Updating task content...');
    const modifiedTask = await taskOperator.updateTask(newTask.id, {
      title: 'Master ADD Architecture',
      description: 'Deep dive into ADD principles and build multiple examples'
    });
    console.log(`   ✅ Title updated to: "${modifiedTask.title}"`);

    // LIST - Show all tasks
    console.log('\n5. Listing all tasks...');
    const taskList = await taskOperator.listTasks(1, 5);
    console.log(`   ✅ Found ${taskList.total} total tasks:`);
    taskList.tasks.forEach(task => {
      console.log(`      - ${task.title} (${task.status}, ${task.priority})`);
    });

    // DELETE - Remove the task
    console.log('\n6. Deleting the task...');
    // First complete it (business rule: can't delete in-progress tasks)
    await taskOperator.changeTaskStatus(newTask.id, 'completed');
    const deleted = await taskOperator.deleteTask(newTask.id);
    console.log(`   ✅ Task deleted: ${deleted}`);

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
}

async function demonstrateBusinessQueries(taskOperator: TaskOperator) {
  console.log('\n🔍 Business Queries Demo');
  console.log('========================');

  try {
    // Get active tasks
    console.log('\n1. Finding active tasks...');
    const activeTasks = await taskOperator.getActiveTasks();
    console.log(`   ✅ Found ${activeTasks.length} active tasks:`);
    activeTasks.forEach(task => {
      console.log(`      - ${task.title} (${task.status})`);
    });

    // Get overdue tasks
    console.log('\n2. Finding overdue tasks...');
    const overdueTasks = await taskOperator.getOverdueTasks();
    console.log(`   ✅ Found ${overdueTasks.length} overdue tasks:`);
    overdueTasks.forEach(task => {
      console.log(`      - ${task.title} (due: ${task.dueDate})`);
    });

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
}

async function demonstrateErrorHandling(taskOperator: TaskOperator) {
  console.log('\n⚠️  Error Handling Demo');
  console.log('=======================');

  // Try to create duplicate task
  console.log('\n1. Testing business rule: duplicate task titles...');
  try {
    await taskOperator.createTask({
      title: 'Complete project documentation', // This title already exists from seed data
      description: 'This should fail due to duplicate title',
      priority: 'low'
    });
  } catch (error) {
    console.log(`   ✅ Business rule enforced: ${error.message}`);
  }

  // Try to access non-existent task
  console.log('\n2. Testing not found scenario...');
  const nonExistentTask = await taskOperator.getTaskById('task_does_not_exist');
  console.log(`   ✅ Non-existent task handled gracefully: ${nonExistentTask === null}`);

  // Try invalid status transition
  console.log('\n3. Testing invalid status transition...');
  try {
    // First get an existing task
    const taskList = await taskOperator.listTasks(1, 1);
    if (taskList.tasks.length > 0) {
      const task = taskList.tasks[0];
      // Complete it first
      await taskOperator.changeTaskStatus(task.id, 'completed');
      // Then try to change it again (should fail)
      await taskOperator.changeTaskStatus(task.id, 'in_progress');
    }
  } catch (error) {
    console.log(`   ✅ Invalid transition prevented: ${error.message}`);
  }

  // Try to delete in-progress task
  console.log('\n4. Testing business rule: cannot delete in-progress tasks...');
  try {
    // Create a task and set it to in-progress
    const newTask = await taskOperator.createTask({
      title: 'Task to test deletion',
      description: 'This task will be set to in-progress',
      priority: 'medium'
    });
    await taskOperator.changeTaskStatus(newTask.id, 'in_progress');

    // Try to delete it (should fail)
    await taskOperator.deleteTask(newTask.id);
  } catch (error) {
    console.log(`   ✅ Deletion rule enforced: ${error.message}`);
  }
}

// Run the demo
main().catch(error => {
  console.error('💥 Demo failed:', error);
  process.exit(1);
});

/*
This demo showcases ADD principles:

1. **Separation of Concerns**:
   - Bootstrap handles DI configuration
   - Operator handles business logic
   - Repository handles storage
   - Each layer has a single responsibility

2. **Dependency Inversion**:
   - TaskOperator depends on ITaskRepository interface
   - Concrete implementation (InMemoryTaskRepository) is injected
   - Easy to swap implementations

3. **Business Logic in the Right Place**:
   - Business rules in Entities and Operators
   - Storage logic in Implementations
   - Wiring logic in Bootstrap

4. **Clean Error Handling**:
   - Domain-meaningful error messages
   - Business rules enforced consistently
   - Graceful handling of edge cases

5. **Testability**:
   - Pure business logic easy to test
   - Dependencies can be mocked
   - Clear separation enables focused testing

To run this demo:
```bash
npx ts-node main.ts
```

Try modifying the container configuration to use different implementations!
*/