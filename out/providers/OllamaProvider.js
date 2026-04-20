"use strict";
// src/providers/OllamaProvider.ts
// Talks to a local Ollama instance via its REST API (OpenAI-compatible /api/chat).
// Recommended models: qwen2.5-coder:7b (agent/chat), qwen2.5-coder:1.5b (fast completion).
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
class OllamaProvider {
    constructor(model = 'qwen2.5-coder:7b', baseUrl = 'http://localhost:11434') {
        this.name = 'ollama';
        this.model = model;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }
    async *stream(messages, systemPrompt) {
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
                if (!line.trim())
                    continue;
                try {
                    const event = JSON.parse(line);
                    if (event.message?.content) {
                        yield event.message.content;
                    }
                    if (event.done)
                        return;
                }
                catch { /* skip */ }
            }
        }
    }
    async complete(messages, tools, systemPrompt) {
        const allMessages = systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages;
        const body = {
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
        const json = await res.json();
        const msg = json.message ?? {};
        const text = msg.content ?? '';
        const toolCalls = (msg.tool_calls ?? []).map((tc, i) => ({
            id: `tc_${i}`,
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments,
        }));
        return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
    }
    /** Fill-in-the-middle (FIM) for inline completion */
    async fim(prefix, suffix) {
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
        if (!res.ok)
            return '';
        const json = await res.json();
        return json.response ?? '';
    }
}
exports.OllamaProvider = OllamaProvider;
//# sourceMappingURL=OllamaProvider.js.map