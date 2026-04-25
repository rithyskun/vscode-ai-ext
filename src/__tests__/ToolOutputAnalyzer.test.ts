// src/__tests__/ToolOutputAnalyzer.test.ts
// Unit tests for ToolOutputAnalyzer

import { ToolOutputAnalyzer } from '../core/ToolOutputAnalyzer';

describe('ToolOutputAnalyzer', () => {
  let analyzer: ToolOutputAnalyzer;

  beforeEach(() => {
    analyzer = ToolOutputAnalyzer.getInstance();
  });

  describe('Error Detection', () => {
    it('should detect error output', () => {
      const analysis = analyzer.analyzeOutput('read_file', 'Error: File not found');
      expect(analysis.success).toBe(false);
      expect(analysis.confidence).toBeGreaterThan(0.8);
    });

    it('should detect success output', () => {
      const analysis = analyzer.analyzeOutput('read_file', 'function foo() { return 42; }');
      expect(analysis.success).toBe(true);
      expect(analysis.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Tool-Specific Analysis', () => {
    it('should analyze read_file output', () => {
      const output = 'const x = 1;\nconst y = 2;';
      const analysis = analyzer.analyzeOutput('read_file', output);
      
      expect(analysis.success).toBe(true);
      expect(analysis.extractedData?.fileSize).toBe(output.length);
      expect(analysis.extractedData?.lineCount).toBe(2);
    });

    it('should analyze write_file output', () => {
      const analysis = analyzer.analyzeOutput('write_file', 'File written successfully');
      expect(analysis.success).toBe(true);
    });

    it('should analyze search_files output', () => {
      const output = 'src/index.ts\nsrc/utils.ts\nsrc/config.ts';
      const analysis = analyzer.analyzeOutput('search_files', output);
      
      expect(analysis.success).toBe(true);
      expect(analysis.extractedData?.resultCount).toBe(3);
    });

    it('should handle empty search results', () => {
      const analysis = analyzer.analyzeOutput('search_files', '');
      expect(analysis.success).toBe(true);
      expect(analysis.suggestedNextStep).toContain('broader');
    });

    it('should analyze list_directory output', () => {
      const output = 'file1.ts\nfile2.ts\ndirectory/';
      const analysis = analyzer.analyzeOutput('list_directory', output);
      
      expect(analysis.success).toBe(true);
      expect(analysis.extractedData?.files).toBe(2);
      expect(analysis.extractedData?.directories).toBe(1);
    });

    it('should analyze terminal output', () => {
      const output = 'Tests passed: 42/42';
      const analysis = analyzer.analyzeOutput('run_terminal', output);
      expect(analysis.success).toBe(true);
    });
  });

  describe('Expected Outcome Matching', () => {
    it('should match success outcomes', () => {
      const matches = analyzer.matchesExpectedOutcome('Operation completed successfully', 'success');
      expect(matches).toBe(true);
    });

    it('should match data presence', () => {
      const output = 'long content with data';
      const matches = analyzer.matchesExpectedOutcome(output, 'data');
      expect(matches).toBe(true);
    });

    it('should detect mismatched outcomes', () => {
      const matches = analyzer.matchesExpectedOutcome('Something failed', 'success');
      expect(matches).toBe(false);
    });
  });

  describe('Next Action Suggestions', () => {
    it('should suggest next actions after read', () => {
      const suggestion = analyzer.suggestNextAction('read_file', 'file content', 'reading');
      expect(suggestion).toBeTruthy();
    });

    it('should suggest retry for search with no results', () => {
      const suggestion = analyzer.suggestNextAction('search_files', '', 'searching');
      expect(suggestion).toContain('broader');
    });
  });
});
