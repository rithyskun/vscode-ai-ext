"use strict";
// src/views/ChatPanel.ts
// Manages the sidebar webview panel.
// Bridges VS Code extension host ↔ webview via postMessage.
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
exports.ChatViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const ModelRouter_1 = require("../core/ModelRouter");
const ContextBuilder_1 = require("../core/ContextBuilder");
const AgentRunner_1 = require("../core/AgentRunner");
class ChatViewProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        webviewView.webview.html = this.getHtml();
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'chat') {
                await this.handleChat(msg.text, msg.agentMode, msg.history ?? []);
            }
            else if (msg.type === 'changeProvider') {
                await this.handleProviderChange(msg.provider);
            }
            else if (msg.type === 'changeModel') {
                await this.handleModelChange(msg.model);
            }
        });
    }
    async handleChat(userMessage, agentMode, rawHistory) {
        if (!this.view)
            return;
        try {
            const provider = (0, ModelRouter_1.getProvider)();
            const { contextLines } = (0, ModelRouter_1.getConfig)();
            const { systemPrompt, messages } = (0, ContextBuilder_1.buildContext)(rawHistory, userMessage, contextLines);
            if (agentMode) {
                // Agent mode: tool-calling loop
                const updates = [];
                for await (const update of (0, AgentRunner_1.runAgent)(provider, userMessage, rawHistory, () => { })) {
                    this.view.webview.postMessage({ type: 'agent_update', update });
                }
            }
            else {
                // Chat mode: streaming
                let accumulated = '';
                for await (const chunk of provider.stream(messages, systemPrompt)) {
                    accumulated += chunk;
                    this.view.webview.postMessage({ type: 'stream_chunk', accumulated });
                }
                const updatedHistory = [
                    ...rawHistory,
                    { role: 'user', content: userMessage },
                    { role: 'assistant', content: accumulated },
                ];
                this.view.webview.postMessage({
                    type: 'stream_done',
                    history: updatedHistory,
                    providerName: `${provider.name} / ${provider.model}`,
                });
            }
        }
        catch (err) {
            this.view.webview.postMessage({ type: 'error', message: err?.message ?? String(err) });
        }
    }
    async handleProviderChange(provider) {
        if (!this.view)
            return;
        try {
            let configPath = null;
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
            const { reloadProviderConfig } = await Promise.resolve().then(() => __importStar(require('../core/ModelRouter')));
            reloadProviderConfig();
            this.view.webview.postMessage({ type: 'providerChanged', provider });
        }
        catch (err) {
            this.view.webview.postMessage({ type: 'error', message: err?.message ?? String(err) });
        }
    }
    async updateProviderConfig(configPath, newProvider) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        config.defaultProvider = newProvider;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
    async handleModelChange(model) {
        if (!this.view)
            return;
        try {
            if (!model) {
                this.view.webview.postMessage({ type: 'modelChanged', model: 'default' });
                return;
            }
            let configPath = null;
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
            const { reloadProviderConfig } = await Promise.resolve().then(() => __importStar(require('../core/ModelRouter')));
            reloadProviderConfig();
            this.view.webview.postMessage({ type: 'modelChanged', model });
        }
        catch (err) {
            this.view.webview.postMessage({ type: 'error', message: err?.message ?? String(err) });
        }
    }
    async updateModelConfig(configPath, newModel) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        const provider = config.defaultProvider;
        if (config.providers[provider]) {
            config.providers[provider].model = newModel;
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
    getHtml() {
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'views', 'webview', 'index.html');
        return fs.readFileSync(htmlPath, 'utf8');
    }
}
exports.ChatViewProvider = ChatViewProvider;
ChatViewProvider.viewType = 'aiAssistant.chatView';
//# sourceMappingURL=ChatPanel.js.map