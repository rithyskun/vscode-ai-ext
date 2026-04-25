// src/core/ExecutionContext.ts
// Tracks execution state, tool history, and error context during agent execution

export interface ToolExecutionRecord {
  toolName: string;
  arguments: Record<string, unknown>;
  result: string;
  timestamp: number;
  success: boolean;
  duration: number;
  error?: string;
}

export interface ExecutionError {
  toolName: string;
  errorType: 'permission_denied' | 'file_not_found' | 'invalid_format' | 'runtime_error' | 'unknown';
  message: string;
  timestamp: number;
  attempts: number;
}

export interface ExecutionState {
  startTime: number;
  toolExecutionHistory: ToolExecutionRecord[];
  errors: ExecutionError[];
  filesModified: Set<string>;
  currentStepIndex: number;
  maxIterations: number;
  iterationCount: number;
}

export class ExecutionContext {
  private state: ExecutionState;

  constructor(maxIterations: number = 15) {
    this.state = {
      startTime: Date.now(),
      toolExecutionHistory: [],
      errors: [],
      filesModified: new Set(),
      currentStepIndex: 0,
      maxIterations,
      iterationCount: 0,
    };
  }

  recordToolExecution(
    toolName: string,
    args: Record<string, unknown>,
    result: string,
    duration: number,
    error?: string
  ): void {
    const record: ToolExecutionRecord = {
      toolName,
      arguments: args,
      result,
      timestamp: Date.now(),
      success: !error,
      duration,
      error,
    };
    this.state.toolExecutionHistory.push(record);
  }

  recordError(
    toolName: string,
    errorType: ExecutionError['errorType'],
    message: string
  ): void {
    const existingError = this.state.errors.find(
      e => e.toolName === toolName && e.message === message
    );

    if (existingError) {
      existingError.attempts++;
      existingError.timestamp = Date.now();
    } else {
      this.state.errors.push({
        toolName,
        errorType,
        message,
        timestamp: Date.now(),
        attempts: 1,
      });
    }
  }

  recordFileModification(filePath: string): void {
    this.state.filesModified.add(filePath);
  }

  getToolExecutionHistory(): ToolExecutionRecord[] {
    return [...this.state.toolExecutionHistory];
  }

  getLastToolResult(): ToolExecutionRecord | undefined {
    return this.state.toolExecutionHistory[this.state.toolExecutionHistory.length - 1];
  }

  getErrors(): ExecutionError[] {
    return [...this.state.errors];
  }

  getFilesModified(): string[] {
    return Array.from(this.state.filesModified);
  }

  getCurrentStepIndex(): number {
    return this.state.currentStepIndex;
  }

  setCurrentStepIndex(index: number): void {
    this.state.currentStepIndex = index;
  }

  incrementIterationCount(): void {
    this.state.iterationCount++;
  }

  getIterationCount(): number {
    return this.state.iterationCount;
  }

  isMaxIterationsReached(): boolean {
    return this.state.iterationCount >= this.state.maxIterations;
  }

  getStartTime(): number {
    return this.state.startTime;
  }

  getExecutionSummary(): string {
    const duration = Date.now() - this.state.startTime;
    const toolCount = this.state.toolExecutionHistory.length;
    const errorCount = this.state.errors.length;
    const filesModified = this.state.filesModified.size;

    return `Execution summary: ${toolCount} tools executed, ${errorCount} errors, ${filesModified} files modified, ${duration}ms elapsed`;
  }

  getSuggestedContext(): string {
    const recentTools = this.state.toolExecutionHistory.slice(-3);
    const recentErrors = this.state.errors.slice(-2);

    let context = '';

    if (recentTools.length > 0) {
      context += '\nRecent tool executions:\n';
      recentTools.forEach(t => {
        context += `- ${t.toolName}: ${t.success ? 'success' : 'failed'} (${t.duration}ms)\n`;
      });
    }

    if (recentErrors.length > 0) {
      context += '\nRecent errors:\n';
      recentErrors.forEach(e => {
        context += `- ${e.toolName}: ${e.errorType} (attempt ${e.attempts})\n`;
      });
    }

    if (this.state.filesModified.size > 0) {
      context += `\nFiles modified: ${Array.from(this.state.filesModified).join(', ')}\n`;
    }

    return context;
  }
}
