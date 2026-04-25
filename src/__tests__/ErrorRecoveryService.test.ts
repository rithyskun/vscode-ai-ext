// src/__tests__/ErrorRecoveryService.test.ts
// Unit tests for ErrorRecoveryService

import { ErrorRecoveryService } from '../core/ErrorRecoveryService';

describe('ErrorRecoveryService', () => {
  let service: ErrorRecoveryService;

  beforeEach(() => {
    service = ErrorRecoveryService.getInstance();
  });

  describe('Error Classification', () => {
    it('should classify permission errors', () => {
      const strategies = service.getRecoveryStrategies('permission_denied', 'Permission denied');
      expect(strategies.length).toBeGreaterThan(0);
      expect(strategies[0].action).toMatch(/retry|manual_help/);
    });

    it('should classify file not found errors', () => {
      const strategies = service.getRecoveryStrategies('file_not_found', 'File not found');
      expect(strategies.length).toBeGreaterThan(0);
      expect(strategies.some(s => s.suggestedToolName === 'search_files')).toBe(true);
    });

    it('should classify invalid format errors', () => {
      const strategies = service.getRecoveryStrategies('invalid_format', 'Invalid JSON');
      expect(strategies.length).toBeGreaterThan(0);
    });

    it('should classify runtime errors', () => {
      const strategies = service.getRecoveryStrategies('runtime_error', 'Process failed');
      expect(strategies.length).toBeGreaterThan(0);
    });
  });

  describe('Strategy Selection', () => {
    it('should get best strategy', () => {
      const strategy = service.getBestStrategy('file_not_found', 'File not found');
      expect(strategy).toBeTruthy();
      expect(strategy?.action).toMatch(/retry|alternative_tool|manual_help/);
    });

    it('should filter untried strategies', () => {
      const untried = service.getUntriedStrategies('read_file', 'File not found', []);
      expect(untried.length).toBeGreaterThan(0);
    });

    it('should exclude tried strategies', () => {
      const strategies = service.getRecoveryStrategies('file_not_found', 'File not found');
      const firstId = strategies[0]?.id;
      
      const untried = service.getUntriedStrategies('read_file', 'File not found', [firstId]);
      expect(untried.every(s => s.id !== firstId)).toBe(true);
    });
  });

  describe('Recovery Tracking', () => {
    it('should record recovery attempts', () => {
      service.recordRecoveryAttempt('read_file', 'File not found', 'strategy_1', true);
      service.recordRecoveryAttempt('read_file', 'File not found', 'strategy_1', false);

      const history = service.getRecoveryHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should calculate strategy success rates', () => {
      service.recordRecoveryAttempt('read_file', 'File not found', 'test_strategy', true);
      service.recordRecoveryAttempt('read_file', 'File not found', 'test_strategy', true);
      service.recordRecoveryAttempt('read_file', 'File not found', 'test_strategy', false);

      const rate = service.getStrategySuccessRate('test_strategy');
      expect(rate.total).toBe(3);
      expect(rate.success).toBe(2);
      expect(rate.rate).toBeCloseTo(0.667, 2);
    });
  });

  describe('Error Severity', () => {
    it('should determine error severity', () => {
      expect(service.getErrorSeverity('permission_denied')).toBe('critical');
      expect(service.getErrorSeverity('file_not_found')).toBe('warning');
      expect(service.getErrorSeverity('unknown')).toBe('info');
    });
  });

  describe('Formatting', () => {
    it('should format strategy for display', () => {
      const strategies = service.getRecoveryStrategies('file_not_found', 'File not found');
      if (strategies.length > 0) {
        const formatted = service.formatStrategy(strategies[0]);
        expect(formatted).toContain(strategies[0].name);
        expect(formatted).toContain(strategies[0].description);
        expect(formatted).toContain('Instructions:');
      }
    });
  });
});
