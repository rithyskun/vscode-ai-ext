// src/providers/OllamaProvider.ts
// Talks to a local Ollama instance via its REST API (OpenAI-compatible /api/chat).
// Recommended models: qwen2.5-coder:7b (agent/chat), qwen2.5-coder:1.5b (fast completion).

import { IModelProvider, ChatMessage, ToolDefinition, ModelResponse, ToolCall } from './IModelProvider';

export class OllamaProvider implements IModelProvider {
  readonly name = 'ollama';
  readonly model: string;
  private baseUrl: string;

  constructor(model = 'qwen2.5-coder:7b', baseUrl = 'http://localhost:11434') {
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async *stream(messages: ChatMessage[], systemPrompt?: string): AsyncIterable<string> {
    const allMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages: allMessages, stream: true }),
    });

    if (!res.ok) {
      throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
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
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.message?.content) {
            yield event.message.content as string;
          }
          if (event.done) return;
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

    // Ollama supports OpenAI-compatible tool calling for models that support it
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

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    }

    const json = await res.json() as { message?: { content?: string; tool_calls?: unknown[] } };
    const msg = json.message ?? {};
    const text: string = msg.content ?? '';
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc: any, i: number) => ({
      id: `tc_${i}`,
      name: tc.function.name,
      arguments: typeof tc.function.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments,
    }));

    return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  /** Fill-in-the-middle (FIM) for inline completion */
  async fim(prefix: string, suffix: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`,
        stream: false,
        options: { stop: ['<|fim_middle|>', '<|endoftext|>'], num_predict: 128 },
      }),
    });

    if (!res.ok) return '';
    const json = await res.json() as { response?: string };
    return json.response ?? '';
  }
}
