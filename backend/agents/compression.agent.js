import { generateCompletion } from '../services/groq.service.js';

export async function compressionAgent(contextPayload) {
  const prompt = `
You are the Compression Agent in a production-grade multi-agent AI orchestration system.
Your goal is to compress the provided context payload to significantly reduce its token footprint while maintaining 100% of the factual integrity.

CRITICAL RULES:
1. Preserve all structured data formats.
2. Preserve all citations, URLs, and source references.
3. Preserve all tool outputs and exact numerical values.
4. Preserve all confidence scores and critique warnings.
5. Compress ONLY conversational filler, redundant phrasing, and verbose reasoning traces.

==================================================
OUTPUT FORMAT (MUST BE VALID JSON)
==================================================
{
  "compressedContext": {},
  "originalTokensEstimate": 0,
  "compressedTokensEstimate": 0,
  "reductionPercentage": 0
}

==================================================
CONTEXT TO COMPRESS
==================================================
${JSON.stringify(contextPayload, null, 2)}
`;

  const responseText = await generateCompletion(prompt, { json: true });

  try {
    const result = JSON.parse(responseText);
    return result;
  } catch (e) {
    console.error("Compression Agent failed to parse output", e);
    return { compressedContext: contextPayload, error: "Compression failed" };
  }
}
