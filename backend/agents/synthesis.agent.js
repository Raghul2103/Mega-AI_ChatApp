import { generateCompletion } from '../services/groq.service.js';

export async function synthesisAgent(toolResults, critiqueResults) {
  const prompt = `
You are the Synthesis Agent.
Merge the tool results and critique to generate a safe, validated final response.

CRITICAL RULE: If the user query states specific statistics, percentages, or numbers (e.g., "Tesla grew 90%") that are NOT supported or verified in the Tool Results, you MUST:
1. Suppress those exact numbers from your finalAnswer.
2. Add the unverified statements to the "suppressedClaims" array.
3. Set "policyViolation" to true and lower the "confidence" score below 0.5.
4. Output a safe, helpful response in "finalAnswer" explaining that the figures could not be verified.

CRITICAL REQUIREMENT - PROVENANCE MAPPING:
Every generated sentence must be mapped to its source in the "provenance" array.
Ensure all mathematical claims, especially growth percentages, are 100% accurate, consistent, and directly derived from verified figures in the tool results.

==================================================
OUTPUT FORMAT (MUST BE VALID JSON)
==================================================
{
  "isSafe": true,
  "confidence": 0.9,
  "finalAnswer": "Tesla experienced EV growth.",
  "provenance": [
    {
      "sentence": "Tesla experienced EV growth.",
      "sourceAgent": "Retrieval",
      "sourceChunk": "snippet from example.com/tesla",
      "sourceTool": "webSearch"
    }
  ],
  "warnings": [],
  "suppressedClaims": [],
  "policyViolation": false
}

==================================================
TOOL RESULTS
==================================================
${JSON.stringify(toolResults, null, 2)}

==================================================
CRITIQUE OUTPUT
==================================================
${JSON.stringify(critiqueResults, null, 2)}
`;
  
  const responseText = await generateCompletion(prompt, { json: true });
  
  try {
    return JSON.parse(responseText);
  } catch (e) {
    return { isSafe: false, finalAnswer: "Error generating synthesis.", confidence: 0, warnings: ["Synthesis parsing error"], suppressedClaims: [], policyViolation: true, provenance: [] };
  }
}
