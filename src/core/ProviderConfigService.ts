// src/core/ProviderConfigService.ts
// Provider configuration persistence service using JSON file storage

import * as path from 'path';
import * as fs from 'fs';

export interface ProviderConfig {
  provider_name: string;
  enabled: boolean;
  api_key: string | null;
  base_url: string | null;
  model: string | null;
  extra_config: Record<string, unknown> | null;
}

export interface CreateProviderConfigDTO {
  provider_name: string;
  enabled?: boolean;
  api_key?: string;
  base_url?: string;
  model?: string;
  extra_config?: Record<string, unknown>;
}

export interface UpdateProviderConfigDTO {
  enabled?: boolean;
  api_key?: string;
  base_url?: string;
  model?: string;
  extra_config?: Record<string, unknown>;
}

export class ProviderConfigService {
  private static instance: ProviderConfigService;
  private configs: ProviderConfig[] = [];
  private settings: Record<string, string> = {};
  private storagePath: string = '';
  private readonly CONFIG_FILE = 'provider-config.json';
  private readonly SETTINGS_FILE = 'settings.json';

  private constructor() {}

  public static getInstance(): ProviderConfigService {
    if (!ProviderConfigService.instance) {
      ProviderConfigService.instance = new ProviderConfigService();
    }
    return ProviderConfigService.instance;
  }

  public setStoragePath(storagePath: string): void {
    this.storagePath = storagePath;
  }

  private ensureLoaded(): void {
    if (this.configs.length === 0 && this.storagePath) {
      const configPath = path.join(this.storagePath, this.CONFIG_FILE);
      const settingsPath = path.join(this.storagePath, this.SETTINGS_FILE);
      
      if (fs.existsSync(configPath)) {
        try {
          const data = fs.readFileSync(configPath, 'utf-8');
          this.configs = JSON.parse(data);
        } catch (error) {
          console.error('Failed to load provider config:', error);
          this.configs = [];
        }
      }
      
      if (fs.existsSync(settingsPath)) {
        try {
          const data = fs.readFileSync(settingsPath, 'utf-8');
          this.settings = JSON.parse(data);
        } catch (error) {
          console.error('Failed to load settings:', error);
          this.settings = {};
        }
      }
    }
  }

  private save(): void {
    if (this.storagePath) {
      const dir = this.storagePath;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(this.storagePath, this.CONFIG_FILE),
        JSON.stringify(this.configs, null, 2),
        'utf-8'
      );
      
      fs.writeFileSync(
        path.join(this.storagePath, this.SETTINGS_FILE),
        JSON.stringify(this.settings, null, 2),
        'utf-8'
      );
    }
  }

  /**
   * Initialize the service
   */
  public async initialize(): Promise<void> {
    this.ensureLoaded();
    await this.initializeDefaultProviders();
  }

  /**
   * Initialize default providers if they don't exist
   */
  private async initializeDefaultProviders(): Promise<void> {
    const defaultProviders: CreateProviderConfigDTO[] = [
      {
        provider_name: 'anthropic',
        enabled: false,
        model: 'claude-haiku-4-5-20251001',
      },
      {
        provider_name: 'ollama',
        enabled: false,
        base_url: 'http://localhost:11434',
        model: 'qwen2.5-coder:7b',
      },
      {
        provider_name: 'openrouter',
        enabled: false,
        model: 'google/gemma-2-9b-it:free',
        extra_config: {
          freeModels: [
            'google/gemma-2-9b-it:free',
            'meta-llama/llama-3.2-3b-instruct:free',
            'meta-llama/llama-3.2-1b-instruct:free',
            'qwen/qwen-2.5-7b-instruct:free',
            'mistralai/mistral-7b-instruct:free',
            'microsoft/phi-3-mini-128k-instruct:free',
            'cognitivecomputations/dolphin-mixtral-8x7b:free',
          ],
        },
      },
      {
        provider_name: 'lms',
        enabled: true,
        base_url: 'http://localhost:1234',
        model: 'google/gemma-4-e2b',
      },
    ];

    for (const provider of defaultProviders) {
      const existing = this.getProviderConfig(provider.provider_name);
      if (!existing) {
        await this.createProviderConfig(provider);
      }
    }

    // Set default provider if not set
    const defaultProvider = this.getDefaultProvider();
    if (!defaultProvider) {
      await this.setSetting('defaultProvider', 'lms');
    }
  }

  /**
   * Create a new provider configuration
   */
  public async createProviderConfig(config: CreateProviderConfigDTO): Promise<ProviderConfig> {
    try {
      this.ensureLoaded();
      
      const newConfig: ProviderConfig = {
        provider_name: config.provider_name,
        enabled: config.enabled ?? false,
        api_key: config.api_key ?? null,
        base_url: config.base_url ?? null,
        model: config.model ?? null,
        extra_config: config.extra_config ?? null,
      };
      
      this.configs.push(newConfig);
      this.save();
      
      return newConfig;
    } catch (error) {
      console.error('Failed to create provider config:', error);
      throw new Error(`Failed to create provider config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get provider configuration by name
   */
  public getProviderConfig(providerName: string): ProviderConfig | null {
    try {
      this.ensureLoaded();
      return this.configs.find(c => c.provider_name === providerName) || null;
    } catch (error) {
      console.error('Failed to get provider config:', error);
      return null;
    }
  }

  /**
   * Get all provider configurations
   */
  public getAllProviderConfigs(): ProviderConfig[] {
    try {
      this.ensureLoaded();
      return [...this.configs];
    } catch (error) {
      console.error('Failed to get all provider configs:', error);
      return [];
    }
  }

  /**
   * Update provider configuration
   */
  public async updateProviderConfig(providerName: string, updates: UpdateProviderConfigDTO): Promise<ProviderConfig> {
    try {
      this.ensureLoaded();
      
      const index = this.configs.findIndex(c => c.provider_name === providerName);
      if (index === -1) {
        throw new Error(`Provider ${providerName} not found`);
      }
      
      if (updates.enabled !== undefined) {
        this.configs[index].enabled = updates.enabled;
      }
      if (updates.api_key !== undefined) {
        this.configs[index].api_key = updates.api_key;
      }
      if (updates.base_url !== undefined) {
        this.configs[index].base_url = updates.base_url;
      }
      if (updates.model !== undefined) {
        this.configs[index].model = updates.model;
      }
      if (updates.extra_config !== undefined) {
        this.configs[index].extra_config = updates.extra_config;
      }
      
      this.save();
      return this.configs[index];
    } catch (error) {
      console.error('Failed to update provider config:', error);
      throw new Error(`Failed to update provider config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete provider configuration
   */
  public async deleteProviderConfig(providerName: string): Promise<void> {
    try {
      this.ensureLoaded();
      this.configs = this.configs.filter(c => c.provider_name !== providerName);
      this.save();
    } catch (error) {
      console.error('Failed to delete provider config:', error);
      throw new Error(`Failed to delete provider config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get default provider
   */
  public getDefaultProvider(): string | null {
    try {
      this.ensureLoaded();
      return this.settings['defaultProvider'] || null;
    } catch (error) {
      console.error('Failed to get default provider:', error);
      return null;
    }
  }

  /**
   * Set default provider
   */
  public async setDefaultProvider(providerName: string): Promise<void> {
    await this.setSetting('defaultProvider', providerName);
  }

  /**
   * Get a setting value
   */
  public getSetting(key: string): string | null {
    try {
      this.ensureLoaded();
      return this.settings[key] || null;
    } catch (error) {
      console.error('Failed to get setting:', error);
      return null;
    }
  }

  /**
   * Set a setting value
   */
  public async setSetting(key: string, value: string): Promise<void> {
    try {
      this.ensureLoaded();
      this.settings[key] = value;
      this.save();
    } catch (error) {
      console.error('Failed to set setting:', error);
      throw new Error(`Failed to set setting: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get enabled providers only
   */
  public getEnabledProviders(): ProviderConfig[] {
    try {
      this.ensureLoaded();
      return this.configs.filter(c => c.enabled);
    } catch (error) {
      console.error('Failed to get enabled providers:', error);
      return [];
    }
  }
}
