import { generateCompletion } from '../services/groq.service.js';

export async function critiqueAgent(toolResults) {
  const prompt = `
You are the Critique Agent.
Review the retrieved tool results.

1. Validate if the tool outputs are reliable and relevant.
2. Detect hallucinations, contradictions, or unsupported claims.
3. Check the mathematical accuracy of any growth percentages or numerical calculations (e.g., Year-over-Year growth, delivery growth). If raw values contradict the stated percentage, mark 'accepted' as false.
4. Assign a confidence score.

==================================================
OUTPUT FORMAT (MUST BE VALID JSON)
==================================================
{
  "accepted": true,
  "issue": "",
  "claim": "",
  "confidence": 0.9
}

If accepted is false, provide the reason in 'issue'.
==================================================
TOOL RESULTS
==================================================
${JSON.stringify(toolResults, null, 2)}
`;

  const responseText = await generateCompletion(prompt, { json: true });

  try {
    return JSON.parse(responseText);
  } catch (e) {
    console.error("Critique Agent failed", e);
    return { accepted: false, issue: "Parsing failure", claim: "", confidence: 0 };
  }
}
