// src/extension.ts
// Extension activation entry point.
// Registers all commands, the chat view provider, and the inline completion provider.

import * as vscode from 'vscode';
import { ChatViewProvider } from './views/ChatPanel';
import { InlineCompletionProvider } from './completion/InlineCompletionProvider';
import { getConfig } from './core/ModelRouter';

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Assistant extension activated');

  // ── Chat panel ────────────────────────────────────────────────────────────
  const chatProvider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
  );

  // ── Inline completion ─────────────────────────────────────────────────────
  const completionProvider = new InlineCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' }, // All files
      completionProvider
    )
  );

  // ── Commands ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAssistant.openChat', () => {
      vscode.commands.executeCommand('aiAssistant.chatView.focus');
    }),

    vscode.commands.registerCommand('aiAssistant.toggleCompletion', () => {
      const cfg     = vscode.workspace.getConfiguration('aiAssistant');
      const current = cfg.get<boolean>('inlineCompletion', true);
      cfg.update('inlineCompletion', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `AI inline completion ${!current ? 'enabled' : 'disabled'}`
      );
    }),

    vscode.commands.registerCommand('aiAssistant.runAgent', async () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.selection;
      const text = selection && !selection.isEmpty
        ? editor!.document.getText(selection)
        : editor?.document.getText();

      if (!text) {
        vscode.window.showWarningMessage('Open a file or select some code first.');
        return;
      }

      const task = await vscode.window.showInputBox({
        prompt: 'What should the agent do with this code?',
        placeHolder: 'e.g. "Add JSDoc comments" or "Refactor to use async/await"',
      });

      if (!task) return;

      // Focus chat panel and let it handle the agent run
      vscode.commands.executeCommand('aiAssistant.chatView.focus');
      // Small delay for panel to mount
      setTimeout(() => {
        vscode.commands.executeCommand('aiAssistant.openChat');
      }, 300);
    })
  );

  // ── Status bar item ───────────────────────────────────────────────────────
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'aiAssistant.toggleCompletion';
  statusItem.tooltip  = 'Toggle AI inline completion';
  context.subscriptions.push(statusItem);

  function updateStatusBar() {
    const { inlineCompletion } = getConfig();
    statusItem.text = inlineCompletion ? '$(hubot) AI' : '$(hubot) AI (off)';
    statusItem.show();
  }

  updateStatusBar();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aiAssistant')) updateStatusBar();
    })
  );
}

export function deactivate() {}
