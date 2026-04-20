"use strict";
// src/providers/AnthropicProvider.ts
// Uses the Anthropic Messages API with SSE streaming.
// Free tier: claude-haiku-4-5 (very low cost, suitable for dev/light use).
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
const API_URL = 'https://api.anthropic.com/v1/messages';
class AnthropicProvider {
    constructor(apiKey, model = 'claude-haiku-4-5-20251001') {
        this.name = 'anthropic';
        this.apiKey = apiKey;
        this.model = model;
    }
    buildHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
        };
    }
    filterMessages(messages) {
        // Anthropic does not allow 'system' role in messages array
        return messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role, content: m.content }));
    }
    async *stream(messages, systemPrompt) {
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
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.startsWith('data: '))
                    continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]')
                    return;
                try {
                    const event = JSON.parse(data);
                    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                        yield event.delta.text;
                    }
                }
                catch { /* skip malformed SSE line */ }
            }
        }
    }
    async complete(messages, tools, systemPrompt) {
        const body = {
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
        const json = await res.json();
        let text = '';
        const toolCalls = [];
        for (const block of json.content ?? []) {
            if (block.type === 'text') {
                text += block.text ?? '';
            }
            else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id ?? '',
                    name: block.name ?? '',
                    arguments: block.input ?? {},
                });
            }
        }
        return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
    }
}
exports.AnthropicProvider = AnthropicProvider;
//# sourceMappingURL=AnthropicProvider.js.map