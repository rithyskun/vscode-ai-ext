"use strict";
// src/core/ContextBuilder.ts
// Assembles a prompt that includes the active file, selected text, open tabs,
// and recent conversation history so the model always has meaningful context.
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
exports.buildContext = buildContext;
const vscode = __importStar(require("vscode"));
function buildContext(history, userMessage, contextLines) {
    const editor = vscode.window.activeTextEditor;
    const parts = [];
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
        }
        else {
            // Include N lines around the cursor
            const startLine = Math.max(0, cursorLine - contextLines);
            const endLine = Math.min(doc.lineCount - 1, cursorLine + contextLines);
            const range = new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);
            const snippet = doc.getText(range);
            const cursor = `← CURSOR (line ${cursorLine + 1})`;
            const lines = snippet.split('\n');
            const localLine = cursorLine - startLine;
            if (lines[localLine] !== undefined) {
                lines[localLine] = lines[localLine] + `  // ${cursor}`;
            }
            parts.push(`\n## Active file: ${fileName} (${lang})\nLines ${startLine + 1}–${endLine + 1}:\n\`\`\`${lang}\n${lines.join('\n')}\n\`\`\``);
        }
        // Open tabs (names only — avoid token explosion)
        const openTabs = vscode.window.tabGroups.all
            .flatMap(g => g.tabs)
            .map(t => t.input?.uri?.fsPath)
            .filter(Boolean)
            .map((p) => vscode.workspace.asRelativePath(p))
            .slice(0, 10);
        if (openTabs.length > 0) {
            parts.push(`\n## Other open files\n${openTabs.map(f => `- ${f}`).join('\n')}`);
        }
    }
    const systemPrompt = parts.join('\n');
    const messages = [
        ...history,
        { role: 'user', content: userMessage },
    ];
    return { systemPrompt, messages };
}
//# sourceMappingURL=ContextBuilder.js.map