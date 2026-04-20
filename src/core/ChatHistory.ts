// src/core/ChatHistory.ts
// Chat history persistence service using JSON file storage

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChatMessage } from '../providers/IModelProvider';

interface ChatHistoryData {
  [sessionId: string]: ChatMessage[];
}

export class ChatHistoryService {
  private static instance: ChatHistoryService;
  private readonly DEFAULT_SESSION_ID = 'default';
  private readonly HISTORY_FILE = 'chat-history.json';
  private history: ChatHistoryData = {};
  private storagePath: string = '';

  private constructor() {}

  public static getInstance(): ChatHistoryService {
    if (!ChatHistoryService.instance) {
      ChatHistoryService.instance = new ChatHistoryService();
    }
    return ChatHistoryService.instance;
  }

  public setStoragePath(storagePath: string): void {
    this.storagePath = storagePath;
  }

  private ensureLoaded(): void {
    if (Object.keys(this.history).length === 0 && this.storagePath) {
      const filePath = path.join(this.storagePath, this.HISTORY_FILE);
      if (fs.existsSync(filePath)) {
        try {
          const data = fs.readFileSync(filePath, 'utf-8');
          this.history = JSON.parse(data);
        } catch (error) {
          console.error('Failed to load chat history:', error);
          this.history = {};
        }
      }
    }
  }

  private save(): void {
    if (this.storagePath) {
      const filePath = path.join(this.storagePath, this.HISTORY_FILE);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this.history, null, 2), 'utf-8');
    }
  }

  public async saveMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    try {
      this.ensureLoaded();
      
      if (!this.history[sessionId]) {
        this.history[sessionId] = [];
      }
      
      this.history[sessionId].push({ role, content });
      this.save();
    } catch (error) {
      console.error('Failed to save message:', error);
      throw new Error(`Failed to save message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async saveMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    try {
      this.ensureLoaded();
      
      if (!this.history[sessionId]) {
        this.history[sessionId] = [];
      }
      
      this.history[sessionId].push(...messages);
      this.save();
    } catch (error) {
      console.error('Failed to save messages:', error);
      throw new Error(`Failed to save messages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public loadHistory(sessionId: string = this.DEFAULT_SESSION_ID): ChatMessage[] {
    try {
      this.ensureLoaded();
      return this.history[sessionId] || [];
    } catch (error) {
      console.error('Failed to load history:', error);
      return [];
    }
  }

  public async clearHistory(sessionId: string = this.DEFAULT_SESSION_ID): Promise<void> {
    try {
      this.ensureLoaded();
      this.history[sessionId] = [];
      this.save();
    } catch (error) {
      console.error('Failed to clear history:', error);
      throw new Error(`Failed to clear history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async deleteSession(sessionId: string): Promise<void> {
    try {
      this.ensureLoaded();
      delete this.history[sessionId];
      this.save();
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw new Error(`Failed to delete session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public getAllSessions(): string[] {
    try {
      this.ensureLoaded();
      return Object.keys(this.history);
    } catch (error) {
      console.error('Failed to get sessions:', error);
      return [];
    }
  }

  public getMessageCount(sessionId: string = this.DEFAULT_SESSION_ID): number {
    try {
      this.ensureLoaded();
      return this.history[sessionId]?.length || 0;
    } catch (error) {
      console.error('Failed to get message count:', error);
      return 0;
    }
  }
}
