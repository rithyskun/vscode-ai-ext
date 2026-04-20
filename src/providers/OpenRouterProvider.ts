// src/providers/OpenRouterProvider.ts
// OpenRouter exposes an OpenAI-compatible API.
// Free models (append ":free"): meta-llama/llama-3.1-8b-instruct:free
//                                mistralai/mistral-7b-instruct:free
//                                deepseek/deepseek-coder-v2:free

import { IModelProvider, ChatMessage, ToolDefinition, ModelResponse, ToolCall } from './IModelProvider';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterProvider implements IModelProvider {
  readonly name = 'openrouter';
  readonly model: string;
  private apiKey: string;

  constructor(apiKey: string, model = 'meta-llama/llama-3.1-8b-instruct:free') {
    this.apiKey = apiKey;
    this.model = model;
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'vscode-ai-assistant',
      'X-Title': 'VS Code AI Assistant',
    };
  }

  async *stream(messages: ChatMessage[], systemPrompt?: string): AsyncIterable<string> {
    const allMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model: this.model, messages: allMessages, stream: true }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
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

    const body: Record<string, unknown> = { model: this.model, messages: allMessages };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
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
}
