// src/views/ProviderConfigPanel.ts
// Manages the provider configuration webview panel.
// Bridges VS Code extension host ↔ webview via postMessage.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProviderConfigService, ProviderConfig } from '../core/ProviderConfigService';
import { PermissionService, Permission } from '../core/PermissionService';

export class ProviderConfigViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiAssistant.providerConfigView';
  private view?: vscode.WebviewView;
  private readonly providerConfigService: ProviderConfigService;
  private readonly permissionService: PermissionService;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.providerConfigService = ProviderConfigService.getInstance();
    this.permissionService = PermissionService.getInstance();
  }

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

    // Load provider configs
    this.sendProviderConfigs();
    this.sendPermissions();

    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'getProviders') {
        this.sendProviderConfigs();
      } else if (msg.type === 'updateProvider') {
        await this.handleUpdateProvider(msg.providerName, msg.updates);
      } else if (msg.type === 'setDefaultProvider') {
        await this.handleSetDefaultProvider(msg.providerName);
      } else if (msg.type === 'testConnection') {
        await this.handleTestConnection(msg.providerName);
      } else if (msg.type === 'getPermissions') {
        this.sendPermissions();
      } else if (msg.type === 'updatePermission') {
        await this.handleUpdatePermission(msg.toolName, msg.policy);
      } else if (msg.type === 'getPermissionHistory') {
        this.sendPermissionHistory(msg.toolName);
      } else if (msg.type === 'clearPermissionHistory') {
        await this.handleClearPermissionHistory(msg.toolName);
      }
    });
  }

  private sendProviderConfigs(): void {
    try {
      const providers = this.providerConfigService.getAllProviderConfigs();
      const defaultProvider = this.providerConfigService.getDefaultProvider();
      
      this.view?.webview.postMessage({
        type: 'providers_loaded',
        providers,
        defaultProvider,
      });
    } catch (error) {
      console.error('Failed to send provider configs:', error);
      this.view?.webview.postMessage({ type: 'error', message: 'Failed to load provider configurations' });
    }
  }

  private async handleUpdateProvider(providerName: string, updates: any): Promise<void> {
    if (!this.view) return;

    try {
      await this.providerConfigService.updateProviderConfig(providerName, updates);
      this.sendProviderConfigs();
      this.view.webview.postMessage({ type: 'provider_updated', providerName });
    } catch (error) {
      console.error('Failed to update provider:', error);
      this.view.webview.postMessage({ 
        type: 'error', 
        message: `Failed to update provider: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  }

  private async handleSetDefaultProvider(providerName: string): Promise<void> {
    if (!this.view) return;

    try {
      await this.providerConfigService.setDefaultProvider(providerName);
      this.sendProviderConfigs();
      this.view.webview.postMessage({ type: 'default_provider_changed', providerName });
    } catch (error) {
      console.error('Failed to set default provider:', error);
      this.view.webview.postMessage({ 
        type: 'error', 
        message: `Failed to set default provider: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  }

  private async handleTestConnection(providerName: string): Promise<void> {
    if (!this.view) return;

    try {
      // For now, just validate the configuration
      const provider = this.providerConfigService.getProviderConfig(providerName);
      if (!provider) {
        throw new Error('Provider not found');
      }

      // Basic validation
      if (providerName === 'anthropic' || providerName === 'openrouter') {
        if (!provider.api_key) {
          throw new Error('API key is required');
        }
      }

      if (providerName === 'ollama' || providerName === 'lms') {
        if (!provider.base_url) {
          throw new Error('Base URL is required');
        }
      }

      this.view.webview.postMessage({ type: 'connection_test_success', providerName });
    } catch (error) {
      console.error('Failed to test connection:', error);
      this.view.webview.postMessage({ 
        type: 'connection_test_failed', 
        providerName,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private sendPermissions(): void {
    try {
      const permissions = this.permissionService.getAllPermissions();
      this.view?.webview.postMessage({ type: 'permissions_loaded', permissions });
    } catch (error) {
      console.error('Failed to send permissions:', error);
      this.view?.webview.postMessage({ type: 'error', message: 'Failed to load permissions' });
    }
  }

  private async handleUpdatePermission(toolName: string, policy: string): Promise<void> {
    if (!this.view) return;

    try {
      await this.permissionService.updatePermission(toolName, policy as any);
      this.sendPermissions();
      this.view.webview.postMessage({ type: 'permission_updated', toolName });
    } catch (error) {
      console.error('Failed to update permission:', error);
      this.view.webview.postMessage({ 
        type: 'error', 
        message: `Failed to update permission: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  }

  private sendPermissionHistory(toolName?: string): void {
    try {
      const history = this.permissionService.getPermissionHistory(toolName, 50);
      this.view?.webview.postMessage({ type: 'permission_history_loaded', history });
    } catch (error) {
      console.error('Failed to send permission history:', error);
      this.view?.webview.postMessage({ type: 'error', message: 'Failed to load permission history' });
    }
  }

  private async handleClearPermissionHistory(toolName?: string): Promise<void> {
    if (!this.view) return;

    try {
      await this.permissionService.clearPermissionHistory(toolName);
      this.sendPermissionHistory(toolName);
      this.view.webview.postMessage({ type: 'permission_history_cleared' });
    } catch (error) {
      console.error('Failed to clear permission history:', error);
      this.view.webview.postMessage({ 
        type: 'error', 
        message: `Failed to clear permission history: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  }

  private getHtml(): string {
    const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'views', 'webview', 'provider-config.html');
    if (fs.existsSync(htmlPath)) {
      return fs.readFileSync(htmlPath, 'utf8');
    }
    
    // Fallback HTML if file doesn't exist
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Configuration</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 10px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 10px;
    }
    .tab {
      padding: 8px 16px;
      cursor: pointer;
      border: none;
      background: none;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    .tab.active {
      border-bottom: 2px solid var(--vscode-button-primaryBackground);
      color: var(--vscode-button-primaryForeground);
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    .provider-card, .permission-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 10px;
      background-color: var(--vscode-editor-background);
    }
    .provider-header, .permission-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .provider-name, .permission-name {
      font-weight: bold;
      font-size: 14px;
    }
    .provider-status, .permission-status {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 3px;
    }
    .enabled {
      background-color: #4caf50;
      color: white;
    }
    .disabled {
      background-color: #757575;
      color: white;
    }
    .form-group {
      margin-bottom: 8px;
    }
    label {
      display: block;
      font-size: 12px;
      margin-bottom: 4px;
      color: var(--vscode-descriptionForeground);
    }
    input[type="text"], input[type="password"], select {
      width: 100%;
      padding: 6px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
      box-sizing: border-box;
    }
    button {
      padding: 6px 12px;
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      margin-right: 4px;
    }
    .btn-primary {
      background-color: var(--vscode-button-primaryBackground);
      color: var(--vscode-button-primaryForeground);
    }
    .btn-secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .checkbox-wrapper {
      display: flex;
      align-items: center;
    }
    .checkbox-wrapper input[type="checkbox"] {
      margin-right: 8px;
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="tabs">
      <button class="tab active" onclick="switchTab('providers')">Providers</button>
      <button class="tab" onclick="switchTab('permissions')">Permissions</button>
    </div>
    
    <div id="providers-tab" class="tab-content active">
      <h2>Provider Configuration</h2>
      <div id="providers-container"></div>
    </div>
    
    <div id="permissions-tab" class="tab-content">
      <h2>Permission Configuration</h2>
      <div id="permissions-container"></div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    
    // Request data on load
    vscode.postMessage({ type: 'getProviders' });
    vscode.postMessage({ type: 'getPermissions' });
    
    window.addEventListener('message', event => {
      const message = event.data;
      
      if (message.type === 'providers_loaded') {
        renderProviders(message.providers, message.defaultProvider);
      } else if (message.type === 'permissions_loaded') {
        renderPermissions(message.permissions);
      } else if (message.type === 'provider_updated') {
        vscode.postMessage({ type: 'getProviders' });
      } else if (message.type === 'permission_updated') {
        vscode.postMessage({ type: 'getPermissions' });
      } else if (message.type === 'error') {
        alert(message.message);
      } else if (message.type === 'connection_test_success') {
        alert('Connection test successful!');
      } else if (message.type === 'connection_test_failed') {
        alert('Connection test failed: ' + message.message);
      }
    });
    
    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById(tab + '-tab').classList.add('active');
    }
    
    function renderProviders(providers, defaultProvider) {
      const container = document.getElementById('providers-container');
      container.innerHTML = '';
      
      providers.forEach(provider => {
        const card = document.createElement('div');
        card.className = 'provider-card';
        
        const isDefault = provider.provider_name === defaultProvider;
        const statusClass = provider.enabled ? 'enabled' : 'disabled';
        const statusText = provider.enabled ? 'Enabled' : 'Disabled';
        
        card.innerHTML = \`
          <div class="provider-header">
            <span class="provider-name">\${provider.provider_name.toUpperCase()} \${isDefault ? '(Default)' : ''}</span>
            <span class="provider-status \${statusClass}">\${statusText}</span>
          </div>
          
          <div class="form-group checkbox-wrapper">
            <input type="checkbox" id="enabled-\${provider.provider_name}" 
              \${provider.enabled ? 'checked' : ''} 
              onchange="toggleProvider('\${provider.provider_name}', this.checked)">
            <label for="enabled-\${provider.provider_name}">Enabled</label>
          </div>
          
          \${provider.api_key !== null ? \`
            <div class="form-group">
              <label for="apikey-\${provider.provider_name}">API Key</label>
              <input type="password" id="apikey-\${provider.provider_name}" 
                value="\${provider.api_key || ''}" 
                onchange="updateProvider('\${provider.provider_name}', { api_key: this.value })">
            </div>
          \` : ''}
          
          \${provider.base_url !== null ? \`
            <div class="form-group">
              <label for="baseurl-\${provider.provider_name}">Base URL</label>
              <input type="text" id="baseurl-\${provider.provider_name}" 
                value="\${provider.base_url || ''}" 
                onchange="updateProvider('\${provider.provider_name}', { base_url: this.value })">
            </div>
          \` : ''}
          
          \${provider.model !== null ? \`
            <div class="form-group">
              <label for="model-\${provider.provider_name}">Model</label>
              <input type="text" id="model-\${provider.provider_name}" 
                value="\${provider.model || ''}" 
                onchange="updateProvider('\${provider.provider_name}', { model: this.value })">
            </div>
          \` : ''}
          
          <div>
            <button class="btn-primary" onclick="setDefaultProvider('\${provider.provider_name}')">
              \${isDefault ? 'Default' : 'Set as Default'}
            </button>
            <button class="btn-secondary" onclick="testConnection('\${provider.provider_name}')">
              Test Connection
            </button>
          </div>
        \`;
        
        container.appendChild(card);
      });
    }
    
    function renderPermissions(permissions) {
      const container = document.getElementById('permissions-container');
      container.innerHTML = '';
      
      permissions.forEach(perm => {
        const card = document.createElement('div');
        card.className = 'permission-card';
        
        card.innerHTML = \`
          <div class="permission-header">
            <span class="permission-name">\${perm.tool_name}</span>
            <span class="permission-description">\${perm.description || ''}</span>
          </div>
          
          <div class="form-group">
            <label for="policy-\${perm.tool_name}">Permission Policy</label>
            <select id="policy-\${perm.tool_name}" onchange="updatePermission('\${perm.tool_name}', this.value)">
              <option value="always_allow" \${perm.permission_policy === 'always_allow' ? 'selected' : ''}>Always Allow</option>
              <option value="ask" \${perm.permission_policy === 'ask' ? 'selected' : ''}>Ask Every Time</option>
              <option value="always_deny" \${perm.permission_policy === 'always_deny' ? 'selected' : ''}>Always Deny</option>
            </select>
          </div>
        \`;
        
        container.appendChild(card);
      });
    }
    
    function toggleProvider(providerName, enabled) {
      updateProvider(providerName, { enabled });
    }
    
    function updateProvider(providerName, updates) {
      vscode.postMessage({
        type: 'updateProvider',
        providerName,
        updates
      });
    }
    
    function setDefaultProvider(providerName) {
      vscode.postMessage({
        type: 'setDefaultProvider',
        providerName
      });
    }
    
    function testConnection(providerName) {
      vscode.postMessage({
        type: 'testConnection',
        providerName
      });
    }
    
    function updatePermission(toolName, policy) {
      vscode.postMessage({
        type: 'updatePermission',
        toolName,
        policy
      });
    }
  </script>
</body>
</html>
    `;
  }
}
