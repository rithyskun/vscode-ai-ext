// src/completion/InlineCompletionProvider.ts
// Registers as a VS Code InlineCompletionItemProvider.
// Debounces 400ms after the user stops typing, then asks the active provider.
// Supports FIM (fill-in-the-middle) for Ollama; falls back to chat-style for others.

import * as vscode from 'vscode';
import { getProvider, getConfig } from '../core/ModelRouter';
import { OllamaProvider } from '../providers/OllamaProvider';

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer: NodeJS.Timeout | undefined;
  private lastRequestId = 0;

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | null> {
    const { inlineCompletion } = getConfig();
    if (!inlineCompletion) return null;

    // Only trigger on explicit invocation or idle (not on backspace/delete)
    if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
      // Debounce automatic triggers
      await new Promise<void>(resolve => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(resolve, 400);
      });
    }

    if (token.isCancellationRequested) return null;

    const requestId = ++this.lastRequestId;

    const prefix = document.getText(new vscode.Range(
      new vscode.Position(Math.max(0, position.line - 30), 0),
      position
    ));
    const suffix = document.getText(new vscode.Range(
      position,
      new vscode.Position(Math.min(document.lineCount - 1, position.line + 10), 0)
    ));

    let completion = '';

    try {
      const provider = getProvider();

      if (provider instanceof OllamaProvider) {
        // Use FIM endpoint for better local results
        completion = await provider.fim(prefix, suffix);
      } else {
        // Generic chat completion fallback
        const prompt = `Complete the following ${document.languageId} code. Output ONLY the completion, no explanation.\n\n\`\`\`${document.languageId}\n${prefix}<CURSOR>${suffix}\n\`\`\`\n\nCompletion:`;
        let result = '';
        for await (const chunk of provider.stream([{ role: 'user', content: prompt }])) {
          result += chunk;
          if (token.isCancellationRequested) return null;
        }
        // Strip any code fence the model added
        completion = result
          .replace(/^```[\w]*\n?/, '')
          .replace(/\n?```$/, '')
          .trim();
      }
    } catch {
      return null;
    }

    // Discard stale results if a newer request came in
    if (requestId !== this.lastRequestId) return null;
    if (!completion.trim()) return null;

    return {
      items: [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))],
    };
  }
}
