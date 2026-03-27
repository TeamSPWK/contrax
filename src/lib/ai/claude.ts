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
      max_tokens: 8192,
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

const SEVERITY_MAP: Record<string, string> = {
  info: "info", low: "info", "낮음": "info",
  warning: "warning", medium: "warning", "중간": "warning", "주의": "warning",
  danger: "danger", high: "danger", "높음": "danger", "위험": "danger",
  critical: "critical", "심각": "critical",
};

function normalizeSeverity(s: unknown): "info" | "warning" | "danger" | "critical" {
  const key = String(s || "").toLowerCase().trim();
  return (SEVERITY_MAP[key] || "warning") as "info" | "warning" | "danger" | "critical";
}

function tryParseJSON(text: string): unknown | null {
  // 1차: 마크다운 코드블록 제거
  let cleaned = text
    .replace(/```\s*json\s*\n?/gi, "")
    .replace(/```\s*\n?/g, "")
    .trim();

  // 2차: JSON 객체 추출
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];

  // 3차: 직접 파싱 시도
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // 4차: 잘린 JSON 복구 — 닫히지 않은 괄호 보완
  let fixed = cleaned;
  const opens = (fixed.match(/\[/g) || []).length;
  const closes = (fixed.match(/\]/g) || []).length;
  for (let i = 0; i < opens - closes; i++) fixed += "]";
  const braceOpens = (fixed.match(/\{/g) || []).length;
  const braceCloses = (fixed.match(/\}/g) || []).length;
  for (let i = 0; i < braceOpens - braceCloses; i++) fixed += "}";

  // 잘린 문자열 끝의 불완전 항목 제거
  fixed = fixed.replace(/,\s*[\]}]/, (m) => m.replace(",", ""));
  fixed = fixed.replace(/,\s*$/, "");

  try { return JSON.parse(fixed); } catch { return null; }
}

export function parseAIResponse(provider: string, text: string): AIAnalysis {
  const parsed = tryParseJSON(text) as Record<string, unknown> | null;

  if (parsed && typeof parsed === "object" && parsed.issues) {
    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    return {
      provider,
      issues: issues.map((issue: Record<string, unknown>) => ({
        category: String(issue.category || ""),
        severity: normalizeSeverity(issue.severity),
        affectedParty: ((issue.affectedParty as string) || "불명확") as ContractIssue["affectedParty"],
        clause: String(issue.clause || ""),
        description: String(issue.description || ""),
        suggestion: String(issue.suggestion || ""),
        revisedText: issue.revisedText ? String(issue.revisedText) : undefined,
      })),
      summary: String(parsed.summary || ""),
      riskLevel: ((parsed.riskLevel as string) || "medium") as AIAnalysis["riskLevel"],
      rawResponse: text,
    };
  }

  // 완전 실패 — JSON/코드블록 제거 후 텍스트만
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
