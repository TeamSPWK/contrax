import { type AIAnalysis, parseAIResponse } from "./claude";
import { CONTRACT_REVIEW_PROMPT } from "./prompt";

export async function analyzeWithGemini(
  contractText: string
): Promise<AIAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const prompt = CONTRACT_REVIEW_PROMPT + `\n\n다음 계약서를 검토해주세요:\n\n${contractText}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return parseAIResponse("Gemini (Google)", text);
}
