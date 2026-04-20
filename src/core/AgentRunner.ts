// src/core/AgentRunner.ts
// Implements a ReAct (Reason + Act) loop:
//   1. Send messages + tool schemas to the model
//   2. If model returns tool calls → execute → append result → repeat
//   3. If model returns plain text with no tool calls → done
// Maximum 10 iterations to prevent infinite loops.

import { IModelProvider, ChatMessage, ToolDefinition } from '../providers/IModelProvider';
import { TOOL_REGISTRY } from '../tools/AgentTools';

const MAX_ITERATIONS = 10;

const AGENT_SYSTEM_PROMPT = `You are an AI coding agent with access to tools for reading/writing files,
running terminal commands, and listing directories. 

Guidelines:
- Always read a file before writing it unless you are creating a new one from scratch.
- Ask for the minimum set of information needed — prefer reading context from files over asking the user.
- Explain what you are doing before each tool call in 1-2 sentences.
- After completing a task, summarise what you changed.`;

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

  const messages: ChatMessage[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await provider.complete(messages, toolDefs, AGENT_SYSTEM_PROMPT);

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
      return;
    }

    // Append assistant turn with tool calls
    messages.push({ role: 'assistant', content: response.text || '' });

    // Execute each tool call sequentially
    for (const tc of response.toolCalls) {
      const callUpdate: AgentUpdate = { type: 'tool_call', name: tc.name, args: tc.arguments };
      onUpdate(callUpdate);
      yield callUpdate;

      const tool = TOOL_REGISTRY.get(tc.name);
      let result: string;

      if (!tool) {
        result = `Error: unknown tool "${tc.name}"`;
      } else {
        try {
          result = await tool.execute(tc.arguments);
        } catch (err: any) {
          result = `Error executing ${tc.name}: ${err?.message ?? String(err)}`;
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

  const errUpdate: AgentUpdate = { type: 'error', message: `Agent reached maximum iterations (${MAX_ITERATIONS}).` };
  onUpdate(errUpdate);
  yield errUpdate;
}
