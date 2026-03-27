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
      model: "claude-sonnet-4-6",
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
    // 1차: 마크다운 코드블록 제거
    let cleaned = text
      .replace(/```\s*json\s*\n?/gi, "")
      .replace(/```\s*\n?/g, "")
      .trim();

    // 2차: JSON 객체 부분만 추출 (앞뒤 설명 텍스트 제거)
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    const parsed = JSON.parse(cleaned);
    return {
      provider,
      issues: (parsed.issues || []).map((issue: Record<string, unknown>) => ({
        category: issue.category || "",
        severity: issue.severity || "info",
        affectedParty: issue.affectedParty || "불명확",
        clause: issue.clause || "",
        description: issue.description || "",
        suggestion: issue.suggestion || "",
        revisedText: issue.revisedText || undefined,
      })),
      summary: parsed.summary || "",
      riskLevel: parsed.riskLevel || "medium",
      rawResponse: text,
    };
  } catch {
    // JSON 파싱 완전 실패 시 — 텍스트에서 의미있는 부분만 추출
    const summaryText = text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\{[\s\S]*\}/g, "")
      .trim()
      .slice(0, 300);
    return {
      provider,
      issues: [],
      summary: summaryText || `${provider} 응답을 파싱할 수 없습니다.`,
      riskLevel: "medium",
      rawResponse: text,
    };
  }
}
