// CORE ABSTRACTIONS - RuleSet for customer eligibility validation
// Pure function that validates customer can place orders

import { RuleSet, RuleReport } from '../../../shared/types/ruleset.types';
import { CreateOrderDto } from '../../boundary/dto/create-order.dto';

export interface CustomerEligibilityContext {
  orderDto: CreateOrderDto;
  customer: {
    id: string;
    status: 'active' | 'suspended' | 'banned';
    creditLimit: number;
    currentDebt: number;
    accountAge: number; // days since registration
    trustScore: number; // 0-100
  };
}

export class CustomerEligibilityRuleSet implements RuleSet<CustomerEligibilityContext> {

  async evaluate(context: CustomerEligibilityContext): Promise<RuleReport> {
    const reasons: string[] = [];
    let passed = true;

    // Rule 1: Customer must be active
    if (context.customer.status !== 'active') {
      passed = false;
      reasons.push(`Customer account is ${context.customer.status} and cannot place orders`);
    }

    // Rule 2: Customer must not exceed credit limit
    const orderTotal = context.orderDto.items.reduce((sum, item) =>
      sum + (item.price * item.quantity), 0
    );

    const projectedDebt = context.customer.currentDebt + orderTotal;
    if (projectedDebt > context.customer.creditLimit) {
      passed = false;
      reasons.push(
        `Order would exceed credit limit. ` +
        `Current debt: $${context.customer.currentDebt}, ` +
        `Order total: $${orderTotal}, ` +
        `Credit limit: $${context.customer.creditLimit}`
      );
    }

    // Rule 3: New customers have order value limits
    if (context.customer.accountAge < 30 && orderTotal > 500) {
      passed = false;
      reasons.push(
        `New customers (account age: ${context.customer.accountAge} days) ` +
        `cannot place orders over $500. Order total: $${orderTotal}`
      );
    }

    // Rule 4: Low trust score customers need manual approval for high-value orders
    if (context.customer.trustScore < 50 && orderTotal > 1000) {
      passed = false;
      reasons.push(
        `Customer trust score (${context.customer.trustScore}) requires ` +
        `manual approval for orders over $1000. Order total: $${orderTotal}`
      );
    }

    // Rule 5: Check for suspicious ordering patterns
    if (this.hasSuspiciousPattern(context)) {
      passed = false;
      reasons.push('Order pattern flagged as potentially fraudulent');
    }

    return {
      ruleName: 'CustomerEligibilityRuleSet',
      passed,
      reasons,
      evaluatedAt: new Date(),
      metadata: {
        customerId: context.customer.id,
        orderValue: orderTotal,
        creditUtilization: (projectedDebt / context.customer.creditLimit) * 100
      }
    };
  }

  private hasSuspiciousPattern(context: CustomerEligibilityContext): boolean {
    // Rule 5a: Too many high-value items for new customer
    const highValueItems = context.orderDto.items.filter(item => item.price > 200);
    if (context.customer.accountAge < 7 && highValueItems.length > 2) {
      return true;
    }

    // Rule 5b: Unusual quantity patterns
    const totalQuantity = context.orderDto.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQuantity > 20 && context.customer.trustScore < 70) {
      return true;
    }

    // Rule 5c: Geographic mismatch (simplified)
    if (context.orderDto.shippingAddress?.country !== context.orderDto.billingAddress?.country) {
      return context.customer.trustScore < 80;
    }

    return false;
  }

  // Utility method for rule testing
  static async testRule(context: CustomerEligibilityContext): Promise<RuleReport> {
    const ruleSet = new CustomerEligibilityRuleSet();
    return await ruleSet.evaluate(context);
  }
}

/*
Key RuleSet principles demonstrated:

1. **Pure function**: No side effects, deterministic output
   - Same input always produces same result
   - No external state dependencies
   - Easy to test and reason about

2. **Single responsibility**: Only validates customer eligibility
   - Doesn't check inventory or payment methods
   - Focused on one aspect of business rules

3. **Rich reporting**: Detailed reasons for failures
   - Actionable error messages
   - Metadata for debugging and analytics
   - Clear pass/fail status

4. **Business-focused**: Rules express domain knowledge
   - Credit limits, trust scores, account age
   - Fraud detection patterns
   - Customer lifecycle considerations

5. **Composable**: Can be combined with other RuleSets
   - Used in Checkpoint with other rules
   - Independent of other validation logic

6. **Testable**: Easy to unit test with mock data
   - No dependencies on external services
   - Clear input/output contract

Example usage in Checkpoint:

```typescript
const checkpoint = new Checkpoint()
  .add(new CustomerEligibilityRuleSet())
  .add(new InventoryAvailabilityRuleSet())
  .add(new PaymentValidationRuleSet());

const context = {
  orderDto: createOrderDto,
  customer: customerData,
  inventory: inventoryData,
  paymentMethod: paymentData
};

const result = await checkpoint.run(context);
if (!result.passed) {
  throw new ValidationError(result.reasons);
}
```

This approach makes business rules:
- Explicit and discoverable
- Easy to modify without affecting other rules
- Testable in isolation
- Reusable across different operations
*/