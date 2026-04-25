// src/core/ErrorRecoveryService.ts
// Provides intelligent strategies for recovering from tool execution errors

export interface RecoveryStrategy {
  id: string;
  name: string;
  description: string;
  action: 'retry' | 'alternative_tool' | 'rollback' | 'manual_help' | 'skip_step';
  suggestedToolName?: string;
  suggestedArguments?: Record<string, unknown>;
  maxAttempts: number;
  instructions: string;
}

export interface ErrorPattern {
  errorType: 'permission_denied' | 'file_not_found' | 'invalid_format' | 'runtime_error' | 'unknown';
  keywords: string[];
  strategies: RecoveryStrategy[];
  severity: 'critical' | 'warning' | 'info';
}

export class ErrorRecoveryService {
  private static instance: ErrorRecoveryService;
  private errorPatterns: Map<string, ErrorPattern>;
  private recoveryHistory: Array<{
    toolName: string;
    error: string;
    strategyId: string;
    success: boolean;
    timestamp: number;
  }>;

  private constructor() {
    this.errorPatterns = new Map();
    this.recoveryHistory = [];
    this.initializeErrorPatterns();
  }

  static getInstance(): ErrorRecoveryService {
    if (!ErrorRecoveryService.instance) {
      ErrorRecoveryService.instance = new ErrorRecoveryService();
    }
    return ErrorRecoveryService.instance;
  }

  private initializeErrorPatterns(): void {
    // Permission Denied Errors
    this.registerPattern({
      errorType: 'permission_denied',
      keywords: ['permission', 'denied', 'not allowed', 'access'],
      severity: 'critical',
      strategies: [
        {
          id: 'permission_retry_with_check',
          name: 'Retry with File Check',
          description:
            'List the directory to verify file exists and check permissions',
          action: 'retry',
          maxAttempts: 1,
          instructions:
            'First list the directory containing the file to verify it exists and understand the environment',
          suggestedToolName: 'list_directory',
        },
        {
          id: 'permission_manual_help',
          name: 'Request User Help',
          description:
            'Ask user for permission or alternative approach',
          action: 'manual_help',
          maxAttempts: 1,
          instructions:
            'Ask the user if they can grant permission or suggest an alternative approach',
        },
      ],
    });

    // File Not Found Errors
    this.registerPattern({
      errorType: 'file_not_found',
      keywords: ['not found', 'does not exist', 'no such file', 'cannot find'],
      severity: 'warning',
      strategies: [
        {
          id: 'file_not_found_search',
          name: 'Search for File',
          description:
            'Search for the file in the workspace',
          action: 'alternative_tool',
          suggestedToolName: 'search_files',
          maxAttempts: 1,
          instructions:
            'Use search_files to find the file by name. The exact path or location might be different than expected.',
        },
        {
          id: 'file_not_found_list_dir',
          name: 'List Directory',
          description:
            'List parent directory to see available files',
          action: 'alternative_tool',
          suggestedToolName: 'list_directory',
          maxAttempts: 1,
          instructions:
            'List the parent directory to understand what files are available in that location',
        },
        {
          id: 'file_not_found_create',
          name: 'Create File',
          description:
            'Create the file if it is expected to not exist yet',
          action: 'retry',
          maxAttempts: 1,
          instructions:
            'If this is a new file that should be created, verify the path and try creating it',
        },
      ],
    });

    // Invalid Format Errors
    this.registerPattern({
      errorType: 'invalid_format',
      keywords: [
        'invalid',
        'malformed',
        'syntax error',
        'format',
        'parse',
        'unexpected',
      ],
      severity: 'warning',
      strategies: [
        {
          id: 'invalid_format_read_file',
          name: 'Read File for Context',
          description:
            'Read the problematic file to understand its format',
          action: 'alternative_tool',
          suggestedToolName: 'read_file',
          maxAttempts: 1,
          instructions:
            'Read the file first to understand its current format and structure before making modifications',
        },
        {
          id: 'invalid_format_retry_corrected',
          name: 'Retry with Corrected Arguments',
          description:
            'Retry the operation with corrected/escaped arguments',
          action: 'retry',
          maxAttempts: 2,
          instructions:
            'Ensure all special characters are properly escaped and arguments are in the correct format',
        },
        {
          id: 'invalid_format_manual_help',
          name: 'Request Clarification',
          description:
            'Ask user for clarification on expected format',
          action: 'manual_help',
          maxAttempts: 1,
          instructions:
            'Ask the user to clarify what format is expected or provide an example',
        },
      ],
    });

    // Runtime Errors
    this.registerPattern({
      errorType: 'runtime_error',
      keywords: ['error', 'failed', 'exception', 'crash', 'timeout'],
      severity: 'warning',
      strategies: [
        {
          id: 'runtime_error_retry',
          name: 'Retry',
          description: 'Retry the same operation',
          action: 'retry',
          maxAttempts: 2,
          instructions:
            'Retry the operation. Transient errors may resolve on subsequent attempts.',
        },
        {
          id: 'runtime_error_alternative_approach',
          name: 'Try Alternative Approach',
          description:
            'Use a different tool or method to achieve the same goal',
          action: 'alternative_tool',
          maxAttempts: 1,
          instructions:
            'Consider using a different tool or breaking the task into smaller steps',
        },
        {
          id: 'runtime_error_manual_help',
          name: 'Request Help',
          description:
            'Ask user for guidance',
          action: 'manual_help',
          maxAttempts: 1,
          instructions:
            'Ask the user for help or more context about what went wrong',
        },
      ],
    });

    // Unknown Errors
    this.registerPattern({
      errorType: 'unknown',
      keywords: [],
      severity: 'info',
      strategies: [
        {
          id: 'unknown_error_retry',
          name: 'Retry',
          description: 'Attempt the operation again',
          action: 'retry',
          maxAttempts: 1,
          instructions:
            'Retry the operation to see if it was a transient error',
        },
        {
          id: 'unknown_error_manual_help',
          name: 'Request Help',
          description:
            'Ask user for assistance',
          action: 'manual_help',
          maxAttempts: 1,
          instructions:
            'Ask the user for help understanding what went wrong',
        },
      ],
    });
  }

  private registerPattern(pattern: ErrorPattern): void {
    this.errorPatterns.set(pattern.errorType, pattern);
  }

  /**
   * Get recovery strategies for an error
   */
  getRecoveryStrategies(
    errorType: string,
    errorMessage: string
  ): RecoveryStrategy[] {
    const pattern = this.errorPatterns.get(errorType);
    if (!pattern) {
      return [];
    }

    // If there are no keywords, return all strategies
    if (pattern.keywords.length === 0) {
      return pattern.strategies;
    }

    // If keywords match, return all strategies for this error type
    const lower = errorMessage.toLowerCase();
    const keywordMatches = pattern.keywords.some(kw =>
      lower.includes(kw.toLowerCase())
    );

    if (keywordMatches) {
      return pattern.strategies;
    }

    // Return all strategies even if keywords don't match
    return pattern.strategies;
  }

  /**
   * Get the best (first) strategy for an error
   */
  getBestStrategy(
    errorType: string,
    errorMessage: string
  ): RecoveryStrategy | null {
    const strategies = this.getRecoveryStrategies(errorType, errorMessage);
    return strategies.length > 0 ? strategies[0] : null;
  }

  /**
   * Get strategies that haven't been attempted yet for this error
   */
  getUntriedStrategies(
    toolName: string,
    errorMessage: string,
    triedStrategies: string[]
  ): RecoveryStrategy[] {
    // Find the error type from the error message
    let errorType: 'permission_denied' | 'file_not_found' | 'invalid_format' | 'runtime_error' | 'unknown' = 'unknown';

    if (errorMessage.toLowerCase().includes('permission') || errorMessage.toLowerCase().includes('denied')) {
      errorType = 'permission_denied';
    } else if (
      errorMessage.toLowerCase().includes('not found') ||
      errorMessage.toLowerCase().includes('does not exist')
    ) {
      errorType = 'file_not_found';
    } else if (
      errorMessage.toLowerCase().includes('invalid') ||
      errorMessage.toLowerCase().includes('syntax')
    ) {
      errorType = 'invalid_format';
    } else if (errorMessage.toLowerCase().includes('error')) {
      errorType = 'runtime_error';
    }

    const strategies = this.getRecoveryStrategies(errorType, errorMessage);
    return strategies.filter(s => !triedStrategies.includes(s.id));
  }

  /**
   * Record a recovery attempt
   */
  recordRecoveryAttempt(
    toolName: string,
    error: string,
    strategyId: string,
    success: boolean
  ): void {
    this.recoveryHistory.push({
      toolName,
      error,
      strategyId,
      success,
      timestamp: Date.now(),
    });
  }

  /**
   * Get recovery history
   */
  getRecoveryHistory(): Array<{
    toolName: string;
    error: string;
    strategyId: string;
    success: boolean;
    timestamp: number;
  }> {
    return [...this.recoveryHistory];
  }

  /**
   * Get success rate for a recovery strategy
   */
  getStrategySuccessRate(strategyId: string): { success: number; total: number; rate: number } {
    const attempts = this.recoveryHistory.filter(h => h.strategyId === strategyId);
    const successes = attempts.filter(a => a.success).length;
    return {
      success: successes,
      total: attempts.length,
      rate: attempts.length > 0 ? successes / attempts.length : 0,
    };
  }

  /**
   * Format recovery strategy for display
   */
  formatStrategy(strategy: RecoveryStrategy): string {
    let text = `**${strategy.name}** (${strategy.action})\n`;
    text += `${strategy.description}\n`;
    text += `Instructions: ${strategy.instructions}\n`;
    if (strategy.suggestedToolName) {
      text += `Suggested tool: ${strategy.suggestedToolName}\n`;
    }
    return text;
  }

  /**
   * Get error severity for a given error type
   */
  getErrorSeverity(errorType: string): 'critical' | 'warning' | 'info' {
    const pattern = this.errorPatterns.get(errorType);
    return pattern?.severity ?? 'info';
  }
}
