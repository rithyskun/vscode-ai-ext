// src/core/AgentLearningService.ts
// Records execution patterns and learns from successful/failed strategies

import { SolutionCache, CachedSolution } from './SolutionCache';

export interface ExecutionPattern {
  id: string;
  taskType: string;
  toolSequence: string[];
  successRate: number;
  usageCount: number;
  totalDuration: number;
  avgDuration: number;
  lastUsed: number;
}

export interface LearningMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  commonErrors: Array<{ error: string; count: number }>;
  effectivePatterns: ExecutionPattern[];
}

export class AgentLearningService {
  private static instance: AgentLearningService;
  private patterns: Map<string, ExecutionPattern>;
  private executionLog: Array<{
    taskType: string;
    toolSequence: string[];
    success: boolean;
    duration: number;
    errors: string[];
    timestamp: number;
  }>;
  private solutionCache: SolutionCache;

  private constructor() {
    this.patterns = new Map();
    this.executionLog = [];
    this.solutionCache = SolutionCache.getInstance();
  }

  static getInstance(): AgentLearningService {
    if (!AgentLearningService.instance) {
      AgentLearningService.instance = new AgentLearningService();
    }
    return AgentLearningService.instance;
  }

  /**
   * Record a tool execution sequence as a pattern
   */
  recordExecution(
    taskType: string,
    toolSequence: string[],
    success: boolean,
    duration: number,
    errors: string[] = []
  ): void {
    // Add to execution log
    this.executionLog.push({
      taskType,
      toolSequence,
      success,
      duration,
      errors,
      timestamp: Date.now(),
    });

    // Update or create pattern
    const patternKey = `${taskType}_${toolSequence.join('-')}`;
    const existing = this.patterns.get(patternKey);

    if (existing) {
      const newCount = existing.usageCount + 1;
      const currentSuccesses = Math.round(existing.successRate * existing.usageCount);
      const newSuccesses = success ? currentSuccesses + 1 : currentSuccesses;

      existing.successRate = newSuccesses / newCount;
      existing.usageCount = newCount;
      existing.totalDuration += duration;
      existing.avgDuration = existing.totalDuration / newCount;
      existing.lastUsed = Date.now();
    } else {
      this.patterns.set(patternKey, {
        id: patternKey,
        taskType,
        toolSequence,
        successRate: success ? 1 : 0,
        usageCount: 1,
        totalDuration: duration,
        avgDuration: duration,
        lastUsed: Date.now(),
      });
    }

    // Store error solutions for future reference
    if (!success && errors.length > 0) {
      errors.forEach(error => {
        const lastTool = toolSequence[toolSequence.length - 1];
        this.solutionCache.storeSolution(
          error,
          lastTool,
          `Retry with alternative approach`,
          'Consider different tool sequence',
          taskType
        );
      });
    }
  }

  /**
   * Get effective patterns for a task type
   */
  getEffectivePatternsForTask(
    taskType: string,
    minSuccessRate: number = 0.7
  ): ExecutionPattern[] {
    return Array.from(this.patterns.values())
      .filter(
        p => p.taskType === taskType && p.successRate >= minSuccessRate
      )
      .sort((a, b) => {
        // Sort by success rate (descending) and usage count
        if (b.successRate !== a.successRate) {
          return b.successRate - a.successRate;
        }
        return b.usageCount - a.usageCount;
      });
  }

  /**
   * Get recommended tool sequence for a task type
   */
  getRecommendedToolSequence(taskType: string): string[] | null {
    const patterns = this.getEffectivePatternsForTask(taskType, 0.8);
    if (patterns.length > 0) {
      return patterns[0].toolSequence;
    }
    return null;
  }

  /**
   * Get learning metrics
   */
  getMetrics(): LearningMetrics {
    const successful = this.executionLog.filter(l => l.success).length;
    const totalDuration = this.executionLog.reduce((sum, l) => sum + l.duration, 0);
    const avgDuration =
      this.executionLog.length > 0 ? totalDuration / this.executionLog.length : 0;

    // Analyze common errors
    const errorMap = new Map<string, number>();
    this.executionLog.forEach(log => {
      log.errors.forEach(error => {
        const normalized = error.split(':')[0]; // Get error type
        errorMap.set(normalized, (errorMap.get(normalized) || 0) + 1);
      });
    });

    const commonErrors = Array.from(errorMap.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalExecutions: this.executionLog.length,
      successfulExecutions: successful,
      failedExecutions: this.executionLog.length - successful,
      averageDuration: avgDuration,
      commonErrors,
      effectivePatterns: this.getEffectivePatternsForTask('', 0.6),
    };
  }

  /**
   * Get pattern recommendations for an error
   */
  getErrorRecoveryPattern(error: string, taskType: string): string[] | null {
    const solution = this.solutionCache.findSolution(
      error,
      '',
      taskType
    );

    if (solution) {
      // Try to find a pattern that led to successful recovery
      const patterns = this.getEffectivePatternsForTask(taskType, 0.7);
      if (patterns.length > 0) {
        return patterns[0].toolSequence;
      }
    }

    return null;
  }

  /**
   * Get a learning summary
   */
  getSummary(): string {
    const metrics = this.getMetrics();
    const successRate =
      metrics.totalExecutions > 0
        ? (metrics.successfulExecutions / metrics.totalExecutions * 100).toFixed(1)
        : 'N/A';

    let summary = '📊 **Agent Learning Summary**\n\n';
    summary += `Total Executions: ${metrics.totalExecutions}\n`;
    summary += `Success Rate: ${successRate}%\n`;
    summary += `Average Duration: ${(metrics.averageDuration / 1000).toFixed(2)}s\n`;

    if (metrics.effectivePatterns.length > 0) {
      summary += `\nMost Effective Patterns:\n`;
      metrics.effectivePatterns.slice(0, 3).forEach((p, i) => {
        summary += `${i + 1}. ${p.taskType}: ${p.toolSequence.join(' → ')} (${(p.successRate * 100).toFixed(0)}% success)\n`;
      });
    }

    if (metrics.commonErrors.length > 0) {
      summary += `\nCommon Errors:\n`;
      metrics.commonErrors.forEach(e => {
        summary += `- ${e.error} (${e.count} times)\n`;
      });
    }

    return summary;
  }

  /**
   * Clear learning data
   */
  clear(): void {
    this.patterns.clear();
    this.executionLog = [];
    this.solutionCache.clear();
  }

  /**
   * Get all execution logs
   */
  getExecutionLogs(): Array<{
    taskType: string;
    toolSequence: string[];
    success: boolean;
    duration: number;
    errors: string[];
    timestamp: number;
  }> {
    return [...this.executionLog];
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): ExecutionPattern[] {
    return Array.from(this.patterns.values()).sort(
      (a, b) => b.successRate - a.successRate
    );
  }
}
