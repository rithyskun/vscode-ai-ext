// src/core/ContextBuilder.ts
// Assembles a prompt that includes the active file, selected text, open tabs,
// and recent conversation history so the model always has meaningful context.

import * as vscode from 'vscode';
import { ChatMessage } from '../providers/IModelProvider';

export interface BuiltContext {
  systemPrompt: string;
  messages: ChatMessage[];
}

export function buildContext(
  history: ChatMessage[],
  userMessage: string,
  contextLines: number
): BuiltContext {
  const editor = vscode.window.activeTextEditor;
  const parts: string[] = [];

  parts.push('You are an expert software engineer integrated into VS Code.');
  parts.push('Answer concisely. Use markdown code blocks with language tags.');
  parts.push('When editing files, output only the changed lines unless asked for the full file.');

  if (editor) {
    const doc = editor.document;
    const lang = doc.languageId;
    const fileName = vscode.workspace.asRelativePath(doc.uri);
    const selection = editor.selection;
    const cursorLine = selection.active.line;

    // Selected text takes priority over surrounding context
    const selectedText = doc.getText(selection);
    if (selectedText.trim()) {
      parts.push(`\n## Selected text (${fileName}, language: ${lang})\n\`\`\`${lang}\n${selectedText}\n\`\`\``);
    } else {
      // Include N lines around the cursor
      const startLine = Math.max(0, cursorLine - contextLines);
      const endLine   = Math.min(doc.lineCount - 1, cursorLine + contextLines);
      const range     = new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);
      const snippet   = doc.getText(range);
      const cursor    = `← CURSOR (line ${cursorLine + 1})`;
      const lines     = snippet.split('\n');
      const localLine = cursorLine - startLine;
      if (lines[localLine] !== undefined) {
        lines[localLine] = lines[localLine] + `  // ${cursor}`;
      }
      parts.push(`\n## Active file: ${fileName} (${lang})\nLines ${startLine + 1}–${endLine + 1}:\n\`\`\`${lang}\n${lines.join('\n')}\n\`\`\``);
    }

    // Open tabs (names only — avoid token explosion)
    const openTabs = vscode.window.tabGroups.all
      .flatMap(g => g.tabs)
      .map(t => (t.input as any)?.uri?.fsPath)
      .filter(Boolean)
      .map((p: string) => vscode.workspace.asRelativePath(p))
      .slice(0, 10);

    if (openTabs.length > 0) {
      parts.push(`\n## Other open files\n${openTabs.map(f => `- ${f}`).join('\n')}`);
    }
  }

  const systemPrompt = parts.join('\n');
  const messages: ChatMessage[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  return { systemPrompt, messages };
}
