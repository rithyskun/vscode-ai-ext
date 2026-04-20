// src/core/ModelRouter.ts
// Reads provider configuration from SQLite database and VS Code settings for UI preferences.
// Call getProvider() on every request — it re-reads config so provider switches
// take effect without reloading the extension.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IModelProvider } from '../providers/IModelProvider';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import { OllamaProvider } from '../providers/OllamaProvider';
import { OpenRouterProvider } from '../providers/OpenRouterProvider';
import { LMSProvider } from '../providers/LMSProvider';
import { ProviderConfigService, ProviderConfig } from './ProviderConfigService';

interface LegacyProviderConfig {
  defaultProvider: string;
  providers: {
    anthropic: { apiKey: string; model: string; enabled: boolean };
    ollama: { baseUrl: string; model: string; enabled: boolean };
    openrouter: { apiKey: string; model: string; enabled: boolean };
    lms: { baseUrl: string; model: string; enabled: boolean };
  };
}

let providerConfig: LegacyProviderConfig | null = null;

/**
 * Migrate configuration from providers.json to database
 * This is a one-time migration that runs if providers.json exists
 */
async function migrateFromJsonToDatabase(): Promise<void> {
  let configPath: string | null = null;

  // Try multiple possible locations for providers.json
  const extension = vscode.extensions.getExtension('vscode-ai-assistant');
  if (extension) {
    const extensionPath = extension.extensionUri.fsPath;
    const possiblePath = path.join(extensionPath, 'providers.json');
    const outPath = path.join(extensionPath, 'out', 'providers.json');
    if (fs.existsSync(possiblePath)) {
      configPath = possiblePath;
    } else if (fs.existsSync(outPath)) {
      configPath = outPath;
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
    return; // No providers.json to migrate
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const jsonConfig = JSON.parse(configContent) as LegacyProviderConfig;
    const service = ProviderConfigService.getInstance();

    // Migrate default provider
    await service.setDefaultProvider(jsonConfig.defaultProvider);

    // Migrate each provider
    if (jsonConfig.providers.anthropic) {
      await service.updateProviderConfig('anthropic', {
        enabled: jsonConfig.providers.anthropic.enabled,
        api_key: jsonConfig.providers.anthropic.apiKey,
        model: jsonConfig.providers.anthropic.model,
      });
    }

    if (jsonConfig.providers.ollama) {
      await service.updateProviderConfig('ollama', {
        enabled: jsonConfig.providers.ollama.enabled,
        base_url: jsonConfig.providers.ollama.baseUrl,
        model: jsonConfig.providers.ollama.model,
      });
    }

    if (jsonConfig.providers.openrouter) {
      await service.updateProviderConfig('openrouter', {
        enabled: jsonConfig.providers.openrouter.enabled,
        api_key: jsonConfig.providers.openrouter.apiKey,
        model: jsonConfig.providers.openrouter.model,
      });
    }

    if (jsonConfig.providers.lms) {
      await service.updateProviderConfig('lms', {
        enabled: jsonConfig.providers.lms.enabled,
        base_url: jsonConfig.providers.lms.baseUrl,
        model: jsonConfig.providers.lms.model,
      });
    }

    console.log('Successfully migrated configuration from providers.json to database');
  } catch (error) {
    console.error('Failed to migrate configuration from providers.json:', error);
  }
}

const DEFAULT_CONFIG: LegacyProviderConfig = {
  defaultProvider: 'lms',
  providers: {
    anthropic: { apiKey: '', model: 'claude-haiku-4-5-20251001', enabled: false },
    ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5-coder:7b', enabled: false },
    openrouter: { apiKey: '', model: 'google/gemma-2-9b-it:free', enabled: false },
    lms: { baseUrl: 'http://localhost:1234', model: 'google/gemma-4-e2b', enabled: true },
  },
};

// Run migration on first load
let migrationRun = false;

async function loadProviderConfig(): Promise<LegacyProviderConfig> {
  if (providerConfig) return providerConfig;

  // Run migration once
  if (!migrationRun) {
    await migrateFromJsonToDatabase();
    migrationRun = true;
  }

  // Try multiple possible locations for providers.json (fallback)
  let configPath: string | null = null;

  // 1. Try extension directory (when installed)
  const extension = vscode.extensions.getExtension('vscode-ai-assistant');
  if (extension) {
    const extensionPath = extension.extensionUri.fsPath;
    const possiblePath = path.join(extensionPath, 'providers.json');
    const outPath = path.join(extensionPath, 'out', 'providers.json');
    if (fs.existsSync(possiblePath)) {
      configPath = possiblePath;
    } else if (fs.existsSync(outPath)) {
      configPath = outPath;
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
    console.log('providers.json not found, using default configuration');
    return DEFAULT_CONFIG;
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  providerConfig = JSON.parse(configContent) as LegacyProviderConfig;
  return providerConfig;
}

export function getProvider(): IModelProvider {
  const service = ProviderConfigService.getInstance();
  const defaultProvider = service.getDefaultProvider() || 'lms';
  const providerConfig = service.getProviderConfig(defaultProvider);

  if (!providerConfig) {
    throw new Error(`Provider '${defaultProvider}' not found in configuration`);
  }

  if (!providerConfig.enabled) {
    throw new Error(`${defaultProvider} provider is not enabled`);
  }

  switch (defaultProvider) {
    case 'anthropic': {
      if (!providerConfig.api_key) {
        throw new Error('Anthropic apiKey is not set');
      }
      return new AnthropicProvider(providerConfig.api_key, providerConfig.model || 'claude-haiku-4-5-20251001');
    }

    case 'openrouter': {
      if (!providerConfig.api_key) {
        throw new Error('OpenRouter apiKey is not set');
      }
      return new OpenRouterProvider(providerConfig.api_key, providerConfig.model || 'google/gemma-2-9b-it:free');
    }

    case 'lms': {
      return new LMSProvider(providerConfig.model || 'google/gemma-4-e2b', providerConfig.base_url || 'http://localhost:1234');
    }

    case 'ollama':
    default: {
      return new OllamaProvider(providerConfig.model || 'qwen2.5-coder:7b', providerConfig.base_url || 'http://localhost:11434');
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

export function getProviderConfig(): ProviderConfig[] {
  const service = ProviderConfigService.getInstance();
  return service.getAllProviderConfigs();
}

export function reloadProviderConfig() {
  providerConfig = null;
  // No need to reload database, it's always fresh
}
