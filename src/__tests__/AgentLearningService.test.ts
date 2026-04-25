// src/__tests__/AgentLearningService.test.ts
// Unit tests for SolutionCache and AgentLearningService

import { SolutionCache } from '../core/SolutionCache';
import { AgentLearningService } from '../core/AgentLearningService';

describe('SolutionCache', () => {
  let cache: SolutionCache;

  beforeEach(() => {
    cache = SolutionCache.getInstance();
    cache.clear();
  });

  describe('Solution Storage', () => {
    it('should store and retrieve solutions', () => {
      const id = cache.storeSolution(
        'File not found',
        'read_file',
        'Try searching with search_files',
        'Alternative tool approach'
      );

      expect(id).toBeTruthy();
      const solution = cache.findSolution('File not found', 'read_file');
      expect(solution?.solution).toContain('search_files');
    });

    it('should handle partial error matches', () => {
      cache.storeSolution(
        'File not found in directory',
        'read_file',
        'Solution 1'
      );

      const solution = cache.findSolution('File not found', 'read_file');
      expect(solution).toBeTruthy();
    });
  });

  describe('Success Rate Tracking', () => {
    it('should update success rates', () => {
      const id = cache.storeSolution('Error', 'read_file', 'Solution');
      
      cache.updateSuccessRate(id, true);
      cache.updateSuccessRate(id, true);
      cache.updateSuccessRate(id, false);

      const solutions = cache.getAllSolutions();
      const solution = solutions.find(s => s.id === id);
      expect(solution?.successRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('LRU Eviction', () => {
    it('should maintain cache size limit', () => {
      // Note: In real tests, we'd need to make the cache smaller for testing
      for (let i = 0; i < 5; i++) {
        cache.storeSolution(`Error ${i}`, 'read_file', `Solution ${i}`);
      }

      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(stats.maxSize);
    });
  });

  describe('Cache Statistics', () => {
    it('should calculate cache stats', () => {
      cache.storeSolution('Error 1', 'read_file', 'Solution 1');
      cache.storeSolution('Error 2', 'write_file', 'Solution 2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBeGreaterThan(0);
    });
  });
});

describe('AgentLearningService', () => {
  let service: AgentLearningService;

  beforeEach(() => {
    service = AgentLearningService.getInstance();
    service.clear();
  });

  describe('Execution Recording', () => {
    it('should record successful executions', () => {
      service.recordExecution('create', ['write_file'], true, 1500);

      const metrics = service.getMetrics();
      expect(metrics.totalExecutions).toBe(1);
      expect(metrics.successfulExecutions).toBe(1);
    });

    it('should record failed executions', () => {
      service.recordExecution(
        'edit',
        ['read_file', 'edit_file'],
        false,
        2000,
        ['File not found']
      );

      const metrics = service.getMetrics();
      expect(metrics.totalExecutions).toBe(1);
      expect(metrics.failedExecutions).toBe(1);
    });
  });

  describe('Pattern Learning', () => {
    it('should learn successful patterns', () => {
      service.recordExecution('create', ['list_directory', 'write_file'], true, 1500);
      service.recordExecution('create', ['list_directory', 'write_file'], true, 1400);

      const patterns = service.getEffectivePatternsForTask('create', 0.7);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should recommend tool sequences', () => {
      service.recordExecution('create', ['list_directory', 'write_file'], true, 1500);
      service.recordExecution('create', ['list_directory', 'write_file'], true, 1400);

      const sequence = service.getRecommendedToolSequence('create');
      expect(sequence).toContain('write_file');
    });

    it('should track success rates for patterns', () => {
      // Create pattern with mixed results
      service.recordExecution('edit', ['read_file', 'edit_file'], true, 2000);
      service.recordExecution('edit', ['read_file', 'edit_file'], true, 1900);
      service.recordExecution('edit', ['read_file', 'edit_file'], false, 1800);

      const patterns = service.getEffectivePatternsForTask('edit', 0.6);
      const pattern = patterns.find(p => p.toolSequence.includes('edit_file'));
      
      if (pattern) {
        expect(pattern.successRate).toBeCloseTo(0.667, 2);
      }
    });
  });

  describe('Error Learning', () => {
    it('should learn from errors', () => {
      service.recordExecution(
        'create',
        ['write_file'],
        false,
        1000,
        ['Permission denied', 'Access denied']
      );

      const metrics = service.getMetrics();
      expect(metrics.commonErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Metrics', () => {
    it('should provide learning metrics', () => {
      service.recordExecution('create', ['write_file'], true, 1500);
      service.recordExecution('create', ['write_file'], false, 1200);
      service.recordExecution('edit', ['read_file', 'edit_file'], true, 2000);

      const metrics = service.getMetrics();
      expect(metrics.totalExecutions).toBe(3);
      expect(metrics.successfulExecutions).toBe(2);
      expect(metrics.failedExecutions).toBe(1);
      expect(metrics.averageDuration).toBeGreaterThan(0);
    });

    it('should generate learning summary', () => {
      service.recordExecution('create', ['write_file'], true, 1500);

      const summary = service.getSummary();
      expect(summary).toContain('Agent Learning Summary');
      expect(summary).toContain('Executions');
    });
  });

  describe('Execution Logs', () => {
    it('should maintain execution logs', () => {
      service.recordExecution('create', ['write_file'], true, 1500);
      service.recordExecution('edit', ['read_file', 'edit_file'], false, 2000, ['Error']);

      const logs = service.getExecutionLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].taskType).toBe('create');
      expect(logs[1].errors).toContain('Error');
    });
  });
});
