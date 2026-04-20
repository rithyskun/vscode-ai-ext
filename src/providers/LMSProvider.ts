// src/providers/LMSProvider.ts
// Talks to a local LMS (Language Model Server) instance via OpenAI-compatible API.
// Supports models like google/gemma-4-e2b, text-embedding-nomic-embed-text-v1.5

import { IModelProvider, ChatMessage, ToolDefinition, ModelResponse, ToolCall } from './IModelProvider';

export class LMSProvider implements IModelProvider {
  readonly name = 'lms';
  readonly model: string;
  private baseUrl: string;

  constructor(model = 'google/gemma-4-e2b', baseUrl = 'http://localhost:1234') {
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async *stream(messages: ChatMessage[], systemPrompt?: string): AsyncIterable<string> {
    const allMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages: allMessages, stream: true }),
    });

    if (!res.ok) {
      throw new Error(`LMS error ${res.status}: ${await res.text()}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const event = JSON.parse(data);
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) yield delta as string;
        } catch { /* skip */ }
      }
    }
  }

  async complete(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    systemPrompt?: string
  ): Promise<ModelResponse> {
    const allMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const body: Record<string, unknown> = {
      model: this.model,
      messages: allMessages,
      stream: false,
    };

    // LMS supports OpenAI-compatible tool calling for models that support it
    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`LMS error ${res.status}: ${await res.text()}`);
    }

    const json = await res.json() as { choices?: Array<{ message?: { content?: string; tool_calls?: unknown[] } }> };
    const choice = json.choices?.[0];
    const text: string = choice?.message?.content ?? '';
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: typeof tc.function.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments,
    }));

    return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  /** List available models from the LMS server */
  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/v1/models`);
    if (!res.ok) {
      throw new Error(`LMS error ${res.status}: ${await res.text()}`);
    }

    const json = await res.json() as { data?: Array<{ id: string }> };
    return (json.data ?? []).map(m => m.id);
  }
}
