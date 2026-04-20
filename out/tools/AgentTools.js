"use strict";
// src/tools/AgentTools.ts
// Implements all four agent tools: read_file, write_file, run_terminal, list_directory.
// All destructive tools (write_file, run_terminal) require user approval before execution.
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
exports.TOOL_REGISTRY = exports.ALL_TOOLS = exports.ListDirectoryTool = exports.RunTerminalTool = exports.WriteFileTool = exports.ReadFileTool = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve a workspace-relative path to an absolute URI
// ─────────────────────────────────────────────────────────────────────────────
function resolveUri(filePath) {
    if (path.isAbsolute(filePath)) {
        return vscode.Uri.file(filePath);
    }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new Error('No workspace folder open.');
    }
    return vscode.Uri.joinPath(folders[0].uri, filePath);
}
// ─────────────────────────────────────────────────────────────────────────────
// read_file
// ─────────────────────────────────────────────────────────────────────────────
class ReadFileTool {
    constructor() {
        this.name = 'read_file';
        this.definition = {
            name: 'read_file',
            description: 'Read the contents of a file in the workspace. Path is relative to the workspace root.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative or absolute path to the file.' },
                    start_line: { type: 'number', description: 'First line to read (1-based, optional).' },
                    end_line: { type: 'number', description: 'Last line to read (1-based, optional).' },
                },
                required: ['path'],
            },
        };
    }
    async execute(args) {
        const uri = resolveUri(args['path']);
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = new TextDecoder().decode(bytes);
        const lines = text.split('\n');
        const start = args['start_line'] ? args['start_line'] - 1 : 0;
        const end = args['end_line'] ? args['end_line'] : lines.length;
        const slice = lines.slice(start, end).join('\n');
        return `File: ${args['path']} (lines ${start + 1}–${end})\n\`\`\`\n${slice}\n\`\`\``;
    }
}
exports.ReadFileTool = ReadFileTool;
// ─────────────────────────────────────────────────────────────────────────────
// write_file  — shows diff preview + requires approval
// ─────────────────────────────────────────────────────────────────────────────
class WriteFileTool {
    constructor() {
        this.name = 'write_file';
        this.definition = {
            name: 'write_file',
            description: 'Write or overwrite a file in the workspace. Always requires user confirmation.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative or absolute path to the file.' },
                    content: { type: 'string', description: 'Full new content of the file.' },
                },
                required: ['path', 'content'],
            },
        };
    }
    async execute(args) {
        const filePath = args['path'];
        const content = args['content'];
        const uri = resolveUri(filePath);
        // Try to show a diff — open existing file vs proposed change
        let existingContent = '';
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            existingContent = new TextDecoder().decode(bytes);
        }
        catch { /* new file */ }
        // Show approval dialog
        const action = await vscode.window.showWarningMessage(`AI wants to write to: ${filePath}`, { modal: true, detail: `${content.split('\n').length} lines of new content.` }, 'Apply', 'View Diff', 'Cancel');
        if (action === 'View Diff') {
            // Write to a tmp URI and show diff
            const tmpUri = uri.with({ scheme: 'untitled', path: uri.path + '.proposed' });
            await vscode.workspace.openTextDocument(tmpUri);
            await vscode.commands.executeCommand('vscode.diff', uri, tmpUri, `AI proposed changes to ${filePath}`);
            const confirm = await vscode.window.showWarningMessage('Apply this change?', { modal: true }, 'Apply', 'Cancel');
            if (confirm !== 'Apply')
                return 'Write cancelled by user.';
        }
        else if (action !== 'Apply') {
            return 'Write cancelled by user.';
        }
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
        return `Successfully wrote ${content.split('\n').length} lines to ${filePath}.`;
    }
}
exports.WriteFileTool = WriteFileTool;
// ─────────────────────────────────────────────────────────────────────────────
// run_terminal  — requires approval, runs in integrated terminal
// ─────────────────────────────────────────────────────────────────────────────
class RunTerminalTool {
    constructor() {
        this.name = 'run_terminal';
        this.definition = {
            name: 'run_terminal',
            description: 'Run a shell command in the VS Code integrated terminal. Always requires user confirmation.',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Shell command to execute.' },
                    cwd: { type: 'string', description: 'Working directory (optional, defaults to workspace root).' },
                },
                required: ['command'],
            },
        };
    }
    async execute(args) {
        const command = args['command'];
        const action = await vscode.window.showWarningMessage(`AI wants to run a terminal command`, { modal: true, detail: `$ ${command}` }, 'Run', 'Cancel');
        if (action !== 'Run')
            return 'Command cancelled by user.';
        const terminal = vscode.window.createTerminal({
            name: 'AI Agent',
            cwd: args['cwd'] ? resolveUri(args['cwd']).fsPath : undefined,
        });
        terminal.show();
        terminal.sendText(command);
        return `Command sent to terminal: ${command}`;
    }
}
exports.RunTerminalTool = RunTerminalTool;
// ─────────────────────────────────────────────────────────────────────────────
// list_directory
// ─────────────────────────────────────────────────────────────────────────────
class ListDirectoryTool {
    constructor() {
        this.name = 'list_directory';
        this.definition = {
            name: 'list_directory',
            description: 'List files and directories at a workspace path.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative or absolute path. Defaults to workspace root.' },
                },
                required: [],
            },
        };
    }
    async execute(args) {
        const dirPath = args['path'] ?? '.';
        const uri = resolveUri(dirPath);
        const entries = await vscode.workspace.fs.readDirectory(uri);
        const lines = entries.map(([name, type]) => {
            const icon = type === vscode.FileType.Directory ? '📁' : '📄';
            return `${icon} ${name}`;
        });
        return `Directory: ${dirPath}\n${lines.join('\n')}`;
    }
}
exports.ListDirectoryTool = ListDirectoryTool;
// Export a registry for easy lookup by name
exports.ALL_TOOLS = [
    new ReadFileTool(),
    new WriteFileTool(),
    new RunTerminalTool(),
    new ListDirectoryTool(),
];
exports.TOOL_REGISTRY = new Map(exports.ALL_TOOLS.map(t => [t.name, t]));
//# sourceMappingURL=AgentTools.js.map