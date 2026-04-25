// src/core/ToolSelectionEvaluator.ts
// Evaluates which tools are most relevant for the current execution context

import { ToolContext } from '../tools/ITool';
import { TOOL_REGISTRY } from '../tools/AgentTools';
import { ExecutionStep } from './PlanningService';

export interface ToolScore {
  toolName: string;
  relevanceScore: number; // 0-1
  reasons: string[];
  recommendationLevel: 'strongly_recommended' | 'recommended' | 'acceptable' | 'not_recommended';
}

export class ToolSelectionEvaluator {
  private static instance: ToolSelectionEvaluator;

  private constructor() {}

  static getInstance(): ToolSelectionEvaluator {
    if (!ToolSelectionEvaluator.instance) {
      ToolSelectionEvaluator.instance = new ToolSelectionEvaluator();
    }
    return ToolSelectionEvaluator.instance;
  }

  /**
   * Evaluate and rank tools for a given planning step
   */
  evaluateToolsForStep(step: ExecutionStep): ToolScore[] {
    const scores: ToolScore[] = [];

    for (const [toolName, tool] of TOOL_REGISTRY) {
      let relevance = 0;
      const reasons: string[] = [];

      // 1. Is tool in the expected tools list? (highest priority)
      if (step.expectedTools.includes(toolName)) {
        relevance += 0.8;
        reasons.push(`Tool listed in step ${step.stepIndex + 1} expected tools`);
      }

      // 2. Tool applicability check
      if (tool.isApplicable) {
        const context: ToolContext = {
          executionStepIndex: step.stepIndex,
        };
        if (tool.isApplicable(context)) {
          relevance += 0.3;
          reasons.push('Tool is applicable to current context');
        } else {
          relevance -= 0.5;
          reasons.push('Tool is not applicable to current context');
        }
      } else {
        relevance += 0.1; // Neutral if no applicability check
      }

      // 3. Tool side effects (warning if destructive in analysis step)
      if (step.expectedTools.length === 0 && tool.sideEffects?.length) {
        relevance -= 0.3;
        reasons.push('Tool has side effects unsuitable for analysis step');
      }

      scores.push({
        toolName,
        relevanceScore: Math.max(0, Math.min(1, relevance)),
        reasons,
        recommendationLevel: this.classifyRecommendation(relevance),
      });
    }

    // Sort by relevance score (descending)
    scores.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return scores;
  }

  /**
   * Get recommended tools for a specific step
   */
  getRecommendedToolsForStep(
    step: ExecutionStep,
    count: number = 3
  ): ToolScore[] {
    const scores = this.evaluateToolsForStep(step);
    return scores
      .filter(
        s =>
          s.recommendationLevel === 'strongly_recommended' ||
          s.recommendationLevel === 'recommended'
      )
      .slice(0, count);
  }

  /**
   * Evaluate tools for a task type (without a formal plan)
   */
  evaluateToolsForTaskType(
    taskType:
      | 'create'
      | 'edit'
      | 'search'
      | 'delete'
      | 'execute'
      | 'analysis'
      | 'general',
    context: ToolContext
  ): ToolScore[] {
    const scores: ToolScore[] = [];

    for (const [toolName, tool] of TOOL_REGISTRY) {
      let relevance = 0;
      const reasons: string[] = [];

      // Score based on task type
      const taskRelevance = this.scoreToolForTaskType(toolName, taskType);
      relevance += taskRelevance.score;
      reasons.push(...taskRelevance.reasons);

      // Check applicability
      if (tool.isApplicable && !tool.isApplicable(context)) {
        relevance -= 0.4;
        reasons.push('Not applicable to current context');
      }

      scores.push({
        toolName,
        relevanceScore: Math.max(0, Math.min(1, relevance)),
        reasons,
        recommendationLevel: this.classifyRecommendation(relevance),
      });
    }

    scores.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scores;
  }

  private scoreToolForTaskType(
    toolName: string,
    taskType: string
  ): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    switch (taskType) {
      case 'create':
        if (toolName === 'write_file') {
          score = 1;
          reasons.push('Primary tool for creating files');
        } else if (toolName === 'create_directory') {
          score = 0.9;
          reasons.push('Tool for creating directories');
        } else if (toolName === 'list_directory') {
          score = 0.6;
          reasons.push('Useful to understand target location');
        } else {
          score = -0.3;
        }
        break;

      case 'edit':
        if (toolName === 'edit_file') {
          score = 1;
          reasons.push('Specialized tool for editing existing files');
        } else if (toolName === 'read_file') {
          score = 0.8;
          reasons.push('Read file first before editing');
        } else if (toolName === 'write_file') {
          score = 0.5;
          reasons.push('Can rewrite entire file');
        } else {
          score = -0.3;
        }
        break;

      case 'search':
        if (toolName === 'search_files') {
          score = 1;
          reasons.push('Primary tool for searching');
        } else if (toolName === 'list_directory') {
          score = 0.6;
          reasons.push('Alternative for location-based search');
        } else if (toolName === 'read_file') {
          score = 0.4;
          reasons.push('Useful to examine search results');
        } else {
          score = -0.3;
        }
        break;

      case 'delete':
        if (toolName === 'delete_file') {
          score = 1;
          reasons.push('Tool for deleting files');
        } else if (toolName === 'list_directory') {
          score = 0.7;
          reasons.push('Verify target exists before deletion');
        } else {
          score = -0.4;
        }
        break;

      case 'execute':
        if (toolName === 'run_terminal') {
          score = 1;
          reasons.push('Tool for executing commands');
        } else if (toolName === 'read_file') {
          score = 0.5;
          reasons.push('Read scripts before execution');
        } else {
          score = -0.2;
        }
        break;

      case 'analysis':
        if (
          toolName === 'read_file' ||
          toolName === 'list_directory' ||
          toolName === 'search_files'
        ) {
          score = 0.9;
          reasons.push('Useful for gathering information');
        } else if (toolName.includes('write') || toolName === 'delete_file' || toolName === 'run_terminal') {
          score = -0.8;
          reasons.push('Destructive tool not suitable for analysis');
        } else {
          score = 0;
        }
        break;

      default:
        // General task - all tools have base score
        score = 0.3;
        reasons.push('Available for general use');
        break;
    }

    return { score, reasons };
  }

  /**
   * Format tool scores for display
   */
  formatToolScores(scores: ToolScore[]): string {
    let text = '**Available Tools**\n\n';

    scores.forEach((score, index) => {
      const icon =
        score.recommendationLevel === 'strongly_recommended'
          ? '⭐'
          : score.recommendationLevel === 'recommended'
            ? '✓'
            : score.recommendationLevel === 'acceptable'
              ? '○'
              : '✗';

      text += `${icon} ${index + 1}. **${score.toolName}** (score: ${(score.relevanceScore * 100).toFixed(0)}%)\n`;

      if (score.reasons.length > 0) {
        text += `   - ${score.reasons.join('\n   - ')}\n`;
      }

      text += '\n';
    });

    return text;
  }

  private classifyRecommendation(
    relevance: number
  ): 'strongly_recommended' | 'recommended' | 'acceptable' | 'not_recommended' {
    if (relevance >= 0.8) {
      return 'strongly_recommended';
    } else if (relevance >= 0.5) {
      return 'recommended';
    } else if (relevance >= 0) {
      return 'acceptable';
    } else {
      return 'not_recommended';
    }
  }

  /**
   * Check if a tool call matches the current plan step
   */
  isToolCallAlignedWithStep(
    toolName: string,
    step: ExecutionStep
  ): boolean {
    if (step.expectedTools.length === 0) {
      // Analysis step - no tools expected
      return false;
    }

    return step.expectedTools.includes(toolName);
  }

  /**
   * Get a warning if tool call deviates from plan
   */
  getDeviationWarning(toolName: string, step: ExecutionStep): string | null {
    if (step.expectedTools.length === 0) {
      return `Step ${step.stepIndex + 1} is an analysis step and should not use tools`;
    }

    if (!step.expectedTools.includes(toolName)) {
      return (
        `Tool '${toolName}' not expected in step ${step.stepIndex + 1}. ` +
        `Expected tools: ${step.expectedTools.join(', ')}`
      );
    }

    return null;
  }
}
