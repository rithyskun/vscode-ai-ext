// src/views/ChatPanel.ts
// Manages the sidebar webview panel.
// Bridges VS Code extension host ↔ webview via postMessage.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getProvider, getConfig, getProviderConfig } from '../core/ModelRouter';
import { buildContext } from '../core/ContextBuilder';
import { runAgent } from '../core/AgentRunner';
import { ChatMessage } from '../providers/IModelProvider';
import { ChatHistoryService } from '../core/ChatHistory';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiAssistant.chatView';
  private view?: vscode.WebviewView;
  private currentSessionId: string = 'default';

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    // Load initial session history
    this.loadSessionHistory();

    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'chat') {
        await this.handleChat(msg.text, msg.agentMode, msg.history ?? []);
      } else if (msg.type === 'changeProvider') {
        await this.handleProviderChange(msg.provider);
      } else if (msg.type === 'changeModel') {
        await this.handleModelChange(msg.model);
      } else if (msg.type === 'insertCode') {
        await this.handleInsertCode(msg.code, msg.language);
      }
    });
  }

  private async handleChat(
    userMessage: string,
    agentMode: boolean,
    rawHistory: ChatMessage[]
  ) {
    if (!this.view) return;

    try {
      const provider = getProvider();
      const { contextLines } = getConfig();
      const { systemPrompt, messages } = buildContext(rawHistory, userMessage, contextLines);

      // Save user message to history
      const historyService = ChatHistoryService.getInstance();
      await historyService.saveMessage(this.currentSessionId, 'user', userMessage);

      if (agentMode) {
        // Agent mode: tool-calling loop
        const updates: ChatMessage[] = [];
        for await (const update of runAgent(provider, userMessage, rawHistory, () => {})) {
          this.view.webview.postMessage({ type: 'agent_update', update });
        }
      } else {
        // Chat mode: streaming
        let accumulated = '';
        for await (const chunk of provider.stream(messages, systemPrompt)) {
          accumulated += chunk;
          this.view.webview.postMessage({ type: 'stream_chunk', accumulated });
        }

        // Save assistant message to history
        await historyService.saveMessage(this.currentSessionId, 'assistant', accumulated);

        const updatedHistory: ChatMessage[] = [
          ...rawHistory,
          { role: 'user',      content: userMessage },
          { role: 'assistant', content: accumulated },
        ];

        this.view.webview.postMessage({
          type: 'stream_done',
          history: updatedHistory,
          providerName: `${provider.name} / ${provider.model}`,
        });
      }
    } catch (err: any) {
      this.view.webview.postMessage({ type: 'error', message: err?.message ?? String(err) });
    }
  }

  private async handleProviderChange(provider: string) {
    if (!this.view) return;

    try {
      let configPath: string | null = null;

      // Try multiple locations for providers.json
      // 1. Try extension directory (when installed)
      const extension = vscode.extensions.getExtension('vscode-ai-assistant');
      if (extension) {
        const extensionPath = extension.extensionUri.fsPath;
        const possiblePath = path.join(extensionPath, 'providers.json');
        if (fs.existsSync(possiblePath)) {
          configPath = possiblePath;
        }
      }

      // 2. Try workspace root (for development)
      if (!configPath) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const possiblePath = path.join(workspaceFolders[0].uri.fsPath, 'providers.json');
          if (fs.existsSync(possiblePath)) {
            configPath = possiblePath;
          }
        }
      }

      // 3. Try current working directory
      if (!configPath) {
        const possiblePath = path.join(process.cwd(), 'providers.json');
        if (fs.existsSync(possiblePath)) {
          configPath = possiblePath;
        }
      }

      if (!configPath) {
        throw new Error('providers.json not found. Please create it in the extension root or workspace directory.');
      }

      await this.updateProviderConfig(configPath, provider);

      // Force reload of provider config
      const { reloadProviderConfig } = await import('../core/ModelRouter');
      reloadProviderConfig();

      this.view.webview.postMessage({ type: 'providerChanged', provider });
    } catch (err: any) {
      this.view.webview.postMessage({ type: 'error', message: err?.message ?? String(err) });
    }
  }

  private async updateProviderConfig(configPath: string, newProvider: string) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    config.defaultProvider = newProvider;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  private async handleModelChange(model: string) {
    if (!this.view) return;

    try {
      if (!model) {
        this.view.webview.postMessage({ type: 'modelChanged', model: 'default' });
        return;
      }

      let configPath: string | null = null;

      // Try multiple locations for providers.json
      const extension = vscode.extensions.getExtension('vscode-ai-assistant');
      if (extension) {
        const extensionPath = extension.extensionUri.fsPath;
        const possiblePath = path.join(extensionPath, 'providers.json');
        if (fs.existsSync(possiblePath)) {
          configPath = possiblePath;
        }
      }

      if (!configPath) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const possiblePath = path.join(workspaceFolders[0].uri.fsPath, 'providers.json');
          if (fs.existsSync(possiblePath)) {
            configPath = possiblePath;
          }
        }
      }

      if (!configPath) {
        const possiblePath = path.join(process.cwd(), 'providers.json');
        if (fs.existsSync(possiblePath)) {
          configPath = possiblePath;
        }
      }

      if (!configPath) {
        throw new Error('providers.json not found');
      }

      await this.updateModelConfig(configPath, model);

      // Force reload of provider config
      const { reloadProviderConfig } = await import('../core/ModelRouter');
      reloadProviderConfig();

      this.view.webview.postMessage({ type: 'modelChanged', model });
    } catch (err: any) {
      this.view.webview.postMessage({ type: 'error', message: err?.message ?? String(err) });
    }
  }

  private async updateModelConfig(configPath: string, newModel: string) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    const provider = config.defaultProvider;
    if (config.providers[provider]) {
      config.providers[provider].model = newModel;
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  public switchSession(sessionId: string) {
    this.currentSessionId = sessionId;
    this.loadSessionHistory();
  }

  public notifyThemeChange(theme: string) {
    if (!this.view) return;

    this.view.webview.postMessage({
      type: 'themeChanged',
      theme
    });
  }

  private loadSessionHistory() {
    if (!this.view) return;

    try {
      const historyService = ChatHistoryService.getInstance();
      const history = historyService.loadHistory(this.currentSessionId);
      
      this.view.webview.postMessage({
        type: 'loadSession',
        sessionId: this.currentSessionId,
        history
      });
    } catch (error) {
      console.error('Failed to load session history:', error);
    }
  }

  private async handleInsertCode(code: string, language: string = 'text') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor. Open a file first to insert code.');
      return;
    }

    try {
      // Insert at cursor position or at end of document
      const position = editor.selection.active;
      await editor.edit(editBuilder => {
        const insertionPoint = new vscode.Position(position.line, position.character);
        editBuilder.insert(insertionPoint, code + '\n');
      });

      vscode.window.showInformationMessage(`Inserted ${language} code into editor`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to insert code: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getHtml(): string {
    const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'views', 'webview', 'index.html');
    return fs.readFileSync(htmlPath, 'utf8');
  }
}
