// src/core/PlanningService.ts
// Decomposes user requests into logical executable steps before the ReAct loop

export interface ExecutionStep {
  stepIndex: number;
  description: string;
  expectedTools: string[];
  dependencies: number[];
  rationale: string;
  estimatedDuration?: number;
}

export interface ExecutionPlan {
  userRequest: string;
  steps: ExecutionStep[];
  overallGoal: string;
  estimatedTotalSteps: number;
  createdAt: number;
}

export class PlanningService {
  private static instance: PlanningService;

  private constructor() {}

  static getInstance(): PlanningService {
    if (!PlanningService.instance) {
      PlanningService.instance = new PlanningService();
    }
    return PlanningService.instance;
  }

  /**
   * Decompose a user request into structured execution steps.
   * This helps the agent understand task structure before acting.
   */
  async createPlan(
    userRequest: string,
    context: string
  ): Promise<ExecutionPlan> {
    // Parse the request to identify task patterns
    const taskType = this.identifyTaskType(userRequest);
    const steps = this.generateSteps(userRequest, taskType, context);

    return {
      userRequest,
      steps,
      overallGoal: this.extractGoal(userRequest),
      estimatedTotalSteps: steps.length,
      createdAt: Date.now(),
    };
  }

  private identifyTaskType(request: string): string {
    const lower = request.toLowerCase();

    if (
      lower.includes('create') ||
      lower.includes('new file') ||
      lower.includes('new directory')
    ) {
      return 'create';
    }
    if (
      lower.includes('edit') ||
      lower.includes('modify') ||
      lower.includes('change') ||
      lower.includes('refactor')
    ) {
      return 'edit';
    }
    if (
      lower.includes('find') ||
      lower.includes('search') ||
      lower.includes('locate') ||
      lower.includes('look for')
    ) {
      return 'search';
    }
    if (
      lower.includes('delete') ||
      lower.includes('remove') ||
      lower.includes('clean')
    ) {
      return 'delete';
    }
    if (
      lower.includes('run') ||
      lower.includes('execute') ||
      lower.includes('test') ||
      lower.includes('build')
    ) {
      return 'execute';
    }
    if (
      lower.includes('analyze') ||
      lower.includes('review') ||
      lower.includes('understand') ||
      lower.includes('explain')
    ) {
      return 'analysis';
    }

    return 'general';
  }

  private generateSteps(
    request: string,
    taskType: string,
    context: string
  ): ExecutionStep[] {
    const steps: ExecutionStep[] = [];

    switch (taskType) {
      case 'create':
        steps.push(
          {
            stepIndex: 0,
            description: 'Create the file or directory with initial content',
            expectedTools: ['write_file', 'create_directory', 'list_directory'],
            dependencies: [],
            rationale: 'Create the resource and ensure parent location is valid',
            estimatedDuration: 1500,
          },
          {
            stepIndex: 1,
            description: 'Verify the created resource and adjust structure if needed',
            expectedTools: ['list_directory', 'read_file'],
            dependencies: [0],
            rationale: 'Confirm that creation completed as requested',
            estimatedDuration: 1000,
          }
        );
        break;

      case 'edit':
        steps.push(
          {
            stepIndex: 0,
            description: 'Read the file to understand current content',
            expectedTools: ['read_file'],
            dependencies: [],
            rationale: 'Must read before editing to make precise modifications',
            estimatedDuration: 1000,
          },
          {
            stepIndex: 1,
            description: 'Analyze the content and plan modifications',
            expectedTools: [],
            dependencies: [0],
            rationale: 'Internal analysis step, no tools needed',
            estimatedDuration: 500,
          },
          {
            stepIndex: 2,
            description: 'Apply the modifications to the file',
            expectedTools: ['edit_file', 'write_file'],
            dependencies: [1],
            rationale: 'Execute the planned changes',
            estimatedDuration: 1500,
          }
        );
        break;

      case 'search':
        steps.push(
          {
            stepIndex: 0,
            description: 'Search for files or content matching the criteria',
            expectedTools: ['search_files', 'list_directory'],
            dependencies: [],
            rationale: 'Find resources matching the search criteria',
            estimatedDuration: 2000,
          },
          {
            stepIndex: 1,
            description: 'Examine search results and pick most relevant matches',
            expectedTools: ['read_file'],
            dependencies: [0],
            rationale: 'Review results to determine which are most relevant',
            estimatedDuration: 1500,
          }
        );
        break;

      case 'delete':
        steps.push(
          {
            stepIndex: 0,
            description: 'Locate the resource(s) to be deleted',
            expectedTools: ['list_directory', 'search_files'],
            dependencies: [],
            rationale: 'Ensure we are deleting the correct resource',
            estimatedDuration: 1000,
          },
          {
            stepIndex: 1,
            description: 'Delete the identified resource(s)',
            expectedTools: ['delete_file'],
            dependencies: [0],
            rationale: 'Execute the deletion with confirmation',
            estimatedDuration: 1000,
          }
        );
        break;

      case 'execute':
        steps.push(
          {
            stepIndex: 0,
            description: 'Prepare execution environment and parameters',
            expectedTools: ['list_directory', 'read_file'],
            dependencies: [],
            rationale: 'Understand what to run and how',
            estimatedDuration: 1000,
          },
          {
            stepIndex: 1,
            description: 'Execute the command or script',
            expectedTools: ['run_terminal'],
            dependencies: [0],
            rationale: 'Run the prepared command',
            estimatedDuration: 3000,
          }
        );
        break;

      case 'analysis':
        steps.push(
          {
            stepIndex: 0,
            description: 'Gather relevant information about the subject',
            expectedTools: ['read_file', 'list_directory', 'search_files'],
            dependencies: [],
            rationale: 'Collect all relevant data for analysis',
            estimatedDuration: 2000,
          },
          {
            stepIndex: 1,
            description: 'Analyze and provide insights',
            expectedTools: [],
            dependencies: [0],
            rationale: 'Internal analysis, no tools needed',
            estimatedDuration: 1000,
          }
        );
        break;

      default:
        // For general requests, use a flexible two-step approach
        steps.push(
          {
            stepIndex: 0,
            description: 'Gather necessary context and information',
            expectedTools: ['read_file', 'list_directory', 'search_files'],
            dependencies: [],
            rationale: 'Understand the request and collect relevant information',
            estimatedDuration: 2000,
          },
          {
            stepIndex: 1,
            description: 'Execute the requested action',
            expectedTools: [
              'write_file',
              'edit_file',
              'create_directory',
              'delete_file',
              'run_terminal',
            ],
            dependencies: [0],
            rationale: 'Perform the requested action based on gathered context',
            estimatedDuration: 2000,
          }
        );
        break;
    }

    return steps;
  }

  private extractGoal(request: string): string {
    // Extract a concise goal statement from the request
    const sentences = request.split(/[.!?]/).map(s => s.trim());
    return sentences[0] || request.substring(0, 100);
  }

  /**
   * Format the plan for display in chat or system prompt
   */
  formatPlan(plan: ExecutionPlan): string {
    let formatted = `**Execution Plan**\n\nGoal: ${plan.overallGoal}\n\n`;
    formatted += `Steps (${plan.steps.length} total):\n`;

    for (const step of plan.steps) {
      formatted += `\n${step.stepIndex + 1}. ${step.description}\n`;
      if (step.expectedTools.length > 0) {
        formatted += `   Tools: ${step.expectedTools.join(', ')}\n`;
      }
      if (step.dependencies.length > 0) {
        formatted += `   Depends on: Step ${step.dependencies.map(d => d + 1).join(', ')}\n`;
      }
      formatted += `   Why: ${step.rationale}\n`;
    }

    return formatted;
  }

  /**
   * Check if a tool is applicable for the current step
   */
  isToolApplicableForStep(step: ExecutionStep, toolName: string): boolean {
    if (step.expectedTools.length === 0) {
      // Analysis steps don't expect tools
      return false;
    }
    return step.expectedTools.includes(toolName);
  }

  /**
   * Get recommended tools for a specific step
   */
  getRecommendedToolsForStep(step: ExecutionStep): string[] {
    return [...step.expectedTools];
  }
}
