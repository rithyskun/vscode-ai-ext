// src/core/AgentRunner.ts
// Implements an enhanced ReAct (Reason + Act) loop with planning:
//   1. Create execution plan from user request (task decomposition)
//   2. Send messages + plan + tool schemas to the model
//   3. If model returns tool calls → check permissions → execute → track progress → append result → repeat
//   4. If model returns plain text with no tool calls → done
// Maximum 15 iterations to prevent infinite loops (up from 10).

import { IModelProvider, ChatMessage, ToolDefinition } from '../providers/IModelProvider';
import { TOOL_REGISTRY } from '../tools/AgentTools';
import { PermissionService } from './PermissionService';
import { PlanningService } from './PlanningService';
import { ExecutionContext } from './ExecutionContext';
import { PlanExecutionTracker } from './PlanExecutionTracker';
import { ErrorRecoveryService } from './ErrorRecoveryService';
import { ToolSelectionEvaluator } from './ToolSelectionEvaluator';
import { ToolOutputAnalyzer } from './ToolOutputAnalyzer';
import { ExecutionReflector } from './ExecutionReflector';
import { AgentLearningService } from './AgentLearningService';

const MAX_ITERATIONS = 15;

const AGENT_SYSTEM_PROMPT = `You are an advanced AI coding agent with access to tools for reading/writing files,
running terminal commands, and listing directories.

You are following a structured execution plan that breaks down the user's request into logical steps.
Each step has expected tools and dependencies. Use this plan to guide your actions.

Guidelines:
- Review the provided execution plan before taking action
- Complete steps in order, respecting dependencies
- Always read a file before writing it unless you are creating a new one from scratch
- Use recommended tools for each step, but you can adapt if needed
- If a tool fails, analyze the error and try an alternative approach
- After completing each step, indicate progress (e.g., "Step 1 complete: read file X")
- After completing the entire task, summarise what you changed

Be aware of:
- Your current execution context (recent tools, errors, files modified)
- Maximum iteration limit to prevent infinite loops
- Permission requirements for destructive operations`;


export type AgentUpdate =
  | { type: 'text';   content: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export async function* runAgent(
  provider: IModelProvider,
  userMessage: string,
  history: ChatMessage[],
  onUpdate: (update: AgentUpdate) => void
): AsyncGenerator<AgentUpdate> {
  const toolDefs: ToolDefinition[] = Array.from(TOOL_REGISTRY.values()).map(t => t.definition);
  const permissionService = PermissionService.getInstance();
  const planningService = PlanningService.getInstance();
  const errorRecoveryService = ErrorRecoveryService.getInstance();
  const toolSelectionEvaluator = ToolSelectionEvaluator.getInstance();
  const toolOutputAnalyzer = ToolOutputAnalyzer.getInstance();
  const executionReflector = ExecutionReflector.getInstance();
  const learningService = AgentLearningService.getInstance();

  const executionContext = new ExecutionContext(MAX_ITERATIONS);

  // Step 1: Create an execution plan from the user request
  const plan = await planningService.createPlan(userMessage, '');
  const planTracker = new PlanExecutionTracker(plan.steps);

  // Notify user of the plan
  const planUpdate: AgentUpdate = {
    type: 'text',
    content: `📋 ${planningService.formatPlan(plan)}`,
  };
  onUpdate(planUpdate);
  yield planUpdate;

  const messages: ChatMessage[] = [
    ...history,
    {
      role: 'user',
      content: `${userMessage}\n\n${planningService.formatPlan(plan)}`,
    },
  ];

  const toolSequence: string[] = [];
  let recoveryAttempts: Map<string, number> = new Map();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    executionContext.incrementIterationCount();

    // Step 2: Reflection checkpoint every 3 tools
    if (executionReflector.shouldReflect(toolSequence.length)) {
      const reflection = executionReflector.reflect(
        executionContext,
        planTracker,
        userMessage
      );

      const reflectionUpdate: AgentUpdate = {
        type: 'text',
        content: executionReflector.formatReflection(reflection),
      };
      onUpdate(reflectionUpdate);
      yield reflectionUpdate;

      // Check for execution stall
      const isStalled = executionReflector.detectExecutionStall(
        executionContext.getToolExecutionHistory(),
        5
      );
      if (isStalled) {
        const lastTool = toolSequence[toolSequence.length - 1];
        const stalledUpdate: AgentUpdate = {
          type: 'text',
          content:
            `⚠️ Execution appears stuck with '${lastTool}'. ${executionReflector.getStalledExecutionRecovery(lastTool)}`,
        };
        onUpdate(stalledUpdate);
        yield stalledUpdate;
      }

      if (!reflection.shouldContinue) {
        const stopUpdate: AgentUpdate = {
          type: 'error',
          message: 'Execution halted based on reflection analysis.',
        };
        onUpdate(stopUpdate);
        yield stopUpdate;
        return;
      }
    }

    // Include execution context in the system prompt
    let currentSystemPrompt = AGENT_SYSTEM_PROMPT;
    if (i > 0) {
      const contextSummary = executionContext.getSuggestedContext();
      if (contextSummary) {
        currentSystemPrompt += `\n\nExecution Context:\n${contextSummary}`;
      }
    }

    const response = await provider.complete(messages, toolDefs, currentSystemPrompt);

    if (response.text) {
      const update: AgentUpdate = { type: 'text', content: response.text };
      onUpdate(update);
      yield update;
    }

    // No tool calls — agent is done
    if (!response.toolCalls || response.toolCalls.length === 0) {
      // Persist the assistant turn to history
      messages.push({ role: 'assistant', content: response.text });
      const done: AgentUpdate = { type: 'done' };
      onUpdate(done);
      yield done;

      // Record final execution and learning
      learningService.recordExecution(
        identifyTaskType(userMessage),
        toolSequence,
        true,
        Date.now() - executionContext.getStartTime(),
        []
      );

      // Yield final execution summary
      const summary = executionContext.getExecutionSummary();
      const summaryUpdate: AgentUpdate = { type: 'text', content: `✓ ${summary}` };
      onUpdate(summaryUpdate);
      yield summaryUpdate;

      // Yield learning summary
      const learningSummary = learningService.getSummary();
      const learningSummaryUpdate: AgentUpdate = {
        type: 'text',
        content: learningSummary,
      };
      onUpdate(learningSummaryUpdate);
      yield learningSummaryUpdate;

      return;
    }

    // Append assistant turn with tool calls
    messages.push({ role: 'assistant', content: response.text || '' });

    // Execute each tool call sequentially with recovery
    for (const tc of response.toolCalls) {
      const callUpdate: AgentUpdate = { type: 'tool_call', name: tc.name, args: tc.arguments };
      onUpdate(callUpdate);
      yield callUpdate;

      const tool = TOOL_REGISTRY.get(tc.name);
      let result: string;
      const startTime = Date.now();
      let successfulExecution = false;

      if (!tool) {
        result = `Error: unknown tool "${tc.name}"`;
        const errorType = 'unknown' as const;
        executionContext.recordError(tc.name, errorType, result);
        executionContext.recordToolExecution(
          tc.name,
          tc.arguments,
          result,
          Date.now() - startTime,
          result
        );
        permissionService.recordPermissionHistory(tc.name, 'execute', false, 'Unknown tool');
      } else {
        // Check permission before executing
        const permissionCheck = await permissionService.checkPermission(
          tc.name,
          'execute',
          JSON.stringify(tc.arguments)
        );
        const deniedByPolicy = !permissionCheck.allowed &&
          (permissionCheck.reason?.includes('always deny') ?? false);
        const blockedUnknownTool = !permissionCheck.allowed &&
          (permissionCheck.reason?.includes('Tool not found in permissions') ?? false);

        if (deniedByPolicy || blockedUnknownTool) {
          result = `Permission denied for tool "${tc.name}": ${permissionCheck.reason || 'Requires user approval'}`;
          const errorType = 'permission_denied' as const;
          executionContext.recordError(tc.name, errorType, permissionCheck.reason || 'Permission denied');
          executionContext.recordToolExecution(
            tc.name,
            tc.arguments,
            result,
            Date.now() - startTime,
            result
          );
          permissionService.recordPermissionHistory(tc.name, 'execute', false, permissionCheck.reason);
        } else {
          try {
            result = await tool.execute(tc.arguments);
            executionContext.recordToolExecution(
              tc.name,
              tc.arguments,
              result,
              Date.now() - startTime
            );
            permissionService.recordPermissionHistory(tc.name, 'execute', true);
            successfulExecution = true;

            // Track file modifications
            if (
              (tc.name === 'write_file' || tc.name === 'edit_file') &&
              tc.arguments.filePath
            ) {
              executionContext.recordFileModification(String(tc.arguments.filePath));
            }

            // Update plan tracker
            planTracker.recordToolUsage(planTracker.getCurrentStepIndex(), tc.name);
            toolSequence.push(tc.name);

            // Step 3: Analyze tool output
            const analysis = toolOutputAnalyzer.analyzeOutput(tc.name, result);
            if (!analysis.success && analysis.suggestedNextStep) {
              const analysisUpdate: AgentUpdate = {
                type: 'text',
                content: `💭 Output analysis: ${analysis.analysis}. ${analysis.suggestedNextStep}`,
              };
              onUpdate(analysisUpdate);
              yield analysisUpdate;
            }
          } catch (err: any) {
            result = `Error executing ${tc.name}: ${err?.message ?? String(err)}`;
            const errorMessage = err?.message ?? String(err);
            const errorType = classifyError(errorMessage);
            executionContext.recordError(tc.name, errorType, errorMessage);
            executionContext.recordToolExecution(
              tc.name,
              tc.arguments,
              result,
              Date.now() - startTime,
              result
            );
            permissionService.recordPermissionHistory(tc.name, 'execute', false, err?.message);

            // Step 4: Intelligent error recovery
            const recoveryStrategies = errorRecoveryService.getRecoveryStrategies(
              errorType,
              errorMessage
            );

            if (recoveryStrategies.length > 0) {
              const triedStrategies = Array.from(recoveryAttempts.keys()).filter(
                key => key.startsWith(tc.name)
              );
              const untriedStrategies = recoveryStrategies.filter(
                s => !triedStrategies.includes(s.id)
              );

              if (untriedStrategies.length > 0) {
                const strategy = untriedStrategies[0];
                const strategyUpdate: AgentUpdate = {
                  type: 'text',
                  content: `🔄 Recovery attempt: ${errorRecoveryService.formatStrategy(strategy)}`,
                };
                onUpdate(strategyUpdate);
                yield strategyUpdate;

                // Record recovery attempt
                recoveryAttempts.set(strategy.id, (recoveryAttempts.get(strategy.id) ?? 0) + 1);
                errorRecoveryService.recordRecoveryAttempt(tc.name, errorMessage, strategy.id, false);
              }
            }
          }
        }
      }

      const resultUpdate: AgentUpdate = { type: 'tool_result', name: tc.name, result };
      onUpdate(resultUpdate);
      yield resultUpdate;

      // Append tool result so model can continue
      messages.push({
        role: 'user',
        content: `Tool result for ${tc.name}:\n${result}`,
      });
    }
  }

  // Record final execution with errors
  const errors = executionContext.getErrors().map(e => e.message);
  learningService.recordExecution(
    identifyTaskType(userMessage),
    toolSequence,
    false,
    Date.now() - executionContext.getStartTime(),
    errors
  );

  const errUpdate: AgentUpdate = {
    type: 'error',
    message: `Agent reached maximum iterations (${MAX_ITERATIONS}). Plan summary:\n${planTracker.getSummary()}`,
  };
  onUpdate(errUpdate);
  yield errUpdate;
}

/**
 * Identify task type from user message
 */
function identifyTaskType(request: string): string {
  const lower = request.toLowerCase();

  if (lower.includes('create') || lower.includes('new file')) {
    return 'create';
  }
  if (lower.includes('edit') || lower.includes('modify') || lower.includes('refactor')) {
    return 'edit';
  }
  if (lower.includes('find') || lower.includes('search')) {
    return 'search';
  }
  if (lower.includes('delete') || lower.includes('remove')) {
    return 'delete';
  }
  if (lower.includes('run') || lower.includes('execute') || lower.includes('test')) {
    return 'execute';
  }
  if (lower.includes('analyze') || lower.includes('review')) {
    return 'analysis';
  }

  return 'general';
}

/**
 * Classify error messages into structured error types
 */
function classifyError(errorMessage: string): 'permission_denied' | 'file_not_found' | 'invalid_format' | 'runtime_error' | 'unknown' {
  const lower = errorMessage.toLowerCase();

  if (lower.includes('permission') || lower.includes('denied') || lower.includes('not allowed')) {
    return 'permission_denied';
  }
  if (
    lower.includes('not found') ||
    lower.includes('does not exist') ||
    lower.includes('no such file')
  ) {
    return 'file_not_found';
  }
  if (
    lower.includes('invalid') ||
    lower.includes('malformed') ||
    lower.includes('syntax error')
  ) {
    return 'invalid_format';
  }
  if (lower.includes('error') || lower.includes('failed')) {
    return 'runtime_error';
  }

  return 'unknown';
}
