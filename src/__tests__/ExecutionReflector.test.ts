// src/__tests__/ExecutionReflector.test.ts
// Unit tests for ExecutionReflector

import { ExecutionReflector } from '../core/ExecutionReflector';
import { ExecutionContext } from '../core/ExecutionContext';
import { PlanExecutionTracker } from '../core/PlanExecutionTracker';
import { PlanningService } from '../core/PlanningService';

describe('ExecutionReflector', () => {
  let reflector: ExecutionReflector;
  let context: ExecutionContext;
  let planTracker: PlanExecutionTracker;

  beforeEach(async () => {
    reflector = ExecutionReflector.getInstance();
    context = new ExecutionContext(15);
    
    const planningService = PlanningService.getInstance();
    const plan = await planningService.createPlan('Create a new file', '');
    planTracker = new PlanExecutionTracker(plan.steps);
  });

  describe('Reflection Checkpoints', () => {
    it('should trigger reflection at intervals', () => {
      reflector.setReflectionInterval(3);
      
      expect(reflector.shouldReflect(0)).toBe(false);
      expect(reflector.shouldReflect(3)).toBe(true);
      expect(reflector.shouldReflect(6)).toBe(true);
    });

    it('should allow interval customization', () => {
      reflector.setReflectionInterval(5);
      expect(reflector.shouldReflect(5)).toBe(true);
      expect(reflector.shouldReflect(10)).toBe(true);
    });
  });

  describe('Reflection Analysis', () => {
    it('should reflect on execution progress', () => {
      context.recordToolExecution('read_file', {}, 'content', 100);
      context.recordToolExecution('write_file', {}, 'ok', 200);

      const reflection = reflector.reflect(context, planTracker, 'Create a new file');
      
      expect(reflection.shouldContinue).toBe(true);
      expect(reflection.suggestions.length).toBeGreaterThan(0);
      expect(reflection.confidence).toBeGreaterThan(0);
    });

    it('should detect excessive errors', () => {
      context.recordError('read_file', 'file_not_found', 'File not found');
      context.recordError('read_file', 'file_not_found', 'File not found');
      context.recordError('write_file', 'permission_denied', 'Access denied');

      const reflection = reflector.reflect(context, planTracker, 'Create a file');
      
      expect(reflection.suggestions.length).toBeGreaterThan(0);
    });

    it('should format reflection for display', () => {
      context.recordToolExecution('read_file', {}, 'content', 100);
      const reflection = reflector.reflect(context, planTracker, 'Create file');
      
      const formatted = reflector.formatReflection(reflection);
      expect(formatted).toContain('Execution Reflection');
      expect(formatted).toContain('Observations:');
    });
  });

  describe('Execution Stall Detection', () => {
    it('should detect repeated tool failures', () => {
      const history = [
        { toolName: 'read_file', arguments: {}, result: 'Error', timestamp: Date.now(), success: false, duration: 100, error: 'Error' },
        { toolName: 'read_file', arguments: {}, result: 'Error', timestamp: Date.now(), success: false, duration: 100, error: 'Error' },
        { toolName: 'read_file', arguments: {}, result: 'Error', timestamp: Date.now(), success: false, duration: 100, error: 'Error' },
      ];

      const isStalled = reflector.detectExecutionStall(history, 3);
      expect(isStalled).toBe(true);
    });

    it('should not flag successful tool use as stall', () => {
      const history = [
        { toolName: 'read_file', arguments: {}, result: 'content', timestamp: Date.now(), success: true, duration: 100 },
        { toolName: 'read_file', arguments: {}, result: 'content', timestamp: Date.now(), success: true, duration: 100 },
      ];

      const isStalled = reflector.detectExecutionStall(history, 2);
      expect(isStalled).toBe(false);
    });
  });

  describe('Progress Analysis', () => {
    it('should detect write progress for create task', () => {
      context.recordToolExecution('write_file', {}, 'ok', 100);
      const history = context.getToolExecutionHistory();
      
      const progress = reflector.analyzeProgress('Create a new file', history, []);
      expect(progress.isProgressional).toBe(true);
      expect(progress.description).toContain('Creating');
    });

    it('should detect read progress for analysis task', () => {
      context.recordToolExecution('read_file', {}, 'content', 100);
      const history = context.getToolExecutionHistory();
      
      const progress = reflector.analyzeProgress('Analyze the code', history, []);
      expect(progress.isProgressional).toBe(true);
    });
  });

  describe('Stalled Recovery', () => {
    it('should provide recovery suggestions for stalled execution', () => {
      const recovery = reflector.getStalledExecutionRecovery('read_file');
      expect(recovery).toContain('stuck');
      expect(recovery).toContain('read_file');
    });
  });
});
