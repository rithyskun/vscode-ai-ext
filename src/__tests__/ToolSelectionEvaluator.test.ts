// src/__tests__/ToolSelectionEvaluator.test.ts
// Unit tests for ToolSelectionEvaluator

import { ToolSelectionEvaluator } from '../core/ToolSelectionEvaluator';
import { PlanningService } from '../core/PlanningService';

describe('ToolSelectionEvaluator', () => {
  let evaluator: ToolSelectionEvaluator;
  let planningService: PlanningService;

  beforeEach(() => {
    evaluator = ToolSelectionEvaluator.getInstance();
    planningService = PlanningService.getInstance();
  });

  describe('Tool Evaluation for Steps', () => {
    it('should score tools for a create step', async () => {
      const plan = await planningService.createPlan('Create a new file', '');
      const createStep = plan.steps.find(s => s.expectedTools.includes('write_file'));

      if (createStep) {
        const scores = evaluator.evaluateToolsForStep(createStep);
        expect(scores.length).toBeGreaterThan(0);
        
        const writeScore = scores.find(s => s.toolName === 'write_file');
        expect(writeScore).toBeTruthy();
        expect(writeScore?.relevanceScore).toBeGreaterThan(0.5);
      }
    });

    it('should score tools for an edit step', async () => {
      const plan = await planningService.createPlan('Edit the file', '');
      const editStep = plan.steps.find(s => s.expectedTools.includes('edit_file'));

      if (editStep) {
        const scores = evaluator.evaluateToolsForStep(editStep);
        const editScore = scores.find(s => s.toolName === 'edit_file');
        expect(editScore?.relevanceScore).toBeGreaterThan(0.5);
      }
    });
  });

  describe('Recommended Tools', () => {
    it('should get recommended tools for a step', async () => {
      const plan = await planningService.createPlan('Create a new file', '');
      const step = plan.steps[0];
      
      const recommended = evaluator.getRecommendedToolsForStep(step, 3);
      expect(Array.isArray(recommended)).toBe(true);
      recommended.forEach(score => {
        expect(['strongly_recommended', 'recommended']).toContain(score.recommendationLevel);
      });
    });
  });

  describe('Task Type Evaluation', () => {
    it('should evaluate tools for create task', () => {
      const scores = evaluator.evaluateToolsForTaskType('create', {});
      const createTools = scores.filter(s => 
        s.toolName === 'write_file' || s.toolName === 'create_directory'
      );
      expect(createTools.some(t => t.relevanceScore > 0.5)).toBe(true);
    });

    it('should evaluate tools for edit task', () => {
      const scores = evaluator.evaluateToolsForTaskType('edit', {});
      const editTools = scores.filter(s => s.toolName === 'edit_file' || s.toolName === 'read_file');
      expect(editTools.some(t => t.relevanceScore > 0.5)).toBe(true);
    });

    it('should evaluate tools for search task', () => {
      const scores = evaluator.evaluateToolsForTaskType('search', {});
      const searchTools = scores.filter(s => s.toolName === 'search_files');
      expect(searchTools.some(t => t.relevanceScore > 0.5)).toBe(true);
    });

    it('should lower score for destructive tools in analysis', () => {
      const scores = evaluator.evaluateToolsForTaskType('analysis', {});
      const writeScore = scores.find(s => s.toolName === 'write_file');
      expect(writeScore?.relevanceScore).toBeLessThan(0.3);
    });
  });

  describe('Alignment Checking', () => {
    it('should detect aligned tool calls', async () => {
      const plan = await planningService.createPlan('Create a new file', '');
      const createStep = plan.steps[0];
      
      const isAligned = evaluator.isToolCallAlignedWithStep('write_file', createStep);
      expect(isAligned).toBe(true);
    });

    it('should detect misaligned tool calls', async () => {
      const plan = await planningService.createPlan('Create a new file', '');
      const createStep = plan.steps[0];
      
      const isAligned = evaluator.isToolCallAlignedWithStep('delete_file', createStep);
      expect(isAligned).toBe(false);
    });
  });

  describe('Deviation Warnings', () => {
    it('should warn about unexpected tools', async () => {
      const plan = await planningService.createPlan('Create a new file', '');
      const createStep = plan.steps[0];
      
      const warning = evaluator.getDeviationWarning('run_terminal', createStep);
      expect(warning).toBeTruthy();
      expect(warning).toContain('not expected');
    });
  });
});
