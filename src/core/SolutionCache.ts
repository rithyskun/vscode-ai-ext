// src/core/SolutionCache.ts
// LRU cache for learned solutions to common problems

export interface CachedSolution {
  id: string;
  errorPattern: string;
  toolName: string;
  solution: string;
  recoveryStrategy?: string;
  successRate: number; // 0-1
  usageCount: number;
  lastUsed: number;
  taskType?: string;
}

export class SolutionCache {
  private static instance: SolutionCache;
  private cache: Map<string, CachedSolution>;
  private maxSize: number = 50;
  private persistenceKey: string = 'agent-solution-cache';

  private constructor() {
    this.cache = new Map();
    this.loadFromStorage();
  }

  static getInstance(): SolutionCache {
    if (!SolutionCache.instance) {
      SolutionCache.instance = new SolutionCache();
    }
    return SolutionCache.instance;
  }

  /**
   * Find cached solution for an error pattern
   */
  findSolution(
    errorPattern: string,
    toolName: string,
    taskType?: string
  ): CachedSolution | null {
    // Exact match first
    for (const [, solution] of this.cache) {
      if (
        solution.errorPattern === errorPattern &&
        solution.toolName === toolName
      ) {
        this.recordUsage(solution.id);
        return solution;
      }
    }

    // Partial match (error pattern contains key words)
    for (const [, solution] of this.cache) {
      if (
        (solution.errorPattern.includes(errorPattern) ||
          errorPattern.includes(solution.errorPattern) ||
          solution.errorPattern.split(' ').some(word => errorPattern.includes(word))) &&
        solution.toolName === toolName
      ) {
        this.recordUsage(solution.id);
        return solution;
      }
    }

    // Match by task type if provided
    if (taskType) {
      for (const [, solution] of this.cache) {
        if (solution.taskType === taskType && solution.successRate > 0.8) {
          this.recordUsage(solution.id);
          return solution;
        }
      }
    }

    return null;
  }

  /**
   * Store a solution for an error pattern
   */
  storeSolution(
    errorPattern: string,
    toolName: string,
    solution: string,
    recoveryStrategy?: string,
    taskType?: string
  ): string {
    const id = this.generateId();

    const cached: CachedSolution = {
      id,
      errorPattern,
      toolName,
      solution,
      recoveryStrategy,
      successRate: 0.5, // Start with 50% confidence
      usageCount: 0,
      lastUsed: Date.now(),
      taskType,
    };

    // Check if cache is at max size, remove LRU if needed
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(id, cached);
    this.persistToStorage();

    return id;
  }

  /**
   * Update success rate of a solution
   */
  updateSuccessRate(id: string, success: boolean): void {
    const solution = this.cache.get(id);
    if (!solution) {
      return;
    }

    const newCount = solution.usageCount + 1;
    const currentSuccesses = Math.round(solution.successRate * solution.usageCount);
    const newSuccesses = success ? currentSuccesses + 1 : currentSuccesses;

    solution.successRate = newSuccesses / newCount;
    solution.usageCount = newCount;
    solution.lastUsed = Date.now();

    this.persistToStorage();
  }

  /**
   * Record usage of a solution (update last used timestamp)
   */
  private recordUsage(id: string): void {
    const solution = this.cache.get(id);
    if (solution) {
      solution.lastUsed = Date.now();
    }
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, solution] of this.cache) {
      if (solution.lastUsed < oldestTime) {
        oldestTime = solution.lastUsed;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.cache.delete(oldestId);
    }
  }

  /**
   * Get all cached solutions
   */
  getAllSolutions(): CachedSolution[] {
    return Array.from(this.cache.values()).sort(
      (a, b) => b.successRate - a.successRate
    );
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    avgSuccessRate: number;
    totalUsages: number;
  } {
    const solutions = Array.from(this.cache.values());
    const avgSuccessRate =
      solutions.length > 0
        ? solutions.reduce((sum, s) => sum + s.successRate, 0) /
        solutions.length
        : 0;
    const totalUsages = solutions.reduce((sum, s) => sum + s.usageCount, 0);

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      avgSuccessRate,
      totalUsages,
    };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.persistToStorage();
  }

  private generateId(): string {
    return `solution_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private persistToStorage(): void {
    try {
      const data = JSON.stringify(Array.from(this.cache.values()));
      // In a real implementation, this would persist to VS Code settings or file
      // For now, we'll just keep it in memory
      // localStorage.setItem(this.persistenceKey, data);
    } catch (err) {
      console.error('Failed to persist solution cache:', err);
    }
  }

  private loadFromStorage(): void {
    try {
      // In a real implementation, this would load from VS Code settings or file
      // const data = localStorage.getItem(this.persistenceKey);
      // if (data) {
      //   const solutions: CachedSolution[] = JSON.parse(data);
      //   solutions.forEach(s => this.cache.set(s.id, s));
      // }
    } catch (err) {
      console.error('Failed to load solution cache:', err);
    }
  }
}
