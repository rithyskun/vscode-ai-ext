"use strict";
// src/extension.ts
// Extension activation entry point.
// Registers all commands, the chat view provider, and the inline completion provider.
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ChatPanel_1 = require("./views/ChatPanel");
const InlineCompletionProvider_1 = require("./completion/InlineCompletionProvider");
const ModelRouter_1 = require("./core/ModelRouter");
function activate(context) {
    console.log('AI Assistant extension activated');
    // ── Chat panel ────────────────────────────────────────────────────────────
    const chatProvider = new ChatPanel_1.ChatViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatPanel_1.ChatViewProvider.viewType, chatProvider));
    // ── Inline completion ─────────────────────────────────────────────────────
    const completionProvider = new InlineCompletionProvider_1.InlineCompletionProvider();
    context.subscriptions.push(vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, // All files
    completionProvider));
    // ── Commands ──────────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('aiAssistant.openChat', () => {
        vscode.commands.executeCommand('aiAssistant.chatView.focus');
    }), vscode.commands.registerCommand('aiAssistant.toggleCompletion', () => {
        const cfg = vscode.workspace.getConfiguration('aiAssistant');
        const current = cfg.get('inlineCompletion', true);
        cfg.update('inlineCompletion', !current, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`AI inline completion ${!current ? 'enabled' : 'disabled'}`);
    }), vscode.commands.registerCommand('aiAssistant.runAgent', async () => {
        const editor = vscode.window.activeTextEditor;
        const selection = editor?.selection;
        const text = selection && !selection.isEmpty
            ? editor.document.getText(selection)
            : editor?.document.getText();
        if (!text) {
            vscode.window.showWarningMessage('Open a file or select some code first.');
            return;
        }
        const task = await vscode.window.showInputBox({
            prompt: 'What should the agent do with this code?',
            placeHolder: 'e.g. "Add JSDoc comments" or "Refactor to use async/await"',
        });
        if (!task)
            return;
        // Focus chat panel and let it handle the agent run
        vscode.commands.executeCommand('aiAssistant.chatView.focus');
        // Small delay for panel to mount
        setTimeout(() => {
            vscode.commands.executeCommand('aiAssistant.openChat');
        }, 300);
    }));
    // ── Status bar item ───────────────────────────────────────────────────────
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusItem.command = 'aiAssistant.toggleCompletion';
    statusItem.tooltip = 'Toggle AI inline completion';
    context.subscriptions.push(statusItem);
    function updateStatusBar() {
        const { inlineCompletion } = (0, ModelRouter_1.getConfig)();
        statusItem.text = inlineCompletion ? '$(hubot) AI' : '$(hubot) AI (off)';
        statusItem.show();
    }
    updateStatusBar();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('aiAssistant'))
            updateStatusBar();
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map