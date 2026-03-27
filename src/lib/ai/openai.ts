import { type AIAnalysis, parseAIResponse } from "./claude";
import { CONTRACT_REVIEW_PROMPT } from "./prompt";

export async function analyzeWithGPT(
  contractText: string
): Promise<AIAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: CONTRACT_REVIEW_PROMPT },
        {
          role: "user",
          content: `다음 계약서를 검토해주세요:\n\n${contractText}`,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";

  return parseAIResponse("GPT-4o (OpenAI)", text);
}
