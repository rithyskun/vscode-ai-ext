// src/core/ModelRouter.ts
// Reads provider configuration from providers.json and VS Code settings for UI preferences.
// Call getProvider() on every request — it re-reads config so provider switches
// take effect without reloading the extension.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IModelProvider } from '../providers/IModelProvider';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import { OllamaProvider } from '../providers/OllamaProvider';
import { OpenRouterProvider } from '../providers/OpenRouterProvider';

interface ProviderConfig {
  defaultProvider: string;
  providers: {
    anthropic: { apiKey: string; model: string; enabled: boolean };
    ollama: { baseUrl: string; model: string; enabled: boolean };
    openrouter: { apiKey: string; model: string; enabled: boolean };
  };
}

let providerConfig: ProviderConfig | null = null;

function loadProviderConfig(): ProviderConfig {
  if (providerConfig) return providerConfig;

  // Try multiple possible locations for providers.json
  let configPath: string | null = null;

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
  providerConfig = JSON.parse(configContent) as ProviderConfig;
  return providerConfig;
}

export function getProvider(): IModelProvider {
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
      return new AnthropicProvider(providerConfig.apiKey, providerConfig.model);
    }

    case 'openrouter': {
      const providerConfig = config.providers.openrouter;
      if (!providerConfig.enabled) {
        throw new Error('OpenRouter provider is not enabled in providers.json');
      }
      if (!providerConfig.apiKey) {
        throw new Error('OpenRouter apiKey is not set in providers.json');
      }
      return new OpenRouterProvider(providerConfig.apiKey, providerConfig.model);
    }

    case 'ollama':
    default: {
      const providerConfig = config.providers.ollama;
      if (!providerConfig.enabled) {
        throw new Error('Ollama provider is not enabled in providers.json');
      }
      return new OllamaProvider(providerConfig.model, providerConfig.baseUrl);
    }
  }
}

export function getConfig() {
  const cfg = vscode.workspace.getConfiguration('aiAssistant');
  return {
    agentMode: cfg.get<boolean>('agentMode', true),
    inlineCompletion: cfg.get<boolean>('inlineCompletion', true),
    contextLines: cfg.get<number>('contextLines', 50),
  };
}

export function getProviderConfig(): ProviderConfig {
  return loadProviderConfig();
}

export function reloadProviderConfig() {
  providerConfig = null;
}
