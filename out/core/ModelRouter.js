"use strict";
// src/core/ModelRouter.ts
// Reads provider configuration from providers.json and VS Code settings for UI preferences.
// Call getProvider() on every request — it re-reads config so provider switches
// take effect without reloading the extension.
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
exports.getProvider = getProvider;
exports.getConfig = getConfig;
exports.getProviderConfig = getProviderConfig;
exports.reloadProviderConfig = reloadProviderConfig;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const AnthropicProvider_1 = require("../providers/AnthropicProvider");
const OllamaProvider_1 = require("../providers/OllamaProvider");
const OpenRouterProvider_1 = require("../providers/OpenRouterProvider");
let providerConfig = null;
function loadProviderConfig() {
    if (providerConfig)
        return providerConfig;
    // Try multiple possible locations for providers.json
    let configPath = null;
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
    const configContent = fs.readFileSync(configPath, 'utf-8');
    providerConfig = JSON.parse(configContent);
    return providerConfig;
}
function getProvider() {
    const config = loadProviderConfig();
    const providerName = config.defaultProvider;
    switch (providerName) {
        case 'anthropic': {
            const providerConfig = config.providers.anthropic;
            if (!providerConfig.enabled) {
                throw new Error('Anthropic provider is not enabled in providers.json');
            }
            if (!providerConfig.apiKey) {
                throw new Error('Anthropic apiKey is not set in providers.json');
            }
            return new AnthropicProvider_1.AnthropicProvider(providerConfig.apiKey, providerConfig.model);
        }
        case 'openrouter': {
            const providerConfig = config.providers.openrouter;
            if (!providerConfig.enabled) {
                throw new Error('OpenRouter provider is not enabled in providers.json');
            }
            if (!providerConfig.apiKey) {
                throw new Error('OpenRouter apiKey is not set in providers.json');
            }
            return new OpenRouterProvider_1.OpenRouterProvider(providerConfig.apiKey, providerConfig.model);
        }
        case 'ollama':
        default: {
            const providerConfig = config.providers.ollama;
            if (!providerConfig.enabled) {
                throw new Error('Ollama provider is not enabled in providers.json');
            }
            return new OllamaProvider_1.OllamaProvider(providerConfig.model, providerConfig.baseUrl);
        }
    }
}
function getConfig() {
    const cfg = vscode.workspace.getConfiguration('aiAssistant');
    return {
        agentMode: cfg.get('agentMode', true),
        inlineCompletion: cfg.get('inlineCompletion', true),
        contextLines: cfg.get('contextLines', 50),
    };
}
function getProviderConfig() {
    return loadProviderConfig();
}
function reloadProviderConfig() {
    providerConfig = null;
}
//# sourceMappingURL=ModelRouter.js.map