# Coordinator Operators Pattern

## Intent
Orchestrate complex business workflows by coordinating multiple operators and external systems while maintaining loose coupling and enabling flexible business process management.

## Problem
- Business workflows span multiple bounded contexts and external systems
- Need to coordinate between different operators without tight coupling
- Complex decision trees and conditional logic in business processes
- Requirements change frequently, affecting workflow steps
- Difficult to test and monitor complex business processes
- Need to handle partial failures and retry logic

## Solution
Create specialized Coordinator Operators that orchestrate business workflows using a declarative approach, managing state transitions, handling errors, and enabling process flexibility.

## Structure

```mermaid
graph TB
    subgraph "Boundary"
        Controller[Controller]
        WorkflowAPI[Workflow API]
    end

    subgraph "Coordinators"
        Coordinator[Coordinator Operator]
        WorkflowEngine[Workflow Engine]
        StateManager[State Manager]
    end

    subgraph "Business Operators"
        UserOp[User Operator]
        OrderOp[Order Operator]
        PaymentOp[Payment Operator]
        InventoryOp[Inventory Operator]
        NotificationOp[Notification Operator]
    end

    subgraph "Core Abstractions"
        subgraph "Workflow Ports"
            WorkflowRepo[IWorkflowRepository]
            StateStore[IWorkflowStateStore]
            EventBus[IEventBus]
        end

        subgraph "External Ports"
            PaymentGateway[IPaymentGateway]
            EmailService[IEmailService]
        end
    end

    subgraph "Implementations"
        WorkflowDB[PostgresWorkflowRepo]
        RedisStateStore[RedisStateStore]
        StripeGateway[StripeGateway]
    end

    Controller --> Coordinator
    WorkflowAPI --> Coordinator
    Coordinator --> WorkflowEngine
    Coordinator --> StateManager

    WorkflowEngine --> UserOp
    WorkflowEngine --> OrderOp
    WorkflowEngine --> PaymentOp
    WorkflowEngine --> InventoryOp
    WorkflowEngine --> NotificationOp

    StateManager --> WorkflowRepo
    StateManager --> StateStore
    Coordinator --> EventBus

    WorkflowRepo <|.. WorkflowDB
    StateStore <|.. RedisStateStore
    PaymentGateway <|.. StripeGateway

    style Coordinator fill:#e8f5e8,stroke:#2e7d32,stroke-width:3px
    style WorkflowEngine fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    style StateManager fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
```

## Implementation

### 1. Workflow Definition (Core Abstractions)
```typescript
// core-abstractions/entities/workflow.entity.ts
export class WorkflowDefinition {
  constructor(
    public readonly id: WorkflowId,
    public readonly name: string,
    public readonly version: string,
    public readonly steps: WorkflowStep[],
    public readonly conditions: WorkflowCondition[],
    public readonly retryPolicy: RetryPolicy,
    public readonly timeoutPolicy: TimeoutPolicy,
    public readonly createdAt: Date
  ) {}

  static create(dto: CreateWorkflowDto): WorkflowDefinition {
    return new WorkflowDefinition(
      WorkflowId.generate(),
      dto.name,
      dto.version,
      dto.steps.map(step => WorkflowStep.fromDto(step)),
      dto.conditions.map(cond => WorkflowCondition.fromDto(cond)),
      RetryPolicy.fromDto(dto.retryPolicy),
      TimeoutPolicy.fromDto(dto.timeoutPolicy),
      new Date()
    );
  }

  getNextStep(currentStepId: string, context: WorkflowContext): WorkflowStep | null {
    const currentStep = this.steps.find(s => s.id === currentStepId);
    if (!currentStep) return null;

    // Evaluate conditions to determine next step
    for (const condition of this.conditions) {
      if (condition.sourceStepId === currentStepId && condition.evaluate(context)) {
        return this.steps.find(s => s.id === condition.targetStepId) || null;
      }
    }

    // Default to next step in sequence
    const currentIndex = this.steps.indexOf(currentStep);
    return currentIndex < this.steps.length - 1 ? this.steps[currentIndex + 1] : null;
  }
}

export class WorkflowStep {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly type: WorkflowStepType,
    public readonly operatorName: string,
    public readonly methodName: string,
    public readonly inputMapping: InputMapping,
    public readonly outputMapping: OutputMapping,
    public readonly errorHandling: ErrorHandling,
    public readonly isRequired: boolean = true
  ) {}

  static fromDto(dto: WorkflowStepDto): WorkflowStep {
    return new WorkflowStep(
      dto.id,
      dto.name,
      WorkflowStepType.fromString(dto.type),
      dto.operatorName,
      dto.methodName,
      InputMapping.fromDto(dto.inputMapping),
      OutputMapping.fromDto(dto.outputMapping),
      ErrorHandling.fromDto(dto.errorHandling),
      dto.isRequired ?? true
    );
  }
}

export enum WorkflowStepType {
  OPERATOR_CALL = 'OPERATOR_CALL',
  DECISION = 'DECISION',
  PARALLEL = 'PARALLEL',
  WAIT = 'WAIT',
  COMPENSATION = 'COMPENSATION'
}
```

### 2. Workflow State Management
```typescript
// core-abstractions/entities/workflow-instance.entity.ts
export class WorkflowInstance {
  constructor(
    public readonly id: WorkflowInstanceId,
    public readonly workflowId: WorkflowId,
    public readonly status: WorkflowStatus,
    public readonly currentStepId: string | null,
    public readonly context: WorkflowContext,
    public readonly history: WorkflowHistoryEntry[],
    public readonly startedAt: Date,
    public readonly completedAt: Date | null,
    public readonly error: WorkflowError | null
  ) {}

  static start(workflowId: WorkflowId, initialContext: any): WorkflowInstance {
    return new WorkflowInstance(
      WorkflowInstanceId.generate(),
      workflowId,
      WorkflowStatus.RUNNING,
      null,
      WorkflowContext.create(initialContext),
      [],
      new Date(),
      null,
      null
    );
  }

  moveToStep(stepId: string): WorkflowInstance {
    return new WorkflowInstance(
      this.id,
      this.workflowId,
      WorkflowStatus.RUNNING,
      stepId,
      this.context,
      this.history,
      this.startedAt,
      this.completedAt,
      this.error
    );
  }

  completeStep(stepId: string, result: any): WorkflowInstance {
    const historyEntry = new WorkflowHistoryEntry(
      stepId,
      WorkflowStepStatus.COMPLETED,
      result,
      null,
      new Date()
    );

    const updatedContext = this.context.mergeResult(stepId, result);

    return new WorkflowInstance(
      this.id,
      this.workflowId,
      this.status,
      this.currentStepId,
      updatedContext,
      [...this.history, historyEntry],
      this.startedAt,
      this.completedAt,
      this.error
    );
  }

  failStep(stepId: string, error: Error): WorkflowInstance {
    const historyEntry = new WorkflowHistoryEntry(
      stepId,
      WorkflowStepStatus.FAILED,
      null,
      error.message,
      new Date()
    );

    return new WorkflowInstance(
      this.id,
      this.workflowId,
      WorkflowStatus.FAILED,
      stepId,
      this.context,
      [...this.history, historyEntry],
      this.startedAt,
      null,
      new WorkflowError(error.message, stepId, new Date())
    );
  }

  complete(): WorkflowInstance {
    return new WorkflowInstance(
      this.id,
      this.workflowId,
      WorkflowStatus.COMPLETED,
      this.currentStepId,
      this.context,
      this.history,
      this.startedAt,
      new Date(),
      this.error
    );
  }
}

export class WorkflowContext {
  constructor(
    public readonly data: Map<string, any>,
    public readonly metadata: WorkflowMetadata
  ) {}

  static create(initialData: any): WorkflowContext {
    return new WorkflowContext(
      new Map(Object.entries(initialData)),
      WorkflowMetadata.default()
    );
  }

  get(key: string): any {
    return this.data.get(key);
  }

  set(key: string, value: any): WorkflowContext {
    const newData = new Map(this.data);
    newData.set(key, value);
    return new WorkflowContext(newData, this.metadata);
  }

  mergeResult(stepId: string, result: any): WorkflowContext {
    const newData = new Map(this.data);
    newData.set(`step_${stepId}_result`, result);

    // If result is an object, merge its properties
    if (typeof result === 'object' && result !== null) {
      Object.entries(result).forEach(([key, value]) => {
        newData.set(key, value);
      });
    }

    return new WorkflowContext(newData, this.metadata);
  }
}
```

### 3. Workflow Ports
```typescript
// core-abstractions/ports/workflow.repository.ts
export interface IWorkflowRepository {
  save(workflow: WorkflowDefinition): Promise<void>;
  findById(id: WorkflowId): Promise<WorkflowDefinition | null>;
  findByName(name: string, version?: string): Promise<WorkflowDefinition | null>;
  findAll(): Promise<WorkflowDefinition[]>;
}

export interface IWorkflowStateStore {
  saveInstance(instance: WorkflowInstance): Promise<void>;
  findInstance(id: WorkflowInstanceId): Promise<WorkflowInstance | null>;
  findRunningInstances(): Promise<WorkflowInstance[]>;
  findInstancesByWorkflow(workflowId: WorkflowId): Promise<WorkflowInstance[]>;
  deleteInstance(id: WorkflowInstanceId): Promise<void>;
}

export interface IWorkflowEngine {
  executeStep(
    step: WorkflowStep,
    context: WorkflowContext,
    operators: Map<string, any>
  ): Promise<any>;

  evaluateCondition(
    condition: WorkflowCondition,
    context: WorkflowContext
  ): boolean;
}
```

### 4. Coordinator Operator Implementation
```typescript
// operators/order-processing.coordinator.ts
export class OrderProcessingCoordinator {
  constructor(
    private readonly workflowEngine: IWorkflowEngine,
    private readonly workflowRepo: IWorkflowRepository,
    private readonly stateStore: IWorkflowStateStore,
    private readonly eventBus: IEventBus,
    private readonly operators: Map<string, any> // Injected operators
  ) {}

  async processOrder(dto: ProcessOrderDto): Promise<OrderProcessingResult> {
    // Load workflow definition
    const workflow = await this.workflowRepo.findByName('order-processing', 'v1.2');
    if (!workflow) {
      throw new Error('Order processing workflow not found');
    }

    // Start workflow instance
    const instance = WorkflowInstance.start(workflow.id, {
      orderId: dto.orderId,
      customerId: dto.customerId,
      items: dto.items,
      paymentMethod: dto.paymentMethod,
      shippingAddress: dto.shippingAddress
    });

    await this.stateStore.saveInstance(instance);

    try {
      const result = await this.executeWorkflow(workflow, instance);

      await this.eventBus.emit(new WorkflowCompletedEvent(
        instance.id.value,
        workflow.name,
        result,
        new Date()
      ));

      return {
        success: true,
        workflowInstanceId: instance.id.value,
        result
      };

    } catch (error) {
      await this.handleWorkflowError(workflow, instance, error as Error);
      throw error;
    }
  }

  private async executeWorkflow(
    workflow: WorkflowDefinition,
    instance: WorkflowInstance
  ): Promise<any> {
    let currentInstance = instance;
    let currentStep = workflow.steps[0]; // Start with first step

    while (currentStep && currentInstance.status === WorkflowStatus.RUNNING) {
      currentInstance = currentInstance.moveToStep(currentStep.id);
      await this.stateStore.saveInstance(currentInstance);

      try {
        // Execute step
        const stepResult = await this.executeWorkflowStep(currentStep, currentInstance);

        // Update instance with step result
        currentInstance = currentInstance.completeStep(currentStep.id, stepResult);
        await this.stateStore.saveInstance(currentInstance);

        // Emit step completed event
        await this.eventBus.emit(new WorkflowStepCompletedEvent(
          currentInstance.id.value,
          currentStep.id,
          stepResult,
          new Date()
        ));

        // Determine next step
        currentStep = workflow.getNextStep(currentStep.id, currentInstance.context);

      } catch (error) {
        // Handle step failure
        if (currentStep.isRequired) {
          currentInstance = currentInstance.failStep(currentStep.id, error as Error);
          await this.stateStore.saveInstance(currentInstance);
          throw error;
        } else {
          // Optional step failed, continue to next step
          currentInstance = currentInstance.completeStep(currentStep.id, null);
          currentStep = workflow.getNextStep(currentStep.id, currentInstance.context);
        }
      }
    }

    // Complete workflow
    currentInstance = currentInstance.complete();
    await this.stateStore.saveInstance(currentInstance);

    return currentInstance.context.get('workflowResult');
  }

  private async executeWorkflowStep(
    step: WorkflowStep,
    instance: WorkflowInstance
  ): Promise<any> {
    switch (step.type) {
      case WorkflowStepType.OPERATOR_CALL:
        return await this.executeOperatorCall(step, instance);

      case WorkflowStepType.DECISION:
        return await this.executeDecision(step, instance);

      case WorkflowStepType.PARALLEL:
        return await this.executeParallelSteps(step, instance);

      case WorkflowStepType.WAIT:
        return await this.executeWait(step, instance);

      default:
        throw new Error(`Unsupported step type: ${step.type}`);
    }
  }

  private async executeOperatorCall(
    step: WorkflowStep,
    instance: WorkflowInstance
  ): Promise<any> {
    const operator = this.operators.get(step.operatorName);
    if (!operator) {
      throw new Error(`Operator not found: ${step.operatorName}`);
    }

    const method = operator[step.methodName];
    if (!method) {
      throw new Error(`Method not found: ${step.methodName} on ${step.operatorName}`);
    }

    // Map input from context
    const input = step.inputMapping.mapFromContext(instance.context);

    // Execute operator method
    const result = await method.call(operator, input);

    // Map output to context
    const outputMapping = step.outputMapping.mapToContext(result);

    return outputMapping;
  }

  private async executeDecision(
    step: WorkflowStep,
    instance: WorkflowInstance
  ): Promise<any> {
    // Evaluate decision logic based on context
    const decisionResult = this.evaluateDecisionLogic(step, instance.context);

    return {
      decision: decisionResult,
      stepId: step.id,
      timestamp: new Date()
    };
  }

  private async executeParallelSteps(
    step: WorkflowStep,
    instance: WorkflowInstance
  ): Promise<any> {
    const parallelSteps = step.inputMapping.get('parallelSteps') as WorkflowStep[];

    const promises = parallelSteps.map(parallelStep =>
      this.executeWorkflowStep(parallelStep, instance)
    );

    const results = await Promise.allSettled(promises);

    return {
      parallelResults: results,
      completedAt: new Date()
    };
  }

  private async executeWait(
    step: WorkflowStep,
    instance: WorkflowInstance
  ): Promise<any> {
    const waitDuration = step.inputMapping.get('duration') as number;

    await new Promise(resolve => setTimeout(resolve, waitDuration));

    return {
      waitedFor: waitDuration,
      completedAt: new Date()
    };
  }

  private async handleWorkflowError(
    workflow: WorkflowDefinition,
    instance: WorkflowInstance,
    error: Error
  ): Promise<void> {
    // Execute compensation steps if defined
    const compensationSteps = workflow.steps.filter(
      step => step.type === WorkflowStepType.COMPENSATION
    );

    for (const compensationStep of compensationSteps) {
      try {
        await this.executeWorkflowStep(compensationStep, instance);
      } catch (compensationError) {
        console.error(`Compensation step failed: ${compensationStep.id}`, compensationError);
      }
    }

    // Emit workflow failed event
    await this.eventBus.emit(new WorkflowFailedEvent(
      instance.id.value,
      workflow.name,
      error.message,
      new Date()
    ));
  }
}
```

### 5. Specialized Coordinators
```typescript
// operators/customer-onboarding.coordinator.ts
export class CustomerOnboardingCoordinator {
  constructor(
    private readonly userOperator: UserOperator,
    private readonly subscriptionOperator: SubscriptionOperator,
    private readonly notificationOperator: NotificationOperator,
    private readonly kycOperator: KYCOperator,
    private readonly eventBus: IEventBus
  ) {}

  async onboardCustomer(dto: OnboardCustomerDto): Promise<OnboardingResult> {
    const onboardingId = `onboarding-${Date.now()}`;

    try {
      // Step 1: Create user account
      const user = await this.userOperator.createUser({
        email: dto.email,
        fullName: dto.fullName,
        birthDate: dto.birthDate,
        phoneNumber: dto.phoneNumber
      });

      // Step 2: Send welcome email
      await this.notificationOperator.sendWelcomeEmail(user.id, {
        userName: user.fullName.value,
        nextSteps: ['Complete KYC', 'Choose subscription plan']
      });

      // Step 3: Initiate KYC process (if required)
      let kycResult = null;
      if (dto.requiresKYC) {
        kycResult = await this.kycOperator.initiateKYC({
          userId: user.id.value,
          documentType: dto.kycDocumentType,
          riskLevel: this.calculateRiskLevel(dto)
        });

        // Wait for KYC completion (async process)
        await this.waitForKYCCompletion(kycResult.processId, 30000); // 30 second timeout
      }

      // Step 4: Set up subscription (if provided)
      let subscription = null;
      if (dto.subscriptionPlan) {
        subscription = await this.subscriptionOperator.createSubscription({
          userId: user.id.value,
          planId: dto.subscriptionPlan,
          paymentMethod: dto.paymentMethod,
          billingCycle: dto.billingCycle || 'MONTHLY'
        });
      }

      // Step 5: Complete onboarding
      const completedUser = await this.userOperator.completeOnboarding(user.id, {
        kycStatus: kycResult?.status || 'NOT_REQUIRED',
        subscriptionId: subscription?.id.value,
        onboardingCompletedAt: new Date()
      });

      // Step 6: Send onboarding completion notification
      await this.notificationOperator.sendOnboardingComplete(user.id, {
        hasSubscription: !!subscription,
        kycCompleted: !!kycResult?.success,
        nextRecommendations: this.getNextRecommendations(completedUser)
      });

      await this.eventBus.emit(new CustomerOnboardingCompletedEvent(
        onboardingId,
        user.id.value,
        subscription?.id.value,
        kycResult?.processId,
        new Date()
      ));

      return {
        success: true,
        onboardingId,
        user: completedUser,
        subscription,
        kycResult,
        completedSteps: this.getCompletedSteps(dto, kycResult, subscription)
      };

    } catch (error) {
      await this.handleOnboardingFailure(onboardingId, dto, error as Error);
      throw error;
    }
  }

  private async waitForKYCCompletion(processId: string, timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.kycOperator.getKYCStatus(processId);

      if (status.isCompleted) {
        return;
      }

      if (status.isFailed) {
        throw new Error(`KYC process failed: ${status.failureReason}`);
      }

      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('KYC process timeout');
  }

  private calculateRiskLevel(dto: OnboardCustomerDto): string {
    // Risk assessment logic based on customer data
    let riskScore = 0;

    if (dto.countryCode && ['US', 'UK', 'DE'].includes(dto.countryCode)) {
      riskScore += 10;
    } else {
      riskScore += 5;
    }

    if (dto.annualIncome && dto.annualIncome > 100000) {
      riskScore += 10;
    }

    return riskScore >= 15 ? 'LOW' : 'MEDIUM';
  }

  private getNextRecommendations(user: User): string[] {
    const recommendations = [];

    if (!user.hasCompletedProfile()) {
      recommendations.push('Complete your profile');
    }

    if (!user.hasSubscription()) {
      recommendations.push('Choose a subscription plan');
    }

    recommendations.push('Explore our features');

    return recommendations;
  }

  private async handleOnboardingFailure(
    onboardingId: string,
    dto: OnboardCustomerDto,
    error: Error
  ): Promise<void> {
    // Cleanup partial onboarding data
    // Send failure notification
    // Log error for investigation

    await this.eventBus.emit(new CustomerOnboardingFailedEvent(
      onboardingId,
      dto.email,
      error.message,
      new Date()
    ));
  }
}
```

## Key Principles

### 1. **Declarative Workflow Definition**
- Workflows defined as data, not code
- Easy to modify without code changes
- Version control for workflow definitions

### 2. **State Management**
- Persistent workflow state
- Recovery from failures
- Audit trail of execution

### 3. **Loose Coupling**
- Coordinators don't depend on specific operator implementations
- Operators remain unaware of coordination
- Flexible composition of business processes

### 4. **Error Handling**
- Graceful failure handling
- Compensation actions
- Retry and timeout policies

## Benefits

1. **Business Agility**: Easy to modify workflows without code changes
2. **Observability**: Complete audit trail of business processes
3. **Testability**: Test workflows and operators independently
4. **Reliability**: Built-in error handling and recovery
5. **Scalability**: Asynchronous execution and state persistence
6. **Flexibility**: Reusable operators in different workflows

## Anti-Patterns

### ❌ Tight Coupling
```typescript
// DON'T: Direct dependencies on specific implementations
class OrderCoordinator {
  constructor(
    private postgresUserRepo: PostgresUserRepository, // Too specific
    private stripePayment: StripePaymentService       // Too specific
  ) {}
}
```

### ❌ Business Logic in Coordinators
```typescript
// DON'T: Put business logic in coordinators
class OrderCoordinator {
  async processOrder(dto: OrderDto): Promise<void> {
    // Business validation logic here
    if (dto.amount < 0) {
      throw new Error('Invalid amount');
    }

    // Price calculation logic here
    const tax = dto.amount * 0.1;
    const total = dto.amount + tax;
  }
}
```

### ❌ Monolithic Workflows
```typescript
// DON'T: Put everything in one massive workflow
const massiveWorkflow = {
  steps: [
    'validateUser',
    'checkInventory',
    'processPayment',
    'updateInventory',
    'sendEmail',
    'updateAnalytics',
    'generateReports',
    'updateCRM',
    'triggerMarketing',
    // ... 50 more steps
  ]
};
```

## Best Practices

1. **Single Responsibility**: Each coordinator handles one business process
2. **Stateless Operations**: Keep individual steps stateless
3. **Idempotent Steps**: Ensure steps can be safely retried
4. **Clear Boundaries**: Define clear start/end points for workflows
5. **Monitoring**: Track workflow performance and failure rates
6. **Documentation**: Document workflow logic and decision points
7. **Testing**: Test both happy path and error scenarios
8. **Versioning**: Version workflow definitions for backward compatibility

This pattern enables complex business process orchestration while maintaining the flexibility and testability that ADD promotes.