import ToolCall from '../models/ToolCall.js';
import Retry from '../models/Retry.js';

export async function webSearch(query) {
  console.log(`[Tool] Web Search called with query: ${query}`);
  return {
    results: [
      { title: "Tesla Growth", url: "https://example.com/tesla", snippet: "Tesla grew 40% last quarter.", score: 0.91 },
      { title: "BYD Growth", url: "https://example.com/byd", snippet: "BYD saw a 60% increase in EV sales.", score: 0.88 }
    ]
  };
}

export async function sqlTool(query) {
  console.log(`[Tool] SQL called with query: ${query}`);
  return {
    rows: [
      { year: 2023, company: 'Tesla', sales: 1800000 },
      { year: 2023, company: 'BYD', sales: 3000000 }
    ]
  };
}

export async function pythonTool(code) {
  console.log(`[Tool] Python called with code: ${code}`);
  return { stdout: "Execution successful. Data processed.", stderr: "", exitCode: 0 };
}

export async function reflectionTool(history) {
  console.log(`[Tool] Reflection called`);
  return { contradictions: [], insights: ["The current reasoning path seems correct."] };
}

export const tools = { webSearch, sqlTool, pythonTool, reflectionTool };

export async function executeTool(toolName, args, jobId = "system", agent = "Unknown") {
  if (!tools[toolName]) {
    return { errorCode: "TOOL_NOT_FOUND", message: `Tool ${toolName} does not exist`, retryable: false };
  }

  const maxRetries = 2;
  let attempt = 0;
  
  while (attempt <= maxRetries) {
    const start = Date.now();
    try {
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate latency
      
      // Simulate random timeout failure contract
      if (Math.random() < 0.1) {
        throw new Error("TOOL_TIMEOUT");
      }
      
      const result = await tools[toolName](args);
      const latency = Date.now() - start;
      
      await ToolCall.create({ jobId, toolName, args, result, status: 'success', latency });
      return result;
      
    } catch (error) {
      const latency = Date.now() - start;
      attempt++;
      
      await Retry.create({ jobId, toolName, agent, attemptNumber: attempt, error: error.message, latency });
      
      if (attempt > maxRetries) {
        const failureContract = {
          errorCode: error.message === "TOOL_TIMEOUT" ? "TOOL_TIMEOUT" : "EXECUTION_FAILURE",
          message: error.message,
          retryable: false
        };
        await ToolCall.create({ jobId, toolName, args, result: failureContract, status: 'failed', latency });
        return failureContract;
      }
    }
  }
}
