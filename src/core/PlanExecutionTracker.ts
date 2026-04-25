// src/core/PlanExecutionTracker.ts
// Monitors progress through the execution plan and detects deviations

import { ExecutionStep } from './PlanningService';

export interface StepProgress {
  step: ExecutionStep;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  toolsUsed: string[];
  startTime?: number;
  endTime?: number;
  errorMessage?: string;
}

export class PlanExecutionTracker {
  private stepProgress: Map<number, StepProgress>;
  private currentStepIndex: number;
  private planStartTime: number;

  constructor(steps: ExecutionStep[]) {
    this.stepProgress = new Map();
    this.currentStepIndex = 0;
    this.planStartTime = Date.now();

    // Initialize all steps as pending
    steps.forEach((step, index) => {
      this.stepProgress.set(index, {
        step,
        status: 'pending',
        toolsUsed: [],
      });
    });
  }

  /**
   * Mark a step as in progress
   */
  startStep(stepIndex: number): void {
    const progress = this.stepProgress.get(stepIndex);
    if (progress) {
      progress.status = 'in_progress';
      progress.startTime = Date.now();
      this.currentStepIndex = stepIndex;
    }
  }

  /**
   * Mark a step as completed
   */
  completeStep(stepIndex: number): void {
    const progress = this.stepProgress.get(stepIndex);
    if (progress) {
      progress.status = 'completed';
      progress.endTime = Date.now();
    }
  }

  /**
   * Mark a step as failed
   */
  failStep(stepIndex: number, errorMessage: string): void {
    const progress = this.stepProgress.get(stepIndex);
    if (progress) {
      progress.status = 'failed';
      progress.endTime = Date.now();
      progress.errorMessage = errorMessage;
    }
  }

  /**
   * Skip a step (e.g., dependencies not met)
   */
  skipStep(stepIndex: number): void {
    const progress = this.stepProgress.get(stepIndex);
    if (progress) {
      progress.status = 'skipped';
      progress.endTime = Date.now();
    }
  }

  /**
   * Record tool usage for a step
   */
  recordToolUsage(stepIndex: number, toolName: string): void {
    const progress = this.stepProgress.get(stepIndex);
    if (progress && !progress.toolsUsed.includes(toolName)) {
      progress.toolsUsed.push(toolName);
    }
  }

  /**
   * Get the current step index
   */
  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  /**
   * Get progress for a specific step
   */
  getStepProgress(stepIndex: number): StepProgress | undefined {
    return this.stepProgress.get(stepIndex);
  }

  /**
   * Get all step progresses
   */
  getAllProgress(): StepProgress[] {
    const result: StepProgress[] = [];
    for (let i = 0; i < this.stepProgress.size; i++) {
      const progress = this.stepProgress.get(i);
      if (progress) {
        result.push(progress);
      }
    }
    return result;
  }

  /**
   * Check if a step has completed successfully
   */
  isStepCompleted(stepIndex: number): boolean {
    const progress = this.stepProgress.get(stepIndex);
    return progress?.status === 'completed';
  }

  /**
   * Check if all dependencies for a step are met
   */
  areDependenciesMet(step: ExecutionStep): boolean {
    if (step.dependencies.length === 0) {
      return true;
    }

    return step.dependencies.every(depIndex => {
      const depProgress = this.stepProgress.get(depIndex);
      return depProgress?.status === 'completed';
    });
  }

  /**
   * Detect if execution is deviating from the plan
   * Returns deviation description if detected, null otherwise
   */
  detectDeviation(toolName: string, stepIndex: number): string | null {
    const step = this.stepProgress.get(stepIndex)?.step;
    if (!step) {
      return null;
    }

    // Check if current step has started
    const currentProgress = this.stepProgress.get(stepIndex);
    if (!currentProgress || currentProgress.status === 'pending') {
      return `Tool '${toolName}' called before step ${stepIndex} started`;
    }

    // Check if tool is applicable to current step
    if (
      step.expectedTools.length > 0 &&
      !step.expectedTools.includes(toolName)
    ) {
      return `Tool '${toolName}' not expected in step ${stepIndex} (expected: ${step.expectedTools.join(', ')})`;
    }

    // Check if there are failed dependencies
    const failedDeps = step.dependencies.filter(
      depIndex => this.stepProgress.get(depIndex)?.status === 'failed'
    );
    if (failedDeps.length > 0) {
      return `Step ${stepIndex} has failed dependencies: step(s) ${failedDeps.join(', ')}`;
    }

    return null;
  }

  /**
   * Get a summary of progress so far
   */
  getSummary(): string {
    const allProgress = this.getAllProgress();
    const completed = allProgress.filter(p => p.status === 'completed').length;
    const failed = allProgress.filter(p => p.status === 'failed').length;
    const inProgress = allProgress.filter(p => p.status === 'in_progress').length;
    const pending = allProgress.filter(p => p.status === 'pending').length;

    const elapsed = Date.now() - this.planStartTime;

    return (
      `Plan progress: ${completed}/${allProgress.length} completed, ` +
      `${inProgress} in progress, ${failed} failed, ${pending} pending (${elapsed}ms elapsed)`
    );
  }

  /**
   * Get a detailed report of what's been done so far
   */
  getDetailedReport(): string {
    const allProgress = this.getAllProgress();
    let report = 'Plan Execution Report\n\n';

    allProgress.forEach(p => {
      const icon =
        p.status === 'completed'
          ? '✓'
          : p.status === 'failed'
            ? '✗'
            : p.status === 'in_progress'
              ? '→'
              : p.status === 'skipped'
                ? '⊘'
                : '·';

      report += `${icon} Step ${p.step.stepIndex + 1}: ${p.step.description}\n`;
      report += `  Status: ${p.status}\n`;

      if (p.toolsUsed.length > 0) {
        report += `  Tools used: ${p.toolsUsed.join(', ')}\n`;
      }

      if (p.errorMessage) {
        report += `  Error: ${p.errorMessage}\n`;
      }

      if (p.startTime && p.endTime) {
        const duration = p.endTime - p.startTime;
        report += `  Duration: ${duration}ms\n`;
      }

      report += '\n';
    });

    report += this.getSummary();

    return report;
  }
}
