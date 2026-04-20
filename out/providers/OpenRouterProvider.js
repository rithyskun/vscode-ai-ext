"use strict";
// src/providers/OpenRouterProvider.ts
// OpenRouter exposes an OpenAI-compatible API.
// Free models (append ":free"): meta-llama/llama-3.1-8b-instruct:free
//                                mistralai/mistral-7b-instruct:free
//                                deepseek/deepseek-coder-v2:free
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterProvider = void 0;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
class OpenRouterProvider {
    constructor(apiKey, model = 'meta-llama/llama-3.1-8b-instruct:free') {
        this.name = 'openrouter';
        this.apiKey = apiKey;
        this.model = model;
    }
    headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'vscode-ai-assistant',
            'X-Title': 'VS Code AI Assistant',
        };
    }
    async *stream(messages, systemPrompt) {
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
                    const delta = event.choices?.[0]?.delta?.content;
                    if (delta)
                        yield delta;
                }
                catch { /* skip */ }
            }
        }
    }
    async complete(messages, tools, systemPrompt) {
        const allMessages = systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages;
        const body = { model: this.model, messages: allMessages };
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
        const json = await res.json();
        const choice = json.choices?.[0];
        const text = choice?.message?.content ?? '';
        const toolCalls = (choice?.message?.tool_calls ?? []).map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments,
        }));
        return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
    }
}
exports.OpenRouterProvider = OpenRouterProvider;
//# sourceMappingURL=OpenRouterProvider.js.map