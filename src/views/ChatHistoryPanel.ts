// src/views/ChatHistoryPanel.ts
// Manages the chat history webview view.
// Displays sessions and allows switching between them.

import * as vscode from 'vscode';
import * as path from 'path';
import { ChatHistoryService } from '../core/ChatHistory';

export class ChatHistoryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiAssistant.chatHistory';
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
    void this.refresh();

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
        await this.refresh();
      }
    });
  }

  private async handleNewSession(name?: string) {
    try {
      const historyService = ChatHistoryService.getInstance();
      const sessionId = await historyService.createSession(name);
      this.currentSessionId = sessionId;
      
      // Notify the chat panel to switch to this session
      vscode.commands.executeCommand('aiAssistant.switchSession', sessionId);
      
      await this.refresh();
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
      console.log('[ChatHistoryPanel] Loading session:', sessionId);
      this.currentSessionId = sessionId;
      // Notify the chat panel to switch to this session
      console.log('[ChatHistoryPanel] Executing switchSession command');
      vscode.commands.executeCommand('aiAssistant.switchSession', sessionId);
      await this.refresh();
    } catch (error) {
      console.error('[ChatHistoryPanel] Error loading session:', error);
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
      
      // If we deleted the current session, switch to default
      if (sessionId === this.currentSessionId) {
        this.currentSessionId = 'default';
        vscode.commands.executeCommand('aiAssistant.switchSession', 'default');
      }
      
      await this.refresh();
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
      await historyService.renameSession(sessionId, newName);
      await this.refresh();
    } catch (error) {
      if (this.view) {
        this.view.webview.postMessage({
          type: 'error',
          message: `Failed to rename session: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  public async refresh() {
    if (!this.view) return;

    const historyService = ChatHistoryService.getInstance();
    const sessions = await historyService.getSessionsWithMetadata();
    
    this.view.webview.postMessage({
      type: 'sessionsList',
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        messageCount: s.messageCount,
        createdAt: new Date(s.createdAt).toLocaleString(),
        updatedAt: new Date(s.updatedAt).toLocaleString()
      })),
      currentSessionId: this.currentSessionId
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
  
  <div id="new-session-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
    <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; max-width: 400px; width: 90%; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 12px;">
      <div style="font-weight: 600; color: var(--fg); font-size: 14px;">Create New Session</div>
      <input id="session-name-input" type="text" placeholder="Session name (optional)" style="background: var(--input-bg); color: var(--fg); border: 1px solid var(--input-border); border-radius: 6px; padding: 10px; font-size: 13px; font-family: inherit;" />
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="modal-cancel-btn" style="background: transparent; border: 1px solid var(--border); color: var(--fg); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-family: inherit;">Cancel</button>
        <button id="modal-create-btn" style="background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; font-family: inherit;">Create</button>
      </div>
    </div>
  </div>
  
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
      // Create new session without prompting for name - name will be set from first message
      vscode.postMessage({ type: 'newSession', name: 'New Chat' });
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'sessionsList') {
        currentSessionId = msg.currentSessionId || 'default';
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

        // Add click listener to the entire item
        item.addEventListener('click', function(e) {
          // If clicking on an action button, don't load the session
          if (e.target.closest('.action-btn')) {
            return;
          }
          // Load the session
          currentSessionId = session.id;
          console.log('Loading session:', session.id);
          vscode.postMessage({ type: 'loadSession', sessionId: session.id });
        });

        container.appendChild(item);
      });

      // Add event listeners to action buttons AFTER all items are added
      document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          const action = this.getAttribute('data-action');
          const sessionId = this.getAttribute('data-session');

          if (action === 'delete') {
            console.log('Deleting session:', sessionId);
            vscode.postMessage({ type: 'deleteSession', sessionId });
          } else if (action === 'rename') {
            console.log('Renaming session:', sessionId);
            promptForRename(sessionId);
          }
        });
      });
    }

    async function promptForSessionName() {
      const input = prompt('Enter session name:', '');
      return input;
    }

    function showNewSessionModal() {
      const modal = document.getElementById('new-session-modal');
      const input = document.getElementById('session-name-input');
      const createBtn = document.getElementById('modal-create-btn');
      const cancelBtn = document.getElementById('modal-cancel-btn');
      
      modal.style.display = 'flex';
      input.value = '';
      input.focus();
      
      const handleCreate = () => {
        const name = input.value.trim();
        closeNewSessionModal();
        vscode.postMessage({ type: 'newSession', name: name || undefined });
      };
      
      const handleCancel = () => {
        closeNewSessionModal();
      };
      
      const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
          handleCreate();
        } else if (e.key === 'Escape') {
          handleCancel();
        }
      };
      
      createBtn.onclick = handleCreate;
      cancelBtn.onclick = handleCancel;
      input.onkeydown = handleKeyDown;
    }
    
    function closeNewSessionModal() {
      const modal = document.getElementById('new-session-modal');
      modal.style.display = 'none';
      document.getElementById('session-name-input').onkeydown = null;
      document.getElementById('modal-create-btn').onclick = null;
      document.getElementById('modal-cancel-btn').onclick = null;
    }

    async function promptForRename(sessionId) {
      const modal = document.getElementById('new-session-modal');
      const input = document.getElementById('session-name-input');
      const createBtn = document.getElementById('modal-create-btn');
      const cancelBtn = document.getElementById('modal-cancel-btn');
      
      // Reuse the modal for rename
      const titleDiv = modal.querySelector('div:first-child');
      const originalTitle = titleDiv.textContent;
      titleDiv.textContent = 'Rename Session';
      createBtn.textContent = 'Rename';
      
      const session = currentSessionId === sessionId ? 
        { name: currentSessionId } : 
        { name: '' };
      
      modal.style.display = 'flex';
      input.value = session.name;
      input.focus();
      input.select();
      
      const handleRename = () => {
        const newName = input.value.trim();
        closeNewSessionModal();
        titleDiv.textContent = originalTitle;
        createBtn.textContent = 'Create';
        if (newName) {
          vscode.postMessage({ type: 'renameSession', sessionId, newName });
        }
      };
      
      const handleCancel = () => {
        closeNewSessionModal();
        titleDiv.textContent = originalTitle;
        createBtn.textContent = 'Create';
      };
      
      const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
          handleRename();
        } else if (e.key === 'Escape') {
          handleCancel();
        }
      };
      
      createBtn.onclick = handleRename;
      cancelBtn.onclick = handleCancel;
      input.onkeydown = handleKeyDown;
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
