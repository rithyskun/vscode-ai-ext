"use strict";
// src/core/AgentRunner.ts
// Implements a ReAct (Reason + Act) loop:
//   1. Send messages + tool schemas to the model
//   2. If model returns tool calls → check permissions → execute → append result → repeat
//   3. If model returns plain text with no tool calls → done
// Maximum 10 iterations to prevent infinite loops.
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgent = runAgent;
const AgentTools_1 = require("../tools/AgentTools");
const PermissionService_1 = require("./PermissionService");
const MAX_ITERATIONS = 10;
const AGENT_SYSTEM_PROMPT = `You are an AI coding agent with access to tools for reading/writing files,
running terminal commands, and listing directories. 

Guidelines:
- Always read a file before writing it unless you are creating a new one from scratch.
- Ask for the minimum set of information needed — prefer reading context from files over asking the user.
- Explain what you are doing before each tool call in 1-2 sentences.
- After completing a task, summarise what you changed.`;
async function* runAgent(provider, userMessage, history, onUpdate) {
    const toolDefs = Array.from(AgentTools_1.TOOL_REGISTRY.values()).map(t => t.definition);
    const permissionService = PermissionService_1.PermissionService.getInstance();
    const messages = [
        ...history,
        { role: 'user', content: userMessage },
    ];
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const response = await provider.complete(messages, toolDefs, AGENT_SYSTEM_PROMPT);
        if (response.text) {
            const update = { type: 'text', content: response.text };
            onUpdate(update);
            yield update;
        }
        // No tool calls — agent is done
        if (!response.toolCalls || response.toolCalls.length === 0) {
            // Persist the assistant turn to history
            messages.push({ role: 'assistant', content: response.text });
            const done = { type: 'done' };
            onUpdate(done);
            yield done;
            return;
        }
        // Append assistant turn with tool calls
        messages.push({ role: 'assistant', content: response.text || '' });
        // Execute each tool call sequentially
        for (const tc of response.toolCalls) {
            const callUpdate = { type: 'tool_call', name: tc.name, args: tc.arguments };
            onUpdate(callUpdate);
            yield callUpdate;
            const tool = AgentTools_1.TOOL_REGISTRY.get(tc.name);
            let result;
            if (!tool) {
                result = `Error: unknown tool "${tc.name}"`;
                permissionService.recordPermissionHistory(tc.name, 'execute', false, 'Unknown tool');
            }
            else {
                // Check permission before executing
                const permissionCheck = await permissionService.checkPermission(tc.name, 'execute', JSON.stringify(tc.arguments));
                if (!permissionCheck.allowed) {
                    result = `Permission denied for tool "${tc.name}": ${permissionCheck.reason || 'Requires user approval'}`;
                    permissionService.recordPermissionHistory(tc.name, 'execute', false, permissionCheck.reason);
                }
                else {
                    try {
                        result = await tool.execute(tc.arguments);
                        permissionService.recordPermissionHistory(tc.name, 'execute', true);
                    }
                    catch (err) {
                        result = `Error executing ${tc.name}: ${err?.message ?? String(err)}`;
                        permissionService.recordPermissionHistory(tc.name, 'execute', false, err?.message);
                    }
                }
            }
            const resultUpdate = { type: 'tool_result', name: tc.name, result };
            onUpdate(resultUpdate);
            yield resultUpdate;
            // Append tool result so model can continue
            messages.push({
                role: 'user',
                content: `Tool result for ${tc.name}:\n${result}`,
            });
        }
    }
    const errUpdate = { type: 'error', message: `Agent reached maximum iterations (${MAX_ITERATIONS}).` };
    onUpdate(errUpdate);
    yield errUpdate;
}
//# sourceMappingURL=AgentRunner.js.map