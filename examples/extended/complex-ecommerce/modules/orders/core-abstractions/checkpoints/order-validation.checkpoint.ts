// CORE ABSTRACTIONS - Checkpoint for order validation
// Combines multiple RuleSets into a validation pipeline

import { Checkpoint, RuleReport } from '../../../shared/types/ruleset.types';
import { CustomerEligibilityRuleSet, CustomerEligibilityContext } from '../rulesets/customer-eligibility.ruleset';
import { InventoryAvailabilityRuleSet, InventoryAvailabilityContext } from '../rulesets/inventory-availability.ruleset';
import { PaymentValidationRuleSet, PaymentValidationContext } from '../rulesets/payment-validation.ruleset';
import { ShippingValidationRuleSet, ShippingValidationContext } from '../rulesets/shipping-validation.ruleset';

// Combined context for all order validation rules
export interface OrderValidationContext extends
  CustomerEligibilityContext,
  InventoryAvailabilityContext,
  PaymentValidationContext,
  ShippingValidationContext {
  // Additional context-specific fields
  orderMetadata: {
    source: 'web' | 'mobile' | 'api' | 'admin';
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  };
}

export class OrderValidationCheckpoint implements Checkpoint<OrderValidationContext> {
  private ruleSets: Array<{
    rule: any;
    weight: number;
    critical: boolean;
  }> = [];

  constructor() {
    // Initialize with default rule configuration
    this.addRule(new CustomerEligibilityRuleSet(), 1.0, true);
    this.addRule(new InventoryAvailabilityRuleSet(), 1.0, true);
    this.addRule(new PaymentValidationRuleSet(), 0.8, true);
    this.addRule(new ShippingValidationRuleSet(), 0.6, false);
  }

  // Add a rule with weight and criticality
  addRule(ruleSet: any, weight: number = 1.0, critical: boolean = false): OrderValidationCheckpoint {
    this.ruleSets.push({ rule: ruleSet, weight, critical });
    return this;
  }

  // Remove a specific rule type
  removeRule(ruleType: any): OrderValidationCheckpoint {
    this.ruleSets = this.ruleSets.filter(rs => !(rs.rule instanceof ruleType));
    return this;
  }

  // Run all rules and aggregate results
  async run(context: OrderValidationContext): Promise<RuleReport> {
    const startTime = Date.now();
    const individualReports: RuleReport[] = [];
    const allReasons: string[] = [];
    let overallPassed = true;
    let criticalFailure = false;

    // Execute all rules
    for (const { rule, weight, critical } of this.ruleSets) {
      try {
        const report = await rule.evaluate(context);
        individualReports.push(report);

        if (!report.passed) {
          overallPassed = false;
          allReasons.push(...report.reasons);

          if (critical) {
            criticalFailure = true;
          }
        }
      } catch (error) {
        overallPassed = false;
        criticalFailure = true;
        allReasons.push(`Rule evaluation failed: ${rule.constructor.name} - ${error.message}`);

        // Log error for monitoring
        console.error(`Rule evaluation error in ${rule.constructor.name}:`, error);
      }
    }

    // Calculate confidence score based on weighted results
    const confidenceScore = this.calculateConfidenceScore(individualReports);

    const executionTime = Date.now() - startTime;

    return {
      ruleName: 'OrderValidationCheckpoint',
      passed: overallPassed,
      reasons: allReasons,
      evaluatedAt: new Date(),
      metadata: {
        executionTimeMs: executionTime,
        rulesExecuted: this.ruleSets.length,
        criticalFailure,
        confidenceScore,
        individualReports,
        context: {
          orderId: context.orderDto.id || 'new',
          customerId: context.customer.id,
          orderValue: context.orderDto.items.reduce(
            (sum, item) => sum + (item.price * item.quantity), 0
          ),
          source: context.orderMetadata.source
        }
      }
    };
  }

  // Calculate weighted confidence score
  private calculateConfidenceScore(reports: RuleReport[]): number {
    if (reports.length === 0) return 0;

    let totalWeight = 0;
    let passedWeight = 0;

    for (let i = 0; i < reports.length; i++) {
      const report = reports[i];
      const { weight } = this.ruleSets[i];

      totalWeight += weight;
      if (report.passed) {
        passedWeight += weight;
      }
    }

    return Math.round((passedWeight / totalWeight) * 100);
  }

  // Static factory methods for common configurations
  static forStandardOrders(): OrderValidationCheckpoint {
    return new OrderValidationCheckpoint();
  }

  static forHighValueOrders(): OrderValidationCheckpoint {
    return new OrderValidationCheckpoint()
      .addRule(new EnhancedFraudDetectionRuleSet(), 1.2, true)
      .addRule(new ComplianceCheckRuleSet(), 1.0, true);
  }

  static forInternalOrders(): OrderValidationCheckpoint {
    return new OrderValidationCheckpoint()
      .removeRule(CustomerEligibilityRuleSet)
      .removeRule(PaymentValidationRuleSet);
  }

  static forGuestCheckout(): OrderValidationCheckpoint {
    return new OrderValidationCheckpoint()
      .addRule(new GuestOrderLimitRuleSet(), 1.0, true)
      .addRule(new EnhancedFraudDetectionRuleSet(), 1.5, true);
  }

  // Utility for rule analysis and debugging
  async analyzeRules(context: OrderValidationContext): Promise<{
    ruleAnalysis: Array<{
      ruleName: string;
      passed: boolean;
      executionTime: number;
      weight: number;
      critical: boolean;
      reasons: string[];
    }>;
    recommendations: string[];
  }> {
    const ruleAnalysis = [];
    const recommendations = [];

    for (const { rule, weight, critical } of this.ruleSets) {
      const startTime = Date.now();
      const report = await rule.evaluate(context);
      const executionTime = Date.now() - startTime;

      ruleAnalysis.push({
        ruleName: rule.constructor.name,
        passed: report.passed,
        executionTime,
        weight,
        critical,
        reasons: report.reasons
      });

      // Generate recommendations
      if (!report.passed && critical) {
        recommendations.push(`Critical rule failure: ${rule.constructor.name}`);
      }
    }

    return { ruleAnalysis, recommendations };
  }
}

// Placeholder classes for advanced rules (would be implemented separately)
class EnhancedFraudDetectionRuleSet {
  async evaluate(context: any): Promise<RuleReport> {
    // Enhanced fraud detection logic
    return {
      ruleName: 'EnhancedFraudDetectionRuleSet',
      passed: true,
      reasons: [],
      evaluatedAt: new Date()
    };
  }
}

class ComplianceCheckRuleSet {
  async evaluate(context: any): Promise<RuleReport> {
    // Regulatory compliance checks
    return {
      ruleName: 'ComplianceCheckRuleSet',
      passed: true,
      reasons: [],
      evaluatedAt: new Date()
    };
  }
}

class GuestOrderLimitRuleSet {
  async evaluate(context: any): Promise<RuleReport> {
    // Guest order limitations
    return {
      ruleName: 'GuestOrderLimitRuleSet',
      passed: true,
      reasons: [],
      evaluatedAt: new Date()
    };
  }
}

/*
Key Checkpoint principles demonstrated:

1. **Composition over inheritance**: Combines rules instead of extending classes
   - Flexible rule combinations
   - Easy to add/remove rules
   - Different configurations for different scenarios

2. **Weighted validation**: Rules have different importance levels
   - Critical rules vs. warning rules
   - Confidence scoring based on weights
   - Graceful degradation on non-critical failures

3. **Factory patterns**: Pre-configured checkpoints for common scenarios
   - Standard orders, high-value orders, guest checkout
   - Reduces duplication and ensures consistency
   - Easy to maintain common configurations

4. **Rich reporting**: Detailed analysis of validation results
   - Individual rule reports
   - Aggregate confidence scores
   - Performance metrics (execution time)
   - Debugging and analysis tools

5. **Error resilience**: Handles rule evaluation failures gracefully
   - Continues execution even if individual rules fail
   - Logs errors for monitoring
   - Marks failures appropriately

6. **Performance monitoring**: Tracks execution time
   - Individual rule performance
   - Overall checkpoint performance
   - Helps identify slow rules

Example usage in TGO:

```typescript
export class CreateOrderTGO {
  async handle(dto: CreateOrderDto): Promise<OrderCreated> {
    const context = await this.buildValidationContext(dto);

    // Use appropriate checkpoint for order type
    const checkpoint = dto.value > 1000
      ? OrderValidationCheckpoint.forHighValueOrders()
      : OrderValidationCheckpoint.forStandardOrders();

    const result = await checkpoint.run(context);

    if (!result.passed) {
      throw new ValidationError(result.reasons, result.metadata);
    }

    // Proceed with order creation...
  }
}
```

This pattern makes validation:
- Configurable and flexible
- Comprehensive and thorough
- Performant and monitorable
- Maintainable and testable
*/