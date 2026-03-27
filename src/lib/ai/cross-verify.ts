import type { AIAnalysis, ContractIssue } from "./claude";
import { analyzeWithClaude } from "./claude";
import { analyzeWithGPT } from "./openai";
import { analyzeWithGemini } from "./gemini";

export interface CrossVerificationResult {
  analyses: AIAnalysis[];
  consensus: ConsensusAnalysis;
  timestamp: string;
}

export interface ConsensusAnalysis {
  consensusRate: number;
  verdict: "auto_approve" | "human_review" | "redefine";
  commonIssues: ContractIssue[];
  uniqueIssues: { provider: string; issues: ContractIssue[] }[];
  overallRiskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
}

export async function crossVerifyContract(
  contractText: string
): Promise<CrossVerificationResult> {
  console.log(`[ContraX] 교차검증 시작 — 텍스트 길이: ${contractText.length}자`);
  console.log(`[ContraX] Phase 1: Claude + GPT + Gemini 병렬 호출 중...`);
  const startTime = Date.now();

  // Phase 1: 3개 AI 병렬 호출
  const results = await Promise.allSettled([
    analyzeWithClaude(contractText).then((r) => {
      console.log(`[ContraX] ✓ Claude 완료 (${Date.now() - startTime}ms) — 위험도: ${r.riskLevel}, 이슈: ${r.issues.length}건`);
      return r;
    }),
    analyzeWithGPT(contractText).then((r) => {
      console.log(`[ContraX] ✓ GPT 완료 (${Date.now() - startTime}ms) — 위험도: ${r.riskLevel}, 이슈: ${r.issues.length}건`);
      return r;
    }),
    analyzeWithGemini(contractText).then((r) => {
      console.log(`[ContraX] ✓ Gemini 완료 (${Date.now() - startTime}ms) — 위험도: ${r.riskLevel}, 이슈: ${r.issues.length}건`);
      return r;
    }),
  ]);

  const analyses: AIAnalysis[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      analyses.push(result.value);
    } else {
      console.error(`[ContraX] ✗ AI 호출 실패:`, result.reason?.message || result.reason);
    }
  }

  console.log(`[ContraX] Phase 1 완료 — 성공: ${analyses.length}/3, 총 소요: ${Date.now() - startTime}ms`);

  if (analyses.length === 0) {
    throw new Error("모든 AI 분석이 실패했습니다.");
  }

  // Phase 2: 합의 분석
  console.log(`[ContraX] Phase 2: 합의 분석 중...`);
  const consensus = buildConsensus(analyses);
  console.log(`[ContraX] 교차검증 완료 — 합의율: ${consensus.consensusRate}%, 판정: ${consensus.verdict}, 공통이슈: ${consensus.commonIssues.length}건`);

  return {
    analyses,
    consensus,
    timestamp: new Date().toISOString(),
  };
}

export function buildConsensus(analyses: AIAnalysis[]): ConsensusAnalysis {
  const allIssues = analyses.flatMap((a) =>
    a.issues.map((issue) => ({ ...issue, provider: a.provider }))
  );

  // 카테고리별로 이슈 그룹화하여 공통/고유 이슈 분류
  const categoryMap = new Map<string, { providers: Set<string>; issues: (ContractIssue & { provider: string })[] }>();

  for (const issue of allIssues) {
    const key = normalizeCategory(issue.category);
    if (!categoryMap.has(key)) {
      categoryMap.set(key, { providers: new Set(), issues: [] });
    }
    const group = categoryMap.get(key)!;
    group.providers.add(issue.provider);
    group.issues.push(issue);
  }

  const commonIssues: ContractIssue[] = [];
  const uniqueIssuesMap = new Map<string, ContractIssue[]>();

  for (const [, group] of categoryMap) {
    if (group.providers.size >= 2) {
      // 2개 이상 AI가 동의한 이슈 = 공통 이슈
      // severity가 가장 높은 것을 대표로 선택
      const representative = group.issues.sort(
        (a, b) => severityScore(b.severity) - severityScore(a.severity)
      )[0];
      commonIssues.push({
        category: representative.category,
        severity: representative.severity,
        affectedParty: representative.affectedParty || "불명확",
        clause: representative.clause,
        description: representative.description,
        suggestion: representative.suggestion,
        revisedText: representative.revisedText,
      });
    } else {
      // 1개 AI만 지적한 이슈 = 고유 이슈
      for (const issue of group.issues) {
        const provider = issue.provider;
        if (!uniqueIssuesMap.has(provider)) {
          uniqueIssuesMap.set(provider, []);
        }
        uniqueIssuesMap.get(provider)!.push({
          category: issue.category,
          severity: issue.severity,
          affectedParty: issue.affectedParty || "불명확",
          clause: issue.clause,
          description: issue.description,
          suggestion: issue.suggestion,
          revisedText: issue.revisedText,
        });
      }
    }
  }

  const uniqueIssues = Array.from(uniqueIssuesMap.entries()).map(
    ([provider, issues]) => ({ provider, issues })
  );

  // 합의율 계산: 공통 이슈 비율
  const totalCategories = categoryMap.size;
  const commonCategories = Array.from(categoryMap.values()).filter(
    (g) => g.providers.size >= 2
  ).length;
  const consensusRate =
    totalCategories > 0
      ? Math.round((commonCategories / totalCategories) * 100)
      : 0;

  // 위험도: 가장 높은 수준 채택
  const riskLevels = analyses.map((a) => a.riskLevel);
  const overallRiskLevel = riskLevels.sort(
    (a, b) => riskScore(b) - riskScore(a)
  )[0] || "medium";

  // 판정
  let verdict: "auto_approve" | "human_review" | "redefine";
  if (consensusRate >= 90) {
    verdict = "auto_approve";
  } else if (consensusRate >= 70) {
    verdict = "human_review";
  } else {
    verdict = "redefine";
  }

  // 종합 요약 생성
  const summaries = analyses.map((a) => a.summary).filter(Boolean);
  const summary =
    summaries.length > 0
      ? `[교차검증 완료] ${analyses.length}개 AI가 분석하여 합의율 ${consensusRate}%를 달성했습니다. 공통 지적사항 ${commonIssues.length}건, 개별 의견 ${uniqueIssues.reduce((sum, u) => sum + u.issues.length, 0)}건이 발견되었습니다. ${summaries[0]}`
      : "분석 결과를 종합할 수 없습니다.";

  return {
    consensusRate,
    verdict,
    commonIssues,
    uniqueIssues,
    overallRiskLevel,
    summary,
  };
}

function normalizeCategory(category: string): string {
  const normalized = category.toLowerCase().trim();
  const mappings: Record<string, string> = {
    불공정: "unfair",
    "불공정 조항": "unfair",
    "불공정조항": "unfair",
    "법적 리스크": "legal_risk",
    "법적리스크": "legal_risk",
    리스크: "legal_risk",
    "누락 조항": "missing",
    "누락조항": "missing",
    누락: "missing",
    "모호한 표현": "ambiguous",
    모호: "ambiguous",
    "위약금": "penalty",
    "손해배상": "penalty",
    "해지": "termination",
    "해제": "termination",
    "개인정보": "privacy",
    "비밀유지": "privacy",
    "자동갱신": "renewal",
    갱신: "renewal",
  };
  return mappings[normalized] || normalized;
}

function severityScore(severity: string): number {
  const scores: Record<string, number> = {
    info: 1,
    warning: 2,
    danger: 3,
    critical: 4,
  };
  return scores[severity] || 0;
}

function riskScore(level: string): number {
  const scores: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return scores[level] || 0;
}
