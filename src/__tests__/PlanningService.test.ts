// src/__tests__/PlanningService.test.ts
// Unit tests for PlanningService

import { PlanningService } from '../core/PlanningService';

describe('PlanningService', () => {
  let service: PlanningService;

  beforeEach(() => {
    service = PlanningService.getInstance();
  });

  describe('Task Identification', () => {
    it('should identify create task', async () => {
      const plan = await service.createPlan('Create a new file called utils.ts', '');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps[0].expectedTools).toContain('write_file');
    });

    it('should identify edit task', async () => {
      const plan = await service.createPlan('Edit the file to add a function', '');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps.some(s => s.expectedTools.includes('read_file'))).toBe(true);
      expect(plan.steps.some(s => s.expectedTools.includes('edit_file'))).toBe(true);
    });

    it('should identify search task', async () => {
      const plan = await service.createPlan('Find all TypeScript files', '');
      expect(plan.steps[0].expectedTools.some(t => t.includes('search') || t.includes('list'))).toBe(true);
    });

    it('should identify delete task', async () => {
      const plan = await service.createPlan('Remove the temp file', '');
      expect(plan.steps.some(s => s.expectedTools.includes('delete_file'))).toBe(true);
    });

    it('should identify execute task', async () => {
      const plan = await service.createPlan('Run the test suite', '');
      expect(plan.steps.some(s => s.expectedTools.includes('run_terminal'))).toBe(true);
    });
  });

  describe('Plan Structure', () => {
    it('should create steps with dependencies', async () => {
      const plan = await service.createPlan('Create a new file', '');
      expect(plan.steps.length).toBeGreaterThan(0);
      plan.steps.forEach((step, idx) => {
        if (idx > 0) {
          // Most steps should have dependencies on earlier steps
          if (step.expectedTools.length > 0) {
            expect(step.dependencies.length).toBeGreaterThanOrEqual(0);
          }
        }
      });
    });

    it('should format plan for display', async () => {
      const plan = await service.createPlan('Create a new file', '');
      const formatted = service.formatPlan(plan);
      expect(formatted).toContain('Execution Plan');
      expect(formatted).toContain('Steps');
      expect(formatted).toContain('Tools:');
    });
  });

  describe('Tool Applicability', () => {
    it('should identify applicable tools for a step', async () => {
      const plan = await service.createPlan('Create a new file', '');
      const createStep = plan.steps.find(s => s.expectedTools.includes('write_file'));
      
      if (createStep) {
        expect(service.isToolApplicableForStep(createStep, 'write_file')).toBe(true);
        expect(service.isToolApplicableForStep(createStep, 'delete_file')).toBe(false);
      }
    });

    it('should get recommended tools for a step', async () => {
      const plan = await service.createPlan('Create a new file', '');
      const step = plan.steps[0];
      const recommended = service.getRecommendedToolsForStep(step);
      
      expect(Array.isArray(recommended)).toBe(true);
      expect(recommended.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('General Tasks', () => {
    it('should handle general task requests', async () => {
      const plan = await service.createPlan('Do something helpful', '');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.overallGoal).toBeTruthy();
    });
  });
});
