// src/__tests__/AgentRunner.integration.test.ts
// Integration tests for AgentRunner with all services

import { PlanningService } from '../core/PlanningService';
import { ErrorRecoveryService } from '../core/ErrorRecoveryService';
import { ToolSelectionEvaluator } from '../core/ToolSelectionEvaluator';
import { ToolOutputAnalyzer } from '../core/ToolOutputAnalyzer';
import { ExecutionReflector } from '../core/ExecutionReflector';
import { AgentLearningService } from '../core/AgentLearningService';
import { ExecutionContext } from '../core/ExecutionContext';

describe('AgentRunner Integration Tests', () => {
  let planningService: PlanningService;
  let errorRecoveryService: ErrorRecoveryService;
  let toolEvaluator: ToolSelectionEvaluator;
  let outputAnalyzer: ToolOutputAnalyzer;
  let reflector: ExecutionReflector;
  let learningService: AgentLearningService;

  beforeEach(() => {
    planningService = PlanningService.getInstance();
    errorRecoveryService = ErrorRecoveryService.getInstance();
    toolEvaluator = ToolSelectionEvaluator.getInstance();
    outputAnalyzer = ToolOutputAnalyzer.getInstance();
    reflector = ExecutionReflector.getInstance();
    learningService = AgentLearningService.getInstance();
    learningService.clear();
  });

  describe('End-to-End: Create File Task', () => {
    it('should plan and evaluate tools for file creation', async () => {
      const userMessage = 'Create a new TypeScript file named utils.ts';
      
      // Step 1: Planning
      const plan = await planningService.createPlan(userMessage, '');
      expect(plan.steps.length).toBeGreaterThan(0);
      
      // Step 2: Tool evaluation for first step
      const firstStep = plan.steps[0];
      const toolScores = toolEvaluator.evaluateToolsForStep(firstStep);
      expect(toolScores.length).toBeGreaterThan(0);
      
      // Step 3: Find write_file in recommendations
      const writeFileScore = toolScores.find(s => s.toolName === 'write_file');
      expect(writeFileScore).toBeTruthy();
      expect(writeFileScore?.relevanceScore).toBeGreaterThan(0.5);
    });

    it('should handle error recovery in file creation', () => {
      const errorMsg = 'Permission denied: cannot write to file';
      
      // Step 1: Get recovery strategies
      const strategies = errorRecoveryService.getRecoveryStrategies('permission_denied', errorMsg);
      expect(strategies.length).toBeGreaterThan(0);
      
      // Step 2: Record recovery attempt
      const bestStrategy = strategies[0];
      errorRecoveryService.recordRecoveryAttempt('write_file', errorMsg, bestStrategy.id, false);
      
      // Step 3: Check recovery history
      const history = errorRecoveryService.getRecoveryHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].toolName).toBe('write_file');
    });
  });

  describe('End-to-End: Edit File Task', () => {
    it('should plan and execute edit flow', async () => {
      const userMessage = 'Edit the file to add a new function';
      
      // Step 1: Create plan
      const plan = await planningService.createPlan(userMessage, '');
      expect(plan.steps.some(s => s.expectedTools.includes('read_file'))).toBe(true);
      expect(plan.steps.some(s => s.expectedTools.includes('edit_file'))).toBe(true);
      
      // Step 2: Simulate tool execution and output analysis
      const readOutput = 'function existing() { return 1; }';
      const readAnalysis = outputAnalyzer.analyzeOutput('read_file', readOutput);
      expect(readAnalysis.success).toBe(true);
      
      const editOutput = 'File edited successfully';
      const editAnalysis = outputAnalyzer.analyzeOutput('edit_file', editOutput);
      expect(editAnalysis.success).toBe(true);
    });
  });

  describe('End-to-End: Search Task with Learning', () => {
    it('should search, learn, and track patterns', async () => {
      const userMessage = 'Find all TypeScript test files';
      
      // Step 1: Plan
      const plan = await planningService.createPlan(userMessage, '');
      expect(plan.steps[0].expectedTools.some(t => t.includes('search'))).toBe(true);
      
      // Step 2: Simulate search execution
      const searchOutput = 'src/__tests__/file1.test.ts\nsrc/__tests__/file2.test.ts';
      const analysis = outputAnalyzer.analyzeOutput('search_files', searchOutput);
      expect(analysis.extractedData?.resultCount).toBe(2);
      
      // Step 3: Record successful execution for learning
      learningService.recordExecution('search', ['search_files'], true, 1200);
      
      // Step 4: Verify learning
      const metrics = learningService.getMetrics();
      expect(metrics.successfulExecutions).toBe(1);
    });
  });

  describe('End-to-End: Error Recovery and Learning', () => {
    it('should handle errors, recover, and learn', () => {
      const errorMessage = 'File not found: missing.ts';
      
      // Step 1: Record error
      const context = new ExecutionContext(15);
      context.recordError('read_file', 'file_not_found', errorMessage);
      
      // Step 2: Get recovery strategies
      const strategies = errorRecoveryService.getRecoveryStrategies('file_not_found', errorMessage);
      expect(strategies.length).toBeGreaterThan(0);
      
      // Step 3: Simulate recovery with alternative tool (search_files)
      const recoveryStrategy = strategies.find(s => s.suggestedToolName === 'search_files');
      expect(recoveryStrategy).toBeTruthy();
      
      // Step 4: Record recovery attempt
      if (recoveryStrategy) {
        errorRecoveryService.recordRecoveryAttempt('read_file', errorMessage, recoveryStrategy.id, true);
      }
      
      // Step 5: Learn from this error
      learningService.recordExecution('search', ['search_files'], true, 800, []);
      
      // Step 6: Verify learning
      const metrics = learningService.getMetrics();
      expect(metrics.successfulExecutions).toBe(1);
    });
  });

  describe('End-to-End: Reflection and Adaptation', () => {
    it('should reflect on progress and adapt', async () => {
      const userMessage = 'Create a complex file structure';
      const context = new ExecutionContext(15);
      
      // Simulate execution
      context.recordToolExecution('list_directory', {}, 'files...', 100);
      context.recordToolExecution('create_directory', {}, 'ok', 200);
      context.recordToolExecution('write_file', {}, 'ok', 300);
      
      // Create plan
      const plan = await planningService.createPlan(userMessage, '');
      const planTracker = new (require('../core/PlanExecutionTracker').PlanExecutionTracker)(plan.steps);
      
      // Perform reflection
      const reflection = reflector.reflect(context, planTracker, userMessage);
      expect(reflection.shouldContinue).toBe(true);
      expect(reflection.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End: Complete Task Flow', () => {
    it('should handle a complete task from planning to learning', async () => {
      const userMessage = 'Create a new configuration file';
      
      // 1. Planning
      const plan = await planningService.createPlan(userMessage, '');
      expect(plan.steps.length).toBeGreaterThan(0);
      
      // 2. Tool selection
      const toolScores = toolEvaluator.evaluateToolsForStep(plan.steps[0]);
      expect(toolScores.length).toBeGreaterThan(0);
      
      // 3. Simulate execution with tools
      const toolSequence: string[] = [];
      const context = new ExecutionContext(15);
      
      // First step: Check existing
      context.recordToolExecution('list_directory', {}, 'existing files', 100);
      toolSequence.push('list_directory');
      
      // Second step: Create file
      context.recordToolExecution('write_file', {}, 'File created', 200);
      toolSequence.push('write_file');
      
      // 4. Analyze outputs
      const output1 = outputAnalyzer.analyzeOutput('list_directory', 'existing files');
      const output2 = outputAnalyzer.analyzeOutput('write_file', 'File created');
      expect(output1.success).toBe(true);
      expect(output2.success).toBe(true);
      
      // 5. Reflection checkpoint
      const reflection = reflector.reflect(context, new (require('../core/PlanExecutionTracker').PlanExecutionTracker)(plan.steps), userMessage);
      expect(reflection.shouldContinue).toBe(true);
      
      // 6. Learn from execution
      learningService.recordExecution('create', toolSequence, true, 300);
      
      // 7. Verify learning
      const metrics = learningService.getMetrics();
      expect(metrics.totalExecutions).toBe(1);
      expect(metrics.successfulExecutions).toBe(1);
      
      const patterns = learningService.getEffectivePatternsForTask('create', 0.5);
      expect(patterns.length).toBeGreaterThan(0);
    });
  });
});
