// src/core/ChatHistory.ts
// Chat history persistence service using MongoDB storage.

import * as vscode from 'vscode';
import { ChatMessage } from '../providers/IModelProvider';

interface SessionMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

interface ChatHistoryData {
  [sessionId: string]: ChatMessage[];
}

interface SessionDocument extends SessionMetadata {
  messages: ChatMessage[];
}

export class ChatHistoryService {
  private static instance: ChatHistoryService;
  private readonly DEFAULT_SESSION_ID = 'default';
  private readonly DEFAULT_SESSION_NAME = 'Default Session';
  private history: ChatHistoryData = {};
  private metadata: { [sessionId: string]: SessionMetadata } = {};
  private storagePath = '';
  private client?: any;
  private db?: any;
  private isLoaded = false;
  private loadPromise?: Promise<void>;

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

  public async initialize(): Promise<void> {
    await this.ensureLoaded();
  }

  private getMongoSettings() {
    const cfg = vscode.workspace.getConfiguration('aiAssistant');
    const mongoUri = cfg.get<string>('mongoUri', '').trim();
    const mongoDatabase = cfg.get<string>('mongoDatabase', 'vscode_ai_assistant').trim() || 'vscode_ai_assistant';
    const mongoCollection = cfg.get<string>('mongoCollection', 'chat_sessions').trim() || 'chat_sessions';

    if (!mongoUri) {
      throw new Error('Missing `aiAssistant.mongoUri` setting. Configure MongoDB before using chat history.');
    }

    return { mongoUri, mongoDatabase, mongoCollection };
  }

  private async ensureLoaded(): Promise<void> {
    if (this.isLoaded) {
      return;
    }

    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }

    this.loadPromise = this.loadFromMongo();
    await this.loadPromise;
  }

  private async loadFromMongo(): Promise<void> {
    const { mongoUri, mongoDatabase, mongoCollection } = this.getMongoSettings();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MongoClient } = require('mongodb');
    this.client = new MongoClient(mongoUri);
    await this.client.connect();
    this.db = this.client.db(mongoDatabase);

    const docs = await this.db
      .collection(mongoCollection)
      .find({})
      .toArray();

    this.history = {};
    this.metadata = {};

    for (const doc of docs) {
      this.history[doc.id] = doc.messages || [];
      this.metadata[doc.id] = {
        id: doc.id,
        name: doc.name,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        messageCount: doc.messageCount,
      };
    }

    if (!this.metadata[this.DEFAULT_SESSION_ID]) {
      const now = Date.now();
      this.metadata[this.DEFAULT_SESSION_ID] = {
        id: this.DEFAULT_SESSION_ID,
        name: this.DEFAULT_SESSION_NAME,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      };
      this.history[this.DEFAULT_SESSION_ID] = [];
      await this.persistSession(this.DEFAULT_SESSION_ID);
    }

    this.isLoaded = true;
  }

  private async persistSession(sessionId: string): Promise<void> {
    if (!this.db) {
      throw new Error('MongoDB connection is not initialized.');
    }

    const { mongoCollection } = this.getMongoSettings();
    const metadata = this.metadata[sessionId];
    const messages = this.history[sessionId] || [];

    if (!metadata) {
      throw new Error(`Session metadata not found for ${sessionId}`);
    }

    await this.db.collection(mongoCollection).updateOne(
      { id: sessionId },
      {
        $set: {
          ...metadata,
          messages,
        },
      },
      { upsert: true }
    );
  }

  public async saveMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    await this.ensureLoaded();

    if (!this.history[sessionId]) {
      this.history[sessionId] = [];
    }

    this.history[sessionId].push({ role, content });

    if (!this.metadata[sessionId]) {
      const now = Date.now();
      this.metadata[sessionId] = {
        id: sessionId,
        name: `Session ${new Date().toLocaleDateString()}`,
        createdAt: now,
        updatedAt: now,
        messageCount: this.history[sessionId].length,
      };
    } else {
      this.metadata[sessionId].updatedAt = Date.now();
      this.metadata[sessionId].messageCount = this.history[sessionId].length;
    }

    await this.persistSession(sessionId);
  }

  public async saveMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    await this.ensureLoaded();

    if (!this.history[sessionId]) {
      this.history[sessionId] = [];
    }

    this.history[sessionId].push(...messages);

    if (!this.metadata[sessionId]) {
      const now = Date.now();
      this.metadata[sessionId] = {
        id: sessionId,
        name: `Session ${new Date().toLocaleDateString()}`,
        createdAt: now,
        updatedAt: now,
        messageCount: this.history[sessionId].length,
      };
    } else {
      this.metadata[sessionId].updatedAt = Date.now();
      this.metadata[sessionId].messageCount = this.history[sessionId].length;
    }

    await this.persistSession(sessionId);
  }

  public async loadHistory(sessionId: string = this.DEFAULT_SESSION_ID): Promise<ChatMessage[]> {
    await this.ensureLoaded();
    return this.history[sessionId] || [];
  }

  public async clearHistory(sessionId: string = this.DEFAULT_SESSION_ID): Promise<void> {
    await this.ensureLoaded();

    const metadata = this.metadata[sessionId];
    if (!metadata) {
      return;
    }

    metadata.updatedAt = Date.now();
    metadata.messageCount = 0;
    this.history[sessionId] = [];

    await this.persistSession(sessionId);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await this.ensureLoaded();

    if (sessionId === this.DEFAULT_SESSION_ID) {
      await this.clearHistory(sessionId);
      return;
    }

    delete this.history[sessionId];
    delete this.metadata[sessionId];

    if (!this.db) {
      throw new Error('MongoDB connection is not initialized.');
    }

    const { mongoCollection } = this.getMongoSettings();
    await this.db.collection(mongoCollection).deleteOne({ id: sessionId });
  }

  public async getAllSessions(): Promise<string[]> {
    await this.ensureLoaded();
    return Object.keys(this.history);
  }

  public async getMessageCount(sessionId: string = this.DEFAULT_SESSION_ID): Promise<number> {
    await this.ensureLoaded();
    return this.history[sessionId]?.length || 0;
  }

  public async createSession(sessionName?: string): Promise<string> {
    await this.ensureLoaded();

    const sessionId = `session_${Date.now()}`;
    const name = sessionName || `Session ${new Date().toLocaleDateString()}`;
    const now = Date.now();

    this.history[sessionId] = [];
    this.metadata[sessionId] = {
      id: sessionId,
      name,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };

    await this.persistSession(sessionId);
    return sessionId;
  }

  public async renameSession(sessionId: string, newName: string): Promise<void> {
    await this.ensureLoaded();

    if (this.metadata[sessionId]) {
      this.metadata[sessionId].name = newName;
      this.metadata[sessionId].updatedAt = Date.now();
      await this.persistSession(sessionId);
    }
  }

  public async getSessionsWithMetadata(): Promise<SessionMetadata[]> {
    await this.ensureLoaded();
    return Object.values(this.metadata).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async getSessionMetadata(sessionId: string): Promise<SessionMetadata | undefined> {
    await this.ensureLoaded();
    return this.metadata[sessionId];
  }
}
