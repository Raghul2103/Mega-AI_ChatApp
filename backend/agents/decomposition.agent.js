import { generateCompletion } from '../services/groq.service.js';

export async function decompositionAgent(query) {
  const prompt = `
You are the Decomposition Agent.
Break the following large query into a list of smaller, actionable subtasks.
Output must be in JSON format with a single key "tasks" containing an array of strings.

Query: "${query}"
  `;
  
  const responseText = await generateCompletion(prompt, { json: true });
  
  try {
    return JSON.parse(responseText);
  } catch (e) {
    console.error("Failed to parse decomposition agent output:", responseText);
    return { tasks: [query] }; // fallback to original query
  }
}
