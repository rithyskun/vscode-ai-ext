// src/core/ExecutionReflector.ts
// Performs mid-execution reflection and analysis to adapt strategies

import { ExecutionContext, ToolExecutionRecord } from './ExecutionContext';
import { PlanExecutionTracker } from './PlanExecutionTracker';

export interface ReflectionResult {
  shouldContinue: boolean;
  strategyAdjustment: string | null;
  suggestions: string[];
  confidence: number; // 0-1
}

export class ExecutionReflector {
  private static instance: ExecutionReflector;
  private reflectionCheckpointInterval: number = 3; // Reflect every 3 tool calls

  private constructor() {}

  static getInstance(): ExecutionReflector {
    if (!ExecutionReflector.instance) {
      ExecutionReflector.instance = new ExecutionReflector();
    }
    return ExecutionReflector.instance;
  }

  /**
   * Set the interval for reflection checkpoints
   */
  setReflectionInterval(interval: number): void {
    this.reflectionCheckpointInterval = Math.max(1, interval);
  }

  /**
   * Check if a reflection checkpoint should occur
   */
  shouldReflect(toolCount: number): boolean {
    return toolCount > 0 && toolCount % this.reflectionCheckpointInterval === 0;
  }

  /**
   * Perform reflection on current execution state
   */
  reflect(
    context: ExecutionContext,
    planTracker: PlanExecutionTracker,
    originalRequest: string
  ): ReflectionResult {
    const history = context.getToolExecutionHistory();
    const errors = context.getErrors();
    const filesModified = context.getFilesModified();

    // Analyze execution so far
    const successRate = this.calculateSuccessRate(history);
    const errorPatterns = this.analyzeErrorPatterns(errors);
    const progressStatus = planTracker.getSummary();

    const suggestions: string[] = [];
    let strategyAdjustment: string | null = null;
    let confidence = 0.8;

    // Check for excessive errors
    if (errors.length > 2 && successRate < 0.5) {
      suggestions.push('Multiple errors detected. Consider breaking task into smaller steps.');
      strategyAdjustment = 'Switch to more cautious approach with additional validation.';
      confidence = 0.6;
    }

    // Check for repeated errors
    const repeatedErrors = errorPatterns.filter(p => p.count > 1);
    if (repeatedErrors.length > 0) {
      suggestions.push(
        `Repeated error detected: ${repeatedErrors[0].type}. ` +
        `Consider a different approach.`
      );
      if (!strategyAdjustment) {
        strategyAdjustment = `Try alternative approach for ${repeatedErrors[0].type} errors.`;
      }
    }

    // Check if too many iterations have passed
    if (context.getIterationCount() > 10) {
      suggestions.push(
        'Many iterations completed. Consider if task is on track or too complex.'
      );
      confidence = 0.5;
    }

    // Positive indicators
    if (successRate > 0.8 && errors.length === 0) {
      suggestions.push(
        `✓ Execution proceeding well (${history.length} successful tools, no errors).`
      );
      confidence = 0.95;
    }

    if (filesModified.length > 0) {
      suggestions.push(
        `Files modified so far: ${filesModified.join(', ')}`
      );
    }

    // Check for progress
    const allProgress = planTracker.getAllProgress();
    const completedSteps = allProgress.filter(p => p.status === 'completed').length;
    const totalSteps = allProgress.length;

    if (completedSteps > 0) {
      suggestions.push(
        `Plan progress: ${completedSteps}/${totalSteps} steps completed.`
      );
    }

    const shouldContinue = this.determineContinuation(
      successRate,
      errors.length,
      context.getIterationCount(),
      context.isMaxIterationsReached()
    );

    return {
      shouldContinue,
      strategyAdjustment,
      suggestions,
      confidence,
    };
  }

  private calculateSuccessRate(history: ToolExecutionRecord[]): number {
    if (history.length === 0) {
      return 1;
    }

    const successes = history.filter(h => h.success).length;
    return successes / history.length;
  }

  private analyzeErrorPatterns(
    errors: Array<{
      toolName: string;
      errorType: string;
      message: string;
      timestamp: number;
      attempts: number;
    }>
  ): Array<{ type: string; count: number; examples: string[] }> {
    const patterns = new Map<string, { type: string; count: number; examples: string[] }>();

    errors.forEach(error => {
      const key = `${error.toolName}/${error.errorType}`;
      const current = patterns.get(key) || { type: key, count: 0, examples: [] };
      current.count += Math.max(1, error.attempts);
      if (current.examples.length < 2) {
        current.examples.push(error.message);
      }
      patterns.set(key, current);
    });

    return Array.from(patterns.values()).sort((a, b) => b.count - a.count);
  }

  private determineContinuation(
    successRate: number,
    errorCount: number,
    iterations: number,
    maxReached: boolean
  ): boolean {
    // Stop if max iterations reached
    if (maxReached) {
      return false;
    }

    // Stop if too many errors without success
    if (errorCount > 5 && successRate < 0.3) {
      return false;
    }

    // Continue if making progress
    return true;
  }

  /**
   * Generate reflection message for display to user
   */
  formatReflection(result: ReflectionResult): string {
    let text = '🔍 **Execution Reflection**\n\n';

    if (result.suggestions.length > 0) {
      text += 'Observations:\n';
      result.suggestions.forEach(s => {
        text += `- ${s}\n`;
      });
      text += '\n';
    }

    if (result.strategyAdjustment) {
      text += `💡 Suggestion: ${result.strategyAdjustment}\n\n`;
    }

    text += `Confidence: ${(result.confidence * 100).toFixed(0)}%\n`;
    text += result.shouldContinue
      ? '→ Continuing execution...\n'
      : '⚠ Consider stopping or changing approach.\n';

    return text;
  }

  /**
   * Analyze if we're making progress toward the goal
   */
  analyzeProgress(
    originalRequest: string,
    recentTools: ToolExecutionRecord[],
    filesModified: string[]
  ): { isProgressional: boolean; description: string } {
    const requestLower = originalRequest.toLowerCase();

    // Check if recent tool usage aligns with request
    const readTools = recentTools.filter(t => t.toolName.includes('read')).length;
    const writeTools = recentTools.filter(t => t.toolName.includes('write')).length;
    const searchTools = recentTools.filter(t => t.toolName.includes('search')).length;

    let isProgressive = false;
    let description = '';

    if (
      requestLower.includes('create') ||
      requestLower.includes('write')
    ) {
      isProgressive = writeTools > 0;
      description = writeTools > 0 ? 'Creating/writing files as requested' : 'Not yet writing files';
    } else if (
      requestLower.includes('read') ||
      requestLower.includes('analyze')
    ) {
      isProgressive = readTools > 0;
      description = readTools > 0 ? 'Reading files for analysis' : 'Not yet reading files';
    } else if (requestLower.includes('search') || requestLower.includes('find')) {
      isProgressive = searchTools > 0;
      description = searchTools > 0 ? 'Searching for files' : 'Not yet searching';
    } else {
      // Generic task
      isProgressive = recentTools.length > 0;
      description = recentTools.length > 0 ? 'Tools being used' : 'Awaiting action';
    }

    if (filesModified.length > 0) {
      description += ` (${filesModified.length} files modified)`;
    }

    return { isProgressional: isProgressive, description };
  }

  /**
   * Detect whether execution appears stalled based on recent tool history.
   */
  detectExecutionStall(history: ToolExecutionRecord[], lookbackCount: number = 3): boolean {
    if (history.length < lookbackCount || lookbackCount <= 1) {
      return false;
    }

    const recent = history.slice(-lookbackCount);
    const allFailed = recent.every(record => !record.success);
    const sameTool = recent.every(record => record.toolName === recent[0].toolName);

    return allFailed && sameTool;
  }

  /**
   * Provide a recovery hint when execution appears stalled.
   */
  getStalledExecutionRecovery(lastToolName: string): string {
    return `Execution appears stuck around '${lastToolName}'. Try a different approach instead of repeating ${lastToolName}.`;
  }
}
