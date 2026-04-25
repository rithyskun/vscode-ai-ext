// src/core/ToolOutputAnalyzer.ts
// Analyzes tool output to detect success, partial success, or failure patterns

export interface OutputAnalysis {
  success: boolean;
  confidence: number; // 0-1
  analysis: string;
  suggestedNextStep?: string;
  extractedData?: Record<string, unknown>;
}

export class ToolOutputAnalyzer {
  private static instance: ToolOutputAnalyzer;

  private constructor() {}

  static getInstance(): ToolOutputAnalyzer {
    if (!ToolOutputAnalyzer.instance) {
      ToolOutputAnalyzer.instance = new ToolOutputAnalyzer();
    }
    return ToolOutputAnalyzer.instance;
  }

  /**
   * Analyze the output of a tool execution
   */
  analyzeOutput(
    toolName: string,
    output: string,
    expectedOutcome?: string
  ): OutputAnalysis {
    // Check for error indicators
    if (this.isErrorOutput(output)) {
      return {
        success: false,
        confidence: 0.95,
        analysis: `Tool '${toolName}' failed with error`,
        suggestedNextStep: 'Apply error recovery strategy',
      };
    }

    // Tool-specific analysis
    switch (toolName) {
      case 'read_file':
        return this.analyzeReadFileOutput(output);
      case 'write_file':
        return this.analyzeWriteFileOutput(output);
      case 'edit_file':
        return this.analyzeEditFileOutput(output);
      case 'delete_file':
        return this.analyzeDeleteFileOutput(output);
      case 'list_directory':
        return this.analyzeListDirectoryOutput(output);
      case 'search_files':
        return this.analyzeSearchFilesOutput(output);
      case 'run_terminal':
        return this.analyzeTerminalOutput(output);
      default:
        return this.analyzeGenericOutput(output);
    }
  }

  private isErrorOutput(output: string): boolean {
    const lower = output.toLowerCase();
    return (
      lower.startsWith('error') ||
      lower.includes('error:') ||
      lower.includes('failed') ||
      lower.includes('permission denied')
    );
  }

  private analyzeReadFileOutput(output: string): OutputAnalysis {
    if (this.isErrorOutput(output)) {
      return {
        success: false,
        confidence: 0.9,
        analysis: 'Failed to read file',
        suggestedNextStep: 'Check if file exists using list_directory',
      };
    }

    if (output.length === 0) {
      return {
        success: true,
        confidence: 0.8,
        analysis: 'File read successfully but appears to be empty',
        suggestedNextStep: 'Verify if empty file is expected',
      };
    }

    return {
      success: true,
      confidence: 0.95,
      analysis: `File read successfully (${output.length} characters)`,
      extractedData: {
        fileSize: output.length,
        lineCount: output.split('\n').length,
        preview: output.substring(0, 100),
      },
    };
  }

  private analyzeWriteFileOutput(output: string): OutputAnalysis {
    if (this.isErrorOutput(output)) {
      return {
        success: false,
        confidence: 0.9,
        analysis: 'Failed to write file',
        suggestedNextStep: 'Check directory exists and permissions',
      };
    }

    if (
      output.toLowerCase().includes('created') ||
      output.toLowerCase().includes('written')
    ) {
      return {
        success: true,
        confidence: 0.95,
        analysis: 'File written/created successfully',
      };
    }

    return {
      success: true,
      confidence: 0.8,
      analysis: 'File write operation completed',
    };
  }

  private analyzeEditFileOutput(output: string): OutputAnalysis {
    if (this.isErrorOutput(output)) {
      return {
        success: false,
        confidence: 0.9,
        analysis: 'Failed to edit file',
        suggestedNextStep: 'Verify exact text to replace matches the file content',
      };
    }

    if (
      output.toLowerCase().includes('replaced') ||
      output.toLowerCase().includes('modified')
    ) {
      return {
        success: true,
        confidence: 0.95,
        analysis: 'File edited successfully',
      };
    }

    return {
      success: true,
      confidence: 0.8,
      analysis: 'File edit operation completed',
    };
  }

  private analyzeDeleteFileOutput(output: string): OutputAnalysis {
    if (this.isErrorOutput(output)) {
      return {
        success: false,
        confidence: 0.9,
        analysis: 'Failed to delete file',
        suggestedNextStep: 'Verify file exists and is not in use',
      };
    }

    if (output.toLowerCase().includes('deleted')) {
      return {
        success: true,
        confidence: 0.95,
        analysis: 'File deleted successfully',
      };
    }

    return {
      success: true,
      confidence: 0.8,
      analysis: 'Delete operation completed',
    };
  }

  private analyzeListDirectoryOutput(output: string): OutputAnalysis {
    if (this.isErrorOutput(output)) {
      return {
        success: false,
        confidence: 0.9,
        analysis: 'Failed to list directory',
        suggestedNextStep: 'Verify directory path is correct',
      };
    }

    const items = output.split('\n').filter(l => l.trim());
    const fileCount = items.filter(l => !l.includes('/')).length;
    const dirCount = items.filter(l => l.includes('/')).length;

    return {
      success: true,
      confidence: 0.95,
      analysis: `Listed directory: ${fileCount} files, ${dirCount} directories`,
      extractedData: {
        items: items.length,
        files: fileCount,
        directories: dirCount,
      },
    };
  }

  private analyzeSearchFilesOutput(output: string): OutputAnalysis {
    if (this.isErrorOutput(output)) {
      return {
        success: false,
        confidence: 0.9,
        analysis: 'Search failed',
        suggestedNextStep: 'Verify search pattern is correct',
      };
    }

    const results = output.split('\n').filter(l => l.trim());

    if (results.length === 0) {
      return {
        success: true,
        confidence: 0.9,
        analysis: 'Search completed with no results',
        suggestedNextStep: 'Try a broader search pattern or adjust keywords',
        extractedData: {
          resultCount: 0,
          results: [],
        },
      };
    }

    return {
      success: true,
      confidence: 0.95,
      analysis: `Found ${results.length} matching items`,
      extractedData: {
        resultCount: results.length,
        results: results.slice(0, 10),
      },
    };
  }

  private analyzeTerminalOutput(output: string): OutputAnalysis {
    if (this.isErrorOutput(output)) {
      return {
        success: false,
        confidence: 0.8,
        analysis: 'Terminal command failed or produced error output',
        suggestedNextStep: 'Review command syntax and environment',
      };
    }

    if (output.length === 0) {
      return {
        success: true,
        confidence: 0.7,
        analysis: 'Command executed (no output)',
        suggestedNextStep: 'Verify command executed as expected',
      };
    }

    return {
      success: true,
      confidence: 0.85,
      analysis: `Command executed and produced output (${output.length} chars)`,
      extractedData: {
        outputLength: output.length,
        lines: output.split('\n').length,
      },
    };
  }

  private analyzeGenericOutput(output: string): OutputAnalysis {
    if (this.isErrorOutput(output)) {
      return {
        success: false,
        confidence: 0.8,
        analysis: 'Tool execution resulted in error',
        suggestedNextStep: 'Review error message and retry',
      };
    }

    return {
      success: true,
      confidence: 0.7,
      analysis: 'Tool executed successfully',
    };
  }

  /**
   * Compare output with expected outcome
   */
  matchesExpectedOutcome(output: string, expectedOutcome: string): boolean {
    const lower = output.toLowerCase();
    const expectedLower = expectedOutcome.toLowerCase();

    // Check for exact match
    if (lower.includes(expectedLower)) {
      return true;
    }

    // Check for success indicators
    if (
      expectedOutcome.includes('success') &&
      (lower.includes('success') ||
        lower.includes('completed') ||
        lower.includes('done'))
    ) {
      return true;
    }

    // Check for data presence
    if (
      expectedOutcome.includes('data') &&
      output.length > 10
    ) {
      return true;
    }

    return false;
  }

  /**
   * Suggest next action based on output analysis
   */
  suggestNextAction(
    toolName: string,
    output: string,
    currentStep: string
  ): string | null {
    const analysis = this.analyzeOutput(toolName, output);

    if (!analysis.success) {
      return `Error detected. ${analysis.suggestedNextStep || 'Apply recovery strategy'}`;
    }

    // Suggest based on tool and current step
    if (toolName === 'search_files' && analysis.extractedData?.resultCount === 0) {
      return 'No results found. Try a broader search pattern or list the directory.';
    }

    if (toolName === 'read_file') {
      return 'File read successfully. You can now modify it if needed.';
    }

    if (toolName === 'list_directory') {
      return 'Directory listed. You can now select files to read or modify.';
    }

    return analysis.suggestedNextStep || null;
  }
}
