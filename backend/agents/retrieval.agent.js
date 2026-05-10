import { executeTool } from '../tools/index.js';

export async function retrievalAgent(tasks, jobId = "system") {
  let toolResults = [];
  let combinedChunks = [];
  
  for (const task of tasks) {
    try {
      const result = await executeTool('webSearch', task, jobId, 'Retrieval');
      toolResults.push({ task, result });
      
      if (result.results) {
        combinedChunks.push(...result.results.map(r => r.snippet));
      }
    } catch (e) {
      console.error("Retrieval execution error:", e);
    }
  }

  return { 
    status: 'tools_executed', 
    toolResults,
    multiHopReasoning: {
      combinedChunks,
      reasoning: "Combined chunks across multiple tasks to build cross-referenced context for synthesis."
    }
  };
}
