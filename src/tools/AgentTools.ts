// src/tools/AgentTools.ts
// Implements all four agent tools: read_file, write_file, run_terminal, list_directory.
// All destructive tools (write_file, run_terminal) require user approval before execution.

import * as vscode from 'vscode';
import * as path from 'path';
import { ITool } from './ITool';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve a workspace-relative path to an absolute URI
// ─────────────────────────────────────────────────────────────────────────────
function resolveUri(filePath: string): vscode.Uri {
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
export class ReadFileTool implements ITool {
  readonly name = 'read_file';
  readonly definition = {
    name: 'read_file',
    description: 'Read the contents of a file in the workspace. Path is relative to the workspace root.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute path to the file.' },
        start_line: { type: 'number', description: 'First line to read (1-based, optional).' },
        end_line:   { type: 'number', description: 'Last line to read (1-based, optional).' },
      },
      required: ['path'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const uri = resolveUri(args['path'] as string);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text  = new TextDecoder().decode(bytes);
    const lines = text.split('\n');

    const start = args['start_line'] ? (args['start_line'] as number) - 1 : 0;
    const end   = args['end_line']   ? (args['end_line']   as number)     : lines.length;
    const slice = lines.slice(start, end).join('\n');

    return `File: ${args['path']} (lines ${start + 1}–${end})\n\`\`\`\n${slice}\n\`\`\``;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// write_file  — shows diff preview + requires approval
// ─────────────────────────────────────────────────────────────────────────────
export class WriteFileTool implements ITool {
  readonly name = 'write_file';
  readonly definition = {
    name: 'write_file',
    description: 'Write or overwrite a file in the workspace. Always requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Relative or absolute path to the file.' },
        content: { type: 'string', description: 'Full new content of the file.' },
      },
      required: ['path', 'content'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = args['path'] as string;
    const content  = args['content'] as string;
    const uri      = resolveUri(filePath);

    // Try to show a diff — open existing file vs proposed change
    let existingContent = '';
    try {
      const bytes  = await vscode.workspace.fs.readFile(uri);
      existingContent = new TextDecoder().decode(bytes);
    } catch { /* new file */ }

    // Show approval dialog
    const action = await vscode.window.showWarningMessage(
      `AI wants to write to: ${filePath}`,
      { modal: true, detail: `${content.split('\n').length} lines of new content.` },
      'Apply',
      'View Diff',
      'Cancel'
    );

    if (action === 'View Diff') {
      // Write to a tmp URI and show diff
      const tmpUri = uri.with({ scheme: 'untitled', path: uri.path + '.proposed' });
      await vscode.workspace.openTextDocument(tmpUri);
      await vscode.commands.executeCommand('vscode.diff', uri, tmpUri, `AI proposed changes to ${filePath}`);
      const confirm = await vscode.window.showWarningMessage('Apply this change?', { modal: true }, 'Apply', 'Cancel');
      if (confirm !== 'Apply') return 'Write cancelled by user.';
    } else if (action !== 'Apply') {
      return 'Write cancelled by user.';
    }

    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
    return `Successfully wrote ${content.split('\n').length} lines to ${filePath}.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// run_terminal  — requires approval, runs in integrated terminal
// ─────────────────────────────────────────────────────────────────────────────
export class RunTerminalTool implements ITool {
  readonly name = 'run_terminal';
  readonly definition = {
    name: 'run_terminal',
    description: 'Run a shell command in the VS Code integrated terminal. Always requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute.' },
        cwd:     { type: 'string', description: 'Working directory (optional, defaults to workspace root).' },
      },
      required: ['command'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const command = args['command'] as string;

    const action = await vscode.window.showWarningMessage(
      `AI wants to run a terminal command`,
      { modal: true, detail: `$ ${command}` },
      'Run',
      'Cancel'
    );

    if (action !== 'Run') return 'Command cancelled by user.';

    const terminal = vscode.window.createTerminal({
      name: 'AI Agent',
      cwd: args['cwd'] ? resolveUri(args['cwd'] as string).fsPath : undefined,
    });
    terminal.show();
    terminal.sendText(command);

    return `Command sent to terminal: ${command}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// list_directory
// ─────────────────────────────────────────────────────────────────────────────
export class ListDirectoryTool implements ITool {
  readonly name = 'list_directory';
  readonly definition = {
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

  async execute(args: Record<string, unknown>): Promise<string> {
    const dirPath = (args['path'] as string | undefined) ?? '.';
    const uri     = resolveUri(dirPath);
    const entries = await vscode.workspace.fs.readDirectory(uri);

    const lines = entries.map(([name, type]) => {
      const icon = type === vscode.FileType.Directory ? '📁' : '📄';
      return `${icon} ${name}`;
    });

    return `Directory: ${dirPath}\n${lines.join('\n')}`;
  }
}

// Export a registry for easy lookup by name
export const ALL_TOOLS: ITool[] = [
  new ReadFileTool(),
  new WriteFileTool(),
  new RunTerminalTool(),
  new ListDirectoryTool(),
];

export const TOOL_REGISTRY = new Map<string, ITool>(
  ALL_TOOLS.map(t => [t.name, t])
);
