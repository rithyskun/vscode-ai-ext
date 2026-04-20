// src/providers/IModelProvider.ts

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ModelResponse {
  text: string;
  toolCalls?: ToolCall[];
}

/**
 * Universal interface all provider adapters must implement.
 * stream() yields text chunks as they arrive (SSE / chunked HTTP).
 * complete() collects the full response including any tool calls.
 */
export interface IModelProvider {
  readonly name: string;
  readonly model: string;

  /** Stream text chunks — use for chat display */
  stream(
    messages: ChatMessage[],
    systemPrompt?: string
  ): AsyncIterable<string>;

  /** Single-shot completion with optional tool schema — use for agent loop */
  complete(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    systemPrompt?: string
  ): Promise<ModelResponse>;
}
