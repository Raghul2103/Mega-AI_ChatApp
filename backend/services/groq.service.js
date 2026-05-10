import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Recommended models: llama-3.3-70b-versatile, mixtral-8x7b-32768
export const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

export async function generateCompletion(prompt, options = {}) {
  let attempt = 0;
  const maxAttempts = 6;
  let delay = 5000; // Default initial delay of 5 seconds for low-limit tiers

  while (attempt < maxAttempts) {
    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: options.model || MODEL,
        response_format: options.json ? { type: "json_object" } : undefined,
        temperature: options.temperature || 0.1,
      });
      
      return response.choices[0]?.message?.content || "";
    } catch (error) {
      attempt++;
      const isRateLimit = error.status === 429 || error.statusCode === 429 || error.message?.includes('429');
      
      if (isRateLimit && attempt < maxAttempts) {
        // Extract server-specified wait duration dynamically (e.g. "try again in 9.37s")
        let waitMs = delay;
        const match = error.message?.match(/try again in ([\d\.]+)s/i);
        if (match) {
          waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 1000; // Parse seconds to ms + 1s safety buffer
        }
        
        console.warn(`[Groq API 429] Rate limit hit. Server requested wait of ${waitMs}ms. Retrying... (Attempt ${attempt}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        delay *= 2; // Double default fallback backoff for subsequent retries
      } else {
        console.error("Groq API Error:", error);
        throw error;
      }
    }
  }
}
