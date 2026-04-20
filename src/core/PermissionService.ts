// src/core/PermissionService.ts
// Permission management service using JSON file storage

import * as path from 'path';
import * as fs from 'fs';

export type PermissionPolicy = 'always_allow' | 'always_deny' | 'ask';

export interface Permission {
  tool_name: string;
  permission_policy: PermissionPolicy;
  description: string | null;
}

export interface PermissionHistoryDTO {
  tool_name: string;
  action: string;
  granted: boolean;
  details: string | null;
  timestamp: string;
}

export class PermissionService {
  private static instance: PermissionService;
  private permissions: Map<string, Permission> = new Map();
  private history: PermissionHistoryDTO[] = [];
  private storagePath: string = '';
  private readonly PERMISSIONS_FILE = 'permissions.json';
  private readonly HISTORY_FILE = 'permission-history.json';

  private constructor() {}

  public static getInstance(): PermissionService {
    if (!PermissionService.instance) {
      PermissionService.instance = new PermissionService();
    }
    return PermissionService.instance;
  }

  public setStoragePath(storagePath: string): void {
    this.storagePath = storagePath;
  }

  private ensureLoaded(): void {
    if (this.permissions.size === 0 && this.storagePath) {
      const permissionsPath = path.join(this.storagePath, this.PERMISSIONS_FILE);
      const historyPath = path.join(this.storagePath, this.HISTORY_FILE);
      
      if (fs.existsSync(permissionsPath)) {
        try {
          const data = fs.readFileSync(permissionsPath, 'utf-8');
          const perms: Permission[] = JSON.parse(data);
          perms.forEach(p => this.permissions.set(p.tool_name, p));
        } catch (error) {
          console.error('Failed to load permissions:', error);
          this.permissions = new Map();
        }
      }
      
      if (fs.existsSync(historyPath)) {
        try {
          const data = fs.readFileSync(historyPath, 'utf-8');
          this.history = JSON.parse(data);
        } catch (error) {
          console.error('Failed to load permission history:', error);
          this.history = [];
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
      
      const permsArray = Array.from(this.permissions.values());
      fs.writeFileSync(
        path.join(this.storagePath, this.PERMISSIONS_FILE),
        JSON.stringify(permsArray, null, 2),
        'utf-8'
      );
      
      fs.writeFileSync(
        path.join(this.storagePath, this.HISTORY_FILE),
        JSON.stringify(this.history, null, 2),
        'utf-8'
      );
    }
  }

  /**
   * Initialize the service
   */
  public async initialize(): Promise<void> {
    this.ensureLoaded();
    await this.initializeDefaultPermissions();
  }

  /**
   * Initialize default permissions
   */
  private async initializeDefaultPermissions(): Promise<void> {
    const defaultPermissions: Permission[] = [
      { tool_name: 'read_file', permission_policy: 'ask', description: 'Read file contents' },
      { tool_name: 'write_file', permission_policy: 'ask', description: 'Write to file' },
      { tool_name: 'run_terminal', permission_policy: 'ask', description: 'Execute terminal commands' },
      { tool_name: 'list_directory', permission_policy: 'always_allow', description: 'List directory contents' },
      { tool_name: 'search_files', permission_policy: 'always_allow', description: 'Search files' },
      { tool_name: 'edit_file', permission_policy: 'ask', description: 'Edit file content' },
      { tool_name: 'delete_file', permission_policy: 'ask', description: 'Delete file' },
      { tool_name: 'create_directory', permission_policy: 'always_allow', description: 'Create directory' },
    ];

    for (const perm of defaultPermissions) {
      if (!this.permissions.has(perm.tool_name)) {
        this.permissions.set(perm.tool_name, perm);
      }
    }
    
    this.save();
  }

  /**
   * Create a new permission
   */
  public async createPermission(toolName: string, policy: PermissionPolicy, description?: string): Promise<Permission> {
    try {
      this.ensureLoaded();
      
      const permission: Permission = {
        tool_name: toolName,
        permission_policy: policy,
        description: description || null,
      };
      
      this.permissions.set(toolName, permission);
      this.save();
      
      return permission;
    } catch (error) {
      console.error('Failed to create permission:', error);
      throw new Error(`Failed to create permission: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get permission by tool name
   */
  public getPermission(toolName: string): Permission | null {
    try {
      this.ensureLoaded();
      return this.permissions.get(toolName) || null;
    } catch (error) {
      console.error('Failed to get permission:', error);
      return null;
    }
  }

  /**
   * Get all permissions
   */
  public getAllPermissions(): Permission[] {
    try {
      this.ensureLoaded();
      return Array.from(this.permissions.values());
    } catch (error) {
      console.error('Failed to get all permissions:', error);
      return [];
    }
  }

  /**
   * Update permission
   */
  public async updatePermission(toolName: string, policy: PermissionPolicy, description?: string): Promise<Permission> {
    try {
      this.ensureLoaded();
      
      const existing = this.permissions.get(toolName);
      if (!existing) {
        throw new Error(`Permission for ${toolName} not found`);
      }
      
      existing.permission_policy = policy;
      if (description !== undefined) {
        existing.description = description;
      }
      
      this.permissions.set(toolName, existing);
      this.save();
      
      return existing;
    } catch (error) {
      console.error('Failed to update permission:', error);
      throw new Error(`Failed to update permission: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete permission
   */
  public async deletePermission(toolName: string): Promise<void> {
    try {
      this.ensureLoaded();
      this.permissions.delete(toolName);
      this.save();
    } catch (error) {
      console.error('Failed to delete permission:', error);
      throw new Error(`Failed to delete permission: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a tool execution is allowed based on permission policy
   */
  public async checkPermission(toolName: string, action: string, details?: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      this.ensureLoaded();
      
      const permission = this.permissions.get(toolName);
      if (!permission) {
        // Default to ask for unknown tools
        return { allowed: false, reason: 'Tool not found in permissions, asking user' };
      }
      
      if (permission.permission_policy === 'always_allow') {
        this.recordPermissionHistory(toolName, action, true, details);
        return { allowed: true };
      }
      
      if (permission.permission_policy === 'always_deny') {
        this.recordPermissionHistory(toolName, action, false, details);
        return { allowed: false, reason: 'Permission policy: always deny' };
      }
      
      // ask policy - return false and let caller handle asking user
      return { allowed: false, reason: 'Permission policy: ask user' };
    } catch (error) {
      console.error('Failed to check permission:', error);
      return { allowed: false, reason: 'Error checking permission' };
    }
  }

  /**
   * Record permission history
   */
  public recordPermissionHistory(toolName: string, action: string, granted: boolean, details?: string): void {
    try {
      this.ensureLoaded();
      
      const historyEntry: PermissionHistoryDTO = {
        tool_name: toolName,
        action,
        granted,
        details: details || null,
        timestamp: new Date().toISOString(),
      };
      
      this.history.unshift(historyEntry);
      
      // Keep only last 1000 entries
      if (this.history.length > 1000) {
        this.history = this.history.slice(0, 1000);
      }
      
      this.save();
    } catch (error) {
      console.error('Failed to record permission history:', error);
    }
  }

  /**
   * Get permission history
   */
  public getPermissionHistory(toolName?: string, limit: number = 50): PermissionHistoryDTO[] {
    try {
      this.ensureLoaded();
      
      if (toolName) {
        return this.history
          .filter(h => h.tool_name === toolName)
          .slice(0, limit);
      }
      
      return this.history.slice(0, limit);
    } catch (error) {
      console.error('Failed to get permission history:', error);
      return [];
    }
  }

  /**
   * Clear permission history
   */
  public async clearPermissionHistory(toolName?: string): Promise<void> {
    try {
      this.ensureLoaded();
      
      if (toolName) {
        this.history = this.history.filter(h => h.tool_name !== toolName);
      } else {
        this.history = [];
      }
      
      this.save();
    } catch (error) {
      console.error('Failed to clear permission history:', error);
      throw new Error(`Failed to clear permission history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
