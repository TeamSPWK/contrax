export interface AIAnalysis {
  provider: string;
  issues: ContractIssue[];
  summary: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  rawResponse: string;
}

export interface ContractIssue {
  category: string;
  severity: "info" | "warning" | "danger" | "critical";
  affectedParty: "발주자 유리" | "공급자 유리" | "양측 리스크" | "불명확";
  clause: string;
  description: string;
  suggestion: string;
  revisedText?: string;
}

import { CONTRACT_REVIEW_PROMPT } from "./prompt";

export async function analyzeWithClaude(
  contractText: string
): Promise<AIAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: CONTRACT_REVIEW_PROMPT,
      messages: [
        {
          role: "user",
          content: `다음 계약서를 검토해주세요:\n\n${contractText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  return parseAIResponse("Claude (Anthropic)", text);
}

export function parseAIResponse(provider: string, text: string): AIAnalysis {
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    const parsed = JSON.parse(cleaned);
    return {
      provider,
      issues: parsed.issues || [],
      summary: parsed.summary || "",
      riskLevel: parsed.riskLevel || "medium",
      rawResponse: text,
    };
  } catch {
    return {
      provider,
      issues: [],
      summary: text.slice(0, 500),
      riskLevel: "medium",
      rawResponse: text,
    };
  }
}
