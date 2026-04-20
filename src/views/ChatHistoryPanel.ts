// src/views/ChatHistoryPanel.ts
// Manages the chat history webview view.
// Displays sessions and allows switching between them.

import * as vscode from 'vscode';
import * as path from 'path';
import { ChatHistoryService } from '../core/ChatHistory';

export class ChatHistoryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiAssistant.chatHistory';
  private view?: vscode.WebviewView;

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
    this.refresh();

    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'newSession') {
        await this.handleNewSession(msg.name);
      } else if (msg.type === 'loadSession') {
        await this.handleLoadSession(msg.sessionId);
      } else if (msg.type === 'deleteSession') {
        await this.handleDeleteSession(msg.sessionId);
      } else if (msg.type === 'renameSession') {
        await this.handleRenameSession(msg.sessionId, msg.newName);
      } else if (msg.type === 'refreshSessions') {
        this.refresh();
      }
    });
  }

  private async handleNewSession(name?: string) {
    try {
      const historyService = ChatHistoryService.getInstance();
      const sessionId = historyService.createSession(name);
      
      // Notify the chat panel to switch to this session
      vscode.commands.executeCommand('aiAssistant.switchSession', sessionId);
      
      this.refresh();
    } catch (error) {
      if (this.view) {
        this.view.webview.postMessage({
          type: 'error',
          message: `Failed to create session: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  private async handleLoadSession(sessionId: string) {
    try {
      // Notify the chat panel to switch to this session
      vscode.commands.executeCommand('aiAssistant.switchSession', sessionId);
    } catch (error) {
      if (this.view) {
        this.view.webview.postMessage({
          type: 'error',
          message: `Failed to load session: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  private async handleDeleteSession(sessionId: string) {
    try {
      const historyService = ChatHistoryService.getInstance();
      
      // Don't allow deleting the default session without confirmation
      if (sessionId === 'default') {
        const confirmed = await vscode.window.showWarningMessage(
          'Delete default session? This will clear the chat history.',
          { modal: true },
          'Delete'
        );
        if (!confirmed) return;
      }
      
      await historyService.deleteSession(sessionId);
      this.refresh();
      
      // Notify the chat panel
      vscode.commands.executeCommand('aiAssistant.switchSession', 'default');
    } catch (error) {
      if (this.view) {
        this.view.webview.postMessage({
          type: 'error',
          message: `Failed to delete session: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  private async handleRenameSession(sessionId: string, newName: string) {
    try {
      const historyService = ChatHistoryService.getInstance();
      historyService.renameSession(sessionId, newName);
      this.refresh();
    } catch (error) {
      if (this.view) {
        this.view.webview.postMessage({
          type: 'error',
          message: `Failed to rename session: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  public refresh() {
    if (!this.view) return;

    const historyService = ChatHistoryService.getInstance();
    const sessions = historyService.getSessionsWithMetadata();
    
    this.view.webview.postMessage({
      type: 'sessionsList',
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        messageCount: s.messageCount,
        createdAt: new Date(s.createdAt).toLocaleString(),
        updatedAt: new Date(s.updatedAt).toLocaleString()
      }))
    });
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chat History</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --bg-secondary: #12121a;
      --fg: #e8e8e8;
      --muted: #8b8b9b;
      --input-bg: #1a1a24;
      --input-border: #2a2a3a;
      --border: #1e1e2e;
      --border-hover: #3a3a4a;
      --accent: #8b5cf6;
      --accent-hover: #7c3aed;
      --radius: 8px;
      --shadow: 0 2px 8px rgba(0,0,0,0.3);
    }

    html.light-theme {
      --bg: #ffffff;
      --bg-secondary: #f5f5f5;
      --fg: #1a1a1a;
      --muted: #666666;
      --input-bg: #f0f0f0;
      --input-border: #ddd;
      --border: #e0e0e0;
      --border-hover: #d0d0d0;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: var(--bg);
      color: var(--fg);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #header {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-shrink: 0;
    }

    .header-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--muted);
    }

    #new-session-btn {
      background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
      color: white;
      border: none;
      border-radius: var(--radius);
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    #new-session-btn:hover {
      opacity: 0.9;
      box-shadow: 0 0 12px rgba(139, 92, 246, 0.3);
    }

    #new-session-btn:active {
      transform: scale(0.95);
    }

    #sessions-container {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .session-item {
      padding: 8px 10px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .session-item:hover {
      border-color: var(--border-hover);
      background: var(--input-bg);
    }

    .session-item.active {
      border-color: var(--accent);
      background: rgba(139, 92, 246, 0.1);
    }

    .session-name {
      font-weight: 500;
      color: var(--fg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .session-meta {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--muted);
      gap: 4px;
    }

    .session-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .session-item:hover .session-actions {
      opacity: 1;
    }

    .action-btn {
      background: transparent;
      border: 1px solid var(--border-hover);
      color: var(--fg);
      width: 20px;
      height: 20px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      transition: all 0.2s ease;
    }

    .action-btn:hover {
      background: var(--accent-hover);
      border-color: var(--accent);
      color: white;
    }

    #empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      text-align: center;
      padding: 20px;
      gap: 12px;
    }

    #empty-state p {
      font-size: 12px;
      line-height: 1.5;
    }

    .error-message {
      padding: 8px 10px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: var(--radius);
      color: #fca5a5;
      font-size: 12px;
      margin: 8px;
      display: none;
    }

    .error-message.show {
      display: block;
    }
  </style>
</head>
<body>
  <div id="header">
    <div class="header-title">Sessions</div>
    <button id="new-session-btn">+ New</button>
  </div>
  <div id="error-message" class="error-message"></div>
  <div id="sessions-container">
    <div id="empty-state">
      <p>No sessions yet</p>
      <p style="font-size: 11px; opacity: 0.7;">Create a new session to start chatting</p>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentSessionId = null;

    document.getElementById('new-session-btn').addEventListener('click', async () => {
      const name = await promptForSessionName();
      if (name !== null) {
        vscode.postMessage({ type: 'newSession', name: name || undefined });
      }
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'sessionsList') {
        renderSessions(msg.sessions);
      } else if (msg.type === 'error') {
        showError(msg.message);
      }
    });

    function renderSessions(sessions) {
      const container = document.getElementById('sessions-container');
      const emptyState = document.getElementById('empty-state');

      if (sessions.length === 0) {
        container.innerHTML = emptyState.outerHTML;
        return;
      }

      container.innerHTML = '';
      sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'session-item';
        if (session.id === currentSessionId) {
          item.classList.add('active');
        }

        item.innerHTML = \`
          <div class="session-name">\${escapeHtml(session.name)}</div>
          <div class="session-meta">
            <span>\${session.messageCount} messages</span>
            <span>\${session.updatedAt}</span>
          </div>
          <div class="session-actions">
            <button class="action-btn" title="Rename" data-action="rename" data-session="\${session.id}">✏️</button>
            <button class="action-btn" title="Delete" data-action="delete" data-session="\${session.id}">🗑️</button>
          </div>
        \`;

        item.addEventListener('click', (e) => {
          if (!e.target.closest('.action-btn')) {
            currentSessionId = session.id;
            vscode.postMessage({ type: 'loadSession', sessionId: session.id });
          }
        });

        container.appendChild(item);
      });

      // Add event listeners to action buttons
      document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.getAttribute('data-action');
          const sessionId = btn.getAttribute('data-session');

          if (action === 'delete') {
            vscode.postMessage({ type: 'deleteSession', sessionId });
          } else if (action === 'rename') {
            promptForRename(sessionId);
          }
        });
      });
    }

    async function promptForSessionName() {
      const input = prompt('Enter session name:', '');
      return input;
    }

    async function promptForRename(sessionId) {
      const input = prompt('Enter new session name:');
      if (input !== null) {
        vscode.postMessage({ type: 'renameSession', sessionId, newName: input });
      }
    }

    function showError(message) {
      const errorDiv = document.getElementById('error-message');
      errorDiv.textContent = message;
      errorDiv.classList.add('show');
      setTimeout(() => {
        errorDiv.classList.remove('show');
      }, 5000);
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Detect light theme
    window.addEventListener('load', () => {
      if (document.body.classList.contains('light-theme')) {
        document.documentElement.classList.add('light-theme');
      }
    });

    // Request initial sessions list
    vscode.postMessage({ type: 'refreshSessions' });
  </script>
</body>
</html>`;
  }
}
