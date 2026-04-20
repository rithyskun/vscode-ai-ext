// src/providers/AnthropicProvider.ts
// Uses the Anthropic Messages API with SSE streaming.
// Free tier: claude-haiku-4-5 (very low cost, suitable for dev/light use).

import { IModelProvider, ChatMessage, ToolDefinition, ModelResponse, ToolCall } from './IModelProvider';

const API_URL = 'https://api.anthropic.com/v1/messages';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class AnthropicProvider implements IModelProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private apiKey: string;

  constructor(apiKey: string, model = 'claude-haiku-4-5-20251001') {
    this.apiKey = apiKey;
    this.model = model;
  }

  private buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  private filterMessages(messages: ChatMessage[]): AnthropicMessage[] {
    // Anthropic does not allow 'system' role in messages array
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  async *stream(messages: ChatMessage[], systemPrompt?: string): AsyncIterable<string> {
    const body = JSON.stringify({
      model: this.model,
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages: this.filterMessages(messages),
    });

    const res = await fetch(API_URL, { method: 'POST', headers: this.buildHeaders(), body });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
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
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            yield event.delta.text as string;
          }
        } catch { /* skip malformed SSE line */ }
      }
    }
  }

  async complete(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    systemPrompt?: string
  ): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: this.filterMessages(messages),
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const json = await res.json() as { content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }> };
    let text = '';
    const toolCalls: ToolCall[] = [];

    for (const block of json.content ?? []) {
      if (block.type === 'text') {
        text += block.text ?? '';
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id ?? '',
          name: block.name ?? '',
          arguments: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }

    return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }
}
