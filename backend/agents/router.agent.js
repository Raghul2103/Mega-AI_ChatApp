import { generateCompletion } from '../services/groq.service.js';

export async function routerAgent(query, currentContext) {
  const prompt = `
You are the Orchestrator Router in a production-grade multi-agent AI system.
Your job is to decide which agent should run next based on the current context and the original query.

AVAILABLE AGENTS:
- "Decomposition": Breaks down the initial query. ONLY run this if "tasks" array is empty.
- "Retrieval": Fetches data via tools. ONLY run this if "tasks" has items but "toolResults" is empty.
- "Critique": Validates tool outputs. ONLY run this if "toolResults" has items but "critique" is empty.
- "Synthesis": Generates the final safe response. ONLY run this if "critique" has validated the data and "finalAnswer" is empty.
- "Complete": ALWAYS choose this to end the workflow if "finalAnswer" is already generated and safe. Do not loop.

==================================================
OUTPUT FORMAT (MUST BE VALID JSON)
==================================================
{
  "selectedAgent": "",
  "reason": "",
  "expectedOutcome": "",
  "confidence": 0.0
}

==================================================
QUERY
==================================================
${query}

==================================================
CURRENT CONTEXT
==================================================
${JSON.stringify(currentContext, null, 2)}
`;

  const responseText = await generateCompletion(prompt, { json: true });

  try {
    return JSON.parse(responseText);
  } catch (e) {
    console.error("Router Agent failed to parse output", e);
    // Fallback logic
    if (!currentContext.tasks || currentContext.tasks.length === 0) return { selectedAgent: 'Decomposition', reason: 'Fallback', confidence: 0.5 };
    if (!currentContext.toolResults || currentContext.toolResults.length === 0) return { selectedAgent: 'Retrieval', reason: 'Fallback', confidence: 0.5 };
    if (!currentContext.critique) return { selectedAgent: 'Critique', reason: 'Fallback', confidence: 0.5 };
    if (!currentContext.finalAnswer) return { selectedAgent: 'Synthesis', reason: 'Fallback', confidence: 0.5 };
    return { selectedAgent: 'Complete', reason: 'Fallback', confidence: 0.5 };
  }
}
