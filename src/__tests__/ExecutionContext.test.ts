// src/__tests__/ExecutionContext.test.ts
// Unit tests for ExecutionContext

import { ExecutionContext } from '../core/ExecutionContext';

describe('ExecutionContext', () => {
  let context: ExecutionContext;

  beforeEach(() => {
    context = new ExecutionContext(15);
  });

  describe('Tool Execution Recording', () => {
    it('should record successful tool execution', () => {
      context.recordToolExecution('read_file', { filePath: 'test.ts' }, 'file content', 1000);

      const history = context.getToolExecutionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].toolName).toBe('read_file');
      expect(history[0].success).toBe(true);
      expect(history[0].duration).toBe(1000);
    });

    it('should record failed tool execution', () => {
      const error = 'File not found';
      context.recordToolExecution('read_file', { filePath: 'missing.ts' }, error, 500, error);

      const history = context.getToolExecutionHistory();
      expect(history[0].success).toBe(false);
      expect(history[0].error).toBe(error);
    });

    it('should return last tool result', () => {
      context.recordToolExecution('read_file', {}, 'first', 100);
      context.recordToolExecution('write_file', {}, 'second', 200);

      const last = context.getLastToolResult();
      expect(last?.toolName).toBe('write_file');
      expect(last?.result).toBe('second');
    });
  });

  describe('Error Recording', () => {
    it('should record different error types', () => {
      context.recordError('read_file', 'file_not_found', 'File X not found');
      context.recordError('write_file', 'permission_denied', 'Access denied');

      const errors = context.getErrors();
      expect(errors).toHaveLength(2);
      expect(errors[0].errorType).toBe('file_not_found');
      expect(errors[1].errorType).toBe('permission_denied');
    });

    it('should increment attempts for repeated errors', () => {
      context.recordError('read_file', 'file_not_found', 'File not found');
      context.recordError('read_file', 'file_not_found', 'File not found');

      const errors = context.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].attempts).toBe(2);
    });
  });

  describe('File Modification Tracking', () => {
    it('should track modified files', () => {
      context.recordFileModification('/path/to/file1.ts');
      context.recordFileModification('/path/to/file2.ts');

      const files = context.getFilesModified();
      expect(files).toHaveLength(2);
      expect(files).toContain('/path/to/file1.ts');
    });

    it('should not duplicate files', () => {
      context.recordFileModification('/path/to/file.ts');
      context.recordFileModification('/path/to/file.ts');

      const files = context.getFilesModified();
      expect(files).toHaveLength(1);
    });
  });

  describe('Iteration Tracking', () => {
    it('should track iteration count', () => {
      expect(context.getIterationCount()).toBe(0);
      context.incrementIterationCount();
      expect(context.getIterationCount()).toBe(1);
    });

    it('should detect max iterations reached', () => {
      const smallContext = new ExecutionContext(3);
      expect(smallContext.isMaxIterationsReached()).toBe(false);
      smallContext.incrementIterationCount();
      smallContext.incrementIterationCount();
      smallContext.incrementIterationCount();
      expect(smallContext.isMaxIterationsReached()).toBe(true);
    });
  });

  describe('Summary and Context', () => {
    it('should generate execution summary', () => {
      context.recordToolExecution('read_file', {}, 'content', 100);
      context.recordToolExecution('write_file', {}, 'ok', 200);
      context.recordFileModification('file.ts');

      const summary = context.getExecutionSummary();
      expect(summary).toContain('2 tools executed');
      expect(summary).toContain('1 files modified');
    });

    it('should provide suggested context', () => {
      context.recordToolExecution('read_file', {}, 'content', 100);
      context.recordError('write_file', 'permission_denied', 'Access denied');

      const suggContext = context.getSuggestedContext();
      expect(suggContext).toContain('read_file');
      expect(suggContext).toContain('permission_denied');
    });
  });
});
