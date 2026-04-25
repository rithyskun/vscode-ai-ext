// src/tools/ITool.ts

import { ToolDefinition } from '../providers/IModelProvider';

export interface ToolContext {
  executionStepIndex?: number;
  previousToolResults?: string[];
  filesModified?: string[];
}

export interface ITool {
  /** Must match the name in the tool schema */
  readonly name: string;

  /** JSON Schema passed to the model */
  readonly definition: ToolDefinition;

  /**
   * Execute the tool with the arguments the model provided.
   * Return a string result that gets fed back as a tool_result message.
   * Throw to signal failure — the error message is returned to the model.
   */
  execute(args: Record<string, unknown>): Promise<string>;

  /**
   * (Optional) Check if this tool is applicable to the current context.
   * Used by ToolSelectionEvaluator to gate tool availability.
   * Default: always applicable.
   */
  isApplicable?(context: ToolContext): boolean;

  /**
   * (Optional) List of preconditions that must be met before tool execution.
   * Examples: "file must exist", "directory must be empty"
   */
  readonly preconditions?: string[];

  /**
   * (Optional) List of side effects or warnings about tool usage.
   * Examples: "modifies filesystem", "requires user confirmation"
   */
  readonly sideEffects?: string[];
}
