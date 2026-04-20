"use strict";
// src/completion/InlineCompletionProvider.ts
// Registers as a VS Code InlineCompletionItemProvider.
// Debounces 400ms after the user stops typing, then asks the active provider.
// Supports FIM (fill-in-the-middle) for Ollama; falls back to chat-style for others.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.InlineCompletionProvider = void 0;
const vscode = __importStar(require("vscode"));
const ModelRouter_1 = require("../core/ModelRouter");
const OllamaProvider_1 = require("../providers/OllamaProvider");
class InlineCompletionProvider {
    constructor() {
        this.lastRequestId = 0;
    }
    async provideInlineCompletionItems(document, position, context, token) {
        const { inlineCompletion } = (0, ModelRouter_1.getConfig)();
        if (!inlineCompletion)
            return null;
        // Only trigger on explicit invocation or idle (not on backspace/delete)
        if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
            // Debounce automatic triggers
            await new Promise(resolve => {
                if (this.debounceTimer)
                    clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(resolve, 400);
            });
        }
        if (token.isCancellationRequested)
            return null;
        const requestId = ++this.lastRequestId;
        const prefix = document.getText(new vscode.Range(new vscode.Position(Math.max(0, position.line - 30), 0), position));
        const suffix = document.getText(new vscode.Range(position, new vscode.Position(Math.min(document.lineCount - 1, position.line + 10), 0)));
        let completion = '';
        try {
            const provider = (0, ModelRouter_1.getProvider)();
            if (provider instanceof OllamaProvider_1.OllamaProvider) {
                // Use FIM endpoint for better local results
                completion = await provider.fim(prefix, suffix);
            }
            else {
                // Generic chat completion fallback
                const prompt = `Complete the following ${document.languageId} code. Output ONLY the completion, no explanation.\n\n\`\`\`${document.languageId}\n${prefix}<CURSOR>${suffix}\n\`\`\`\n\nCompletion:`;
                let result = '';
                for await (const chunk of provider.stream([{ role: 'user', content: prompt }])) {
                    result += chunk;
                    if (token.isCancellationRequested)
                        return null;
                }
                // Strip any code fence the model added
                completion = result
                    .replace(/^```[\w]*\n?/, '')
                    .replace(/\n?```$/, '')
                    .trim();
            }
        }
        catch {
            return null;
        }
        // Discard stale results if a newer request came in
        if (requestId !== this.lastRequestId)
            return null;
        if (!completion.trim())
            return null;
        return {
            items: [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))],
        };
    }
}
exports.InlineCompletionProvider = InlineCompletionProvider;
//# sourceMappingURL=InlineCompletionProvider.js.map