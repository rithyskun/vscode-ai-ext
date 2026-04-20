// src/tools/ITool.ts

import { ToolDefinition } from '../providers/IModelProvider';

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
}
