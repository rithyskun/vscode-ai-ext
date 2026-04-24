// src/tools/AgentTools.ts
// Implements agent tools: read_file, write_file, run_terminal, list_directory,
// search_files, edit_file, delete_file, create_directory.
// Destructive tools require user approval before execution unless permission policy allows it.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ITool } from './ITool';
import { PermissionService } from '../core/PermissionService';

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
        with_line_numbers: { type: 'boolean', description: 'Return the selected lines with line numbers (optional, default: false).' },
      },
      required: ['path'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const uri = resolveUri(args['path'] as string);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text  = new TextDecoder().decode(bytes);
    const lines = text.split('\n');

    const startArg = args['start_line'] ? Number(args['start_line']) : 1;
    const endArg   = args['end_line']   ? Number(args['end_line'])   : lines.length;
    const start = Math.max(1, Math.floor(startArg));
    const end = Math.max(start, Math.min(lines.length, Math.floor(endArg)));
    const withLineNumbers = Boolean(args['with_line_numbers']);

    const selected = lines.slice(start - 1, end);
    const output = withLineNumbers
      ? selected.map((line, index) => `${start + index}: ${line}`).join('\n')
      : selected.join('\n');

    return `File: ${args['path']} (lines ${start}–${end})\n\`\`\`\n${output}\n\`\`\``;
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
        mode: { type: 'string', description: 'Write mode: "overwrite" (default) or "append".', enum: ['overwrite', 'append'] },
      },
      required: ['path', 'content'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = args['path'] as string;
    const content  = args['content'] as string;
    const mode = (args['mode'] as string | undefined) ?? 'overwrite';
    const uri      = resolveUri(filePath);
    const permissionService = PermissionService.getInstance();

    // Check permission
    const permissionCheck = await permissionService.checkPermission(
      'write_file',
      'execute',
      JSON.stringify(args)
    );

    // Try to show a diff — open existing file vs proposed change
    let existingContent = '';
    try {
      const bytes  = await vscode.workspace.fs.readFile(uri);
      existingContent = new TextDecoder().decode(bytes);
    } catch { /* new file */ }
    const newContent = mode === 'append' && existingContent
      ? `${existingContent}${existingContent.endsWith('\n') ? '' : '\n'}${content}`
      : content;

    // Only show approval dialog if permission policy requires it
    if (!permissionCheck.allowed) {
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
        const tmpDoc = await vscode.workspace.openTextDocument({ content: newContent });
        await vscode.commands.executeCommand('vscode.diff', uri, tmpDoc.uri, `AI proposed changes to ${filePath}`);
        const confirm = await vscode.window.showWarningMessage('Apply this change?', { modal: true }, 'Apply', 'Cancel');
        if (confirm !== 'Apply') {
          permissionService.recordPermissionHistory('write_file', 'execute', false, 'User cancelled');
          return 'Write cancelled by user.';
        }
      } else if (action !== 'Apply') {
        permissionService.recordPermissionHistory('write_file', 'execute', false, 'User cancelled');
        return 'Write cancelled by user.';
      }
    }
    const parentDir = vscode.Uri.file(path.dirname(uri.fsPath));
    await vscode.workspace.fs.createDirectory(parentDir);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(newContent));
    return `Successfully ${mode === 'append' ? 'appended to' : 'wrote'} ${filePath} (${newContent.split('\n').length} lines total).`;
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
    const permissionService = PermissionService.getInstance();

    // Check permission
    const permissionCheck = await permissionService.checkPermission(
      'run_terminal',
      'execute',
      JSON.stringify(args)
    );

    // Only show approval dialog if permission policy requires it
    if (!permissionCheck.allowed) {
      const action = await vscode.window.showWarningMessage(
        `AI wants to run a terminal command`,
        { modal: true, detail: `$ ${command}` },
        'Run',
        'Cancel'
      );

      if (action !== 'Run') {
        permissionService.recordPermissionHistory('run_terminal', 'execute', false, 'User cancelled');
        return 'Command cancelled by user.';
      }
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// search_files
// ─────────────────────────────────────────────────────────────────────────────
export class SearchFilesTool implements ITool {
  readonly name = 'search_files';
  readonly definition = {
    name: 'search_files',
    description: 'Search for files in the workspace by name pattern or content pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'File name pattern (e.g., *.ts, **/*.json)' },
        content_pattern: { type: 'string', description: 'Content pattern to search within files (optional).' },
        path: { type: 'string', description: 'Directory to search in (optional, defaults to workspace root).' },
        max_results: { type: 'number', description: 'Maximum number of results to return (default: 50).' },
      },
      required: ['pattern'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const pattern = args['pattern'] as string;
    const contentPattern = args['content_pattern'] as string | undefined;
    const searchPath = (args['path'] as string | undefined) ?? '.';
    const maxResults = (args['max_results'] as number | undefined) ?? 50;

    const uri = resolveUri(searchPath);
    const results: string[] = [];

    // Use vscode.workspace.findFiles for pattern matching
    const files = await vscode.workspace.findFiles(
      pattern,
      '**/node_modules/**',
      maxResults
    );

    for (const file of files) {
      const relativePath = vscode.workspace.asRelativePath(file);
      
      if (contentPattern) {
        // Search content
        try {
          const content = await vscode.workspace.fs.readFile(file);
          const text = new TextDecoder().decode(content);
          if (text.toLowerCase().includes(contentPattern.toLowerCase())) {
            results.push(`📄 ${relativePath}`);
          }
        } catch {
          // Skip files that can't be read
        }
      } else {
        results.push(`📄 ${relativePath}`);
      }
    }

    if (results.length === 0) {
      return `No files found matching pattern: ${pattern}`;
    }

    return `Found ${results.length} file(s):\n${results.slice(0, maxResults).join('\n')}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// edit_file  — edit specific lines in a file
// ─────────────────────────────────────────────────────────────────────────────
export class EditFileTool implements ITool {
  readonly name = 'edit_file';
  readonly definition = {
    name: 'edit_file',
    description: 'Edit specific lines in a file by replacing old content with new content. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute path to the file.' },
        old_text: { type: 'string', description: 'The text to replace.' },
        new_text: { type: 'string', description: 'The new text to replace with.' },
        start_line: { type: 'number', description: 'Start line number (1-based, optional).' },
        end_line: { type: 'number', description: 'End line number (1-based, optional).' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = args['path'] as string;
    const oldText = args['old_text'] as string;
    const newText = args['new_text'] as string;
    const uri = resolveUri(filePath);
    const permissionService = PermissionService.getInstance();

    // Check permission
    const permissionCheck = await permissionService.checkPermission(
      'edit_file',
      'execute',
      JSON.stringify(args)
    );

    const bytes = await vscode.workspace.fs.readFile(uri);
    let content = new TextDecoder().decode(bytes);
    
    if (!content.includes(oldText)) {
      return `Error: Old text not found in file ${filePath}`;
    }

    const newContent = content.replace(oldText, newText);
    const diffLines = newContent.split('\n').length - content.split('\n').length;

    // Only show approval dialog if permission policy requires it
    if (!permissionCheck.allowed) {
      const action = await vscode.window.showWarningMessage(
        `AI wants to edit: ${filePath}`,
        { modal: true, detail: `Replacing text. ${diffLines >= 0 ? '+' : ''}${diffLines} lines.` },
        'Apply',
        'Cancel'
      );

      if (action !== 'Apply') {
        permissionService.recordPermissionHistory('edit_file', 'execute', false, 'User cancelled');
        return 'Edit cancelled by user.';
      }
    }

    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(newContent));
    return `Successfully edited ${filePath}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// delete_file  — delete a file
// ─────────────────────────────────────────────────────────────────────────────
export class DeleteFileTool implements ITool {
  readonly name = 'delete_file';
  readonly definition = {
    name: 'delete_file',
    description: 'Delete a file from the workspace. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute path to the file.' },
      },
      required: ['path'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = args['path'] as string;
    const uri = resolveUri(filePath);
    const permissionService = PermissionService.getInstance();

    // Check permission
    const permissionCheck = await permissionService.checkPermission(
      'delete_file',
      'execute',
      JSON.stringify(args)
    );

    // Only show approval dialog if permission policy requires it
    if (!permissionCheck.allowed) {
      const action = await vscode.window.showWarningMessage(
        `AI wants to delete: ${filePath}`,
        { modal: true, detail: 'This action cannot be undone.' },
        'Delete',
        'Cancel'
      );

      if (action !== 'Delete') {
        permissionService.recordPermissionHistory('delete_file', 'execute', false, 'User cancelled');
        return 'Delete cancelled by user.';
      }
    }

    await vscode.workspace.fs.delete(uri);
    return `Successfully deleted ${filePath}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// create_directory  — create a directory
// ─────────────────────────────────────────────────────────────────────────────
export class CreateDirectoryTool implements ITool {
  readonly name = 'create_directory';
  readonly definition = {
    name: 'create_directory',
    description: 'Create a directory in the workspace. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute path to the directory.' },
      },
      required: ['path'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const dirPath = args['path'] as string;
    const uri = resolveUri(dirPath);
    const permissionService = PermissionService.getInstance();

    // Check permission
    const permissionCheck = await permissionService.checkPermission(
      'create_directory',
      'execute',
      JSON.stringify(args)
    );

    // Only show approval dialog if permission policy requires it
    if (!permissionCheck.allowed) {
      const action = await vscode.window.showWarningMessage(
        `AI wants to create directory: ${dirPath}`,
        { modal: true },
        'Create',
        'Cancel'
      );

      if (action !== 'Create') {
        permissionService.recordPermissionHistory('create_directory', 'execute', false, 'User cancelled');
        return 'Directory creation cancelled by user.';
      }
    }

    await vscode.workspace.fs.createDirectory(uri);
    return `Successfully created directory: ${dirPath}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// extract_code_blocks  — extract code blocks from text
// ─────────────────────────────────────────────────────────────────────────────
export class ExtractCodeBlocksTool implements ITool {
  readonly name = 'extract_code_blocks';
  readonly definition = {
    name: 'extract_code_blocks',
    description: 'Extract code blocks from markdown-formatted text. Returns a list of code blocks with their languages.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to extract code blocks from.' },
      },
      required: ['text'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const text = args['text'] as string;
    
    // Regex to match code blocks: ```language\ncode\n```
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    const codeBlocks: Array<{ language: string; code: string }> = [];
    
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      codeBlocks.push({
        language: match[1] || 'text',
        code: match[2].trim(),
      });
    }

    if (codeBlocks.length === 0) {
      return 'No code blocks found in the provided text.';
    }

    const result = codeBlocks.map((block, index) => 
      `Block ${index + 1} (${block.language}):\n\`\`\`${block.language}\n${block.code}\n\`\`\``
    ).join('\n\n');

    return `Found ${codeBlocks.length} code block(s):\n\n${result}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// apply_code_block  — apply a code block to a file
// ─────────────────────────────────────────────────────────────────────────────
export class ApplyCodeBlockTool implements ITool {
  readonly name = 'apply_code_block';
  readonly definition = {
    name: 'apply_code_block',
    description: 'Apply a code block to a file. Can append, prepend, or replace content. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute path to the file.' },
        code: { type: 'string', description: 'The code to apply.' },
        mode: { 
          type: 'string', 
          description: 'How to apply the code: "replace" (default), "append", "prepend", or "replace_between_markers".',
          enum: ['replace', 'append', 'prepend', 'replace_between_markers']
        },
        start_marker: { type: 'string', description: 'Start marker for replace_between_markers mode.' },
        end_marker: { type: 'string', description: 'End marker for replace_between_markers mode.' },
      },
      required: ['path', 'code'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = args['path'] as string;
    const code = args['code'] as string;
    const mode = (args['mode'] as string) || 'replace';
    const uri = resolveUri(filePath);

    let newContent: string;
    let existingContent = '';

    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      existingContent = new TextDecoder().decode(bytes);
    } catch {
      // File doesn't exist, will create new
    }

    switch (mode) {
      case 'append':
        newContent = existingContent ? existingContent + '\n' + code : code;
        break;
      
      case 'prepend':
        newContent = existingContent ? code + '\n' + existingContent : code;
        break;
      
      case 'replace_between_markers':
        const startMarker = args['start_marker'] as string;
        const endMarker = args['end_marker'] as string;
        
        if (!startMarker || !endMarker) {
          return 'Error: start_marker and end_marker are required for replace_between_markers mode.';
        }
        
        const markerRegex = new RegExp(
          `${this.escapeRegex(startMarker)}([\\s\\S]*?)${this.escapeRegex(endMarker)}`,
          'g'
        );
        
        if (!markerRegex.test(existingContent)) {
          return `Error: Markers not found in file ${filePath}`;
        }
        
        newContent = existingContent.replace(markerRegex, `${startMarker}\n${code}\n${endMarker}`);
        break;
      
      case 'replace':
      default:
        newContent = code;
        break;
    }

    const diffLines = newContent.split('\n').length - existingContent.split('\n').length;
    const permissionService = PermissionService.getInstance();

    // Check permission
    const permissionCheck = await permissionService.checkPermission(
      'apply_code_block',
      'execute',
      JSON.stringify(args)
    );

    // Only show approval dialog if permission policy requires it
    if (!permissionCheck.allowed) {
      const action = await vscode.window.showWarningMessage(
        `AI wants to apply code to: ${filePath}`,
        { modal: true, detail: `Mode: ${mode}. ${diffLines >= 0 ? '+' : ''}${diffLines} lines.` },
        'Apply',
        'View Diff',
        'Cancel'
      );

      if (action === 'View Diff') {
        const tmpUri = uri.with({ scheme: 'untitled', path: uri.path + '.proposed' });
        await vscode.workspace.openTextDocument(tmpUri);
        await vscode.commands.executeCommand('vscode.diff', uri, tmpUri, `AI proposed changes to ${filePath}`);
        const confirm = await vscode.window.showWarningMessage('Apply this change?', { modal: true }, 'Apply', 'Cancel');
        if (confirm !== 'Apply') {
          permissionService.recordPermissionHistory('apply_code_block', 'execute', false, 'User cancelled');
          return 'Apply cancelled by user.';
        }
      } else if (action !== 'Apply') {
        permissionService.recordPermissionHistory('apply_code_block', 'execute', false, 'User cancelled');
        return 'Apply cancelled by user.';
      }
    }

    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(newContent));
    return `Successfully applied code to ${filePath} (${mode} mode)`;
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Export a registry for easy lookup by name
export const ALL_TOOLS: ITool[] = [
  new ReadFileTool(),
  new WriteFileTool(),
  new RunTerminalTool(),
  new ListDirectoryTool(),
  new SearchFilesTool(),
  new EditFileTool(),
  new DeleteFileTool(),
  new CreateDirectoryTool(),
  new ExtractCodeBlocksTool(),
  new ApplyCodeBlockTool(),
];

export const TOOL_REGISTRY = new Map<string, ITool>(
  ALL_TOOLS.map(t => [t.name, t])
);
