"use client";

import { useState } from "react";
import type { CrossVerificationResult } from "@/lib/ai/cross-verify";
import type { ContractIssue } from "@/lib/ai/claude";
import { RISK_LABELS, RISK_COLORS, SEVERITY_LABELS, SEVERITY_COLORS, PARTY_COLORS } from "@/lib/constants";

interface AnalysisResultProps {
  result: CrossVerificationResult & { fileName: string; textLength: number };
  onIssueClick?: (issueIndex: number) => void;
}

const severityColors = SEVERITY_COLORS;
const severityLabels = SEVERITY_LABELS;

const riskColors = RISK_COLORS;
const riskLabels = RISK_LABELS;

const verdictConfig: Record<
  string,
  { color: string; bg: string; icon: string; label: string; desc: string }
> = {
  auto_approve: {
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/30",
    icon: "\u2713",
    label: "합의 완료",
    desc: "3개 AI의 분석 결과가 높은 일치도를 보입니다.",
  },
  human_review: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/30",
    icon: "\u26A0",
    label: "추가 검토 필요",
    desc: "AI 간 의견 차이가 있어 전문가 확인을 권장합니다.",
  },
  redefine: {
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    icon: "\u2718",
    label: "재검토 필요",
    desc: "AI 간 의견 차이가 커서 추가 분석이 필요합니다.",
  },
};

const partyColors = PARTY_COLORS;

function IssueCard({ issue, index, onIssueClick }: { issue: ContractIssue; index?: number; onIssueClick?: (i: number) => void }) {
  return (
    <div
      className={`border rounded-xl p-4 ${severityColors[issue.severity] || severityColors.info} ${onIssueClick && index !== undefined ? "cursor-pointer hover:ring-1 hover:ring-white/20 transition-all" : ""}`}
      onClick={() => onIssueClick && index !== undefined && onIssueClick(index)}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/10">
          {severityLabels[issue.severity] || issue.severity}
        </span>
        <span className="text-sm font-semibold">{issue.category}</span>
        {issue.affectedParty && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${partyColors[issue.affectedParty] || partyColors["불명확"]}`}
          >
            {issue.affectedParty}
          </span>
        )}
      </div>
      {issue.clause && (
        <p className="text-xs opacity-70 mb-2 italic">
          &ldquo;{issue.clause}&rdquo;
        </p>
      )}
      <p className="text-sm mb-2">{issue.description}</p>
      <p className="text-xs opacity-80">
        <strong>제안:</strong> {issue.suggestion}
      </p>
      {issue.revisedText && (
        <div className="mt-3 bg-white/5 rounded-lg p-3 border border-white/10 group/revised">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-green-300 font-semibold">
              수정 문구 제안:
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(issue.revisedText!)}
              className="text-xs text-gray-500 hover:text-green-400 transition-colors opacity-0 group-hover/revised:opacity-100"
            >
              복사
            </button>
          </div>
          <p className="text-xs text-gray-300 whitespace-pre-wrap">
            {issue.revisedText}
          </p>
        </div>
      )}
    </div>
  );
}

type SeverityFilter = "all" | "critical" | "danger" | "warning" | "info";
type PartyFilter = "all" | "발주자 유리" | "공급자 유리" | "양측 리스크";

export default function AnalysisResult({ result, onIssueClick }: AnalysisResultProps) {
  const { consensus, analyses } = result;
  const vc = verdictConfig[consensus.verdict] || verdictConfig.human_review;
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [partyFilter, setPartyFilter] = useState<PartyFilter>("all");

  const filterIssue = (issue: ContractIssue) => {
    if (severityFilter !== "all" && issue.severity !== severityFilter) return false;
    if (partyFilter !== "all" && issue.affectedParty !== partyFilter) return false;
    return true;
  };

  // 유불리 통계 계산
  const allIssues = [...consensus.commonIssues, ...consensus.uniqueIssues.flatMap(u => u.issues)];
  const partyCounts = {
    "발주자 유리": allIssues.filter(i => i.affectedParty === "발주자 유리").length,
    "공급자 유리": allIssues.filter(i => i.affectedParty === "공급자 유리").length,
    "양측 리스크": allIssues.filter(i => i.affectedParty === "양측 리스크").length,
    "불명확": allIssues.filter(i => !i.affectedParty || i.affectedParty === "불명확").length,
  };
  const totalIssues = allIssues.length || 1;

  // 심각도 통계
  const severityCounts = {
    critical: allIssues.filter(i => i.severity === "critical").length,
    danger: allIssues.filter(i => i.severity === "danger").length,
    warning: allIssues.filter(i => i.severity === "warning").length,
    info: allIssues.filter(i => i.severity === "info").length,
  };

  return (
    <div className="space-y-8">
      {/* 합의 요약 대시보드 */}
      <div className={`border rounded-2xl p-6 ${vc.bg}`}>
        <div className="flex items-center gap-3 mb-6">
          <span className={`text-3xl ${vc.color}`}>{vc.icon}</span>
          <div>
            <h2 className={`text-xl font-bold ${vc.color}`}>{vc.label}</h2>
            <p className="text-sm text-gray-400">{vc.desc}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* 합의율 도넛 */}
          <div className="bg-white/5 rounded-xl p-4 flex flex-col items-center">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                <circle
                  cx="40" cy="40" r="32" fill="none"
                  stroke={consensus.consensusRate >= 90 ? "#4ade80" : consensus.consensusRate >= 70 ? "#facc15" : "#f87171"}
                  strokeWidth="8"
                  strokeDasharray={`${consensus.consensusRate * 2.01} 201`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-white">{consensus.consensusRate}%</span>
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-2">합의율</div>
          </div>

          {/* 이슈 수 요약 */}
          <div className="bg-white/5 rounded-xl p-4 flex flex-col justify-center">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">공통 지적</span>
                <span className="font-bold text-white">{consensus.commonIssues.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">개별 의견</span>
                <span className="font-bold text-white">{consensus.uniqueIssues.reduce((s, u) => s + u.issues.length, 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">전체 위험도</span>
                <span className={`font-bold ${riskColors[consensus.overallRiskLevel]}`}>{riskLabels[consensus.overallRiskLevel]}</span>
              </div>
            </div>
          </div>

          {/* 갑/을 유불리 바 차트 */}
          <div className="bg-white/5 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-3">유불리 분석</div>
            <div className="space-y-2">
              {([
                { label: "발주자(갑) 유리", key: "발주자 유리" as const, color: "bg-purple-500", textColor: "text-purple-300" },
                { label: "공급자(을) 유리", key: "공급자 유리" as const, color: "bg-emerald-500", textColor: "text-emerald-300" },
                { label: "양측 리스크", key: "양측 리스크" as const, color: "bg-amber-500", textColor: "text-amber-300" },
              ]).map(({ label, key, color, textColor }) => {
                const count = partyCounts[key];
                const pct = Math.round((count / totalIssues) * 100);
                return (
                  <div key={key} className="group/bar">
                    <div className="flex justify-between text-xs mb-1">
                      <span className={textColor}>{label}</span>
                      <span className="text-gray-400">
                        {count}
                        <span className="opacity-0 group-hover/bar:opacity-100 transition-opacity ml-1 text-white">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden group-hover/bar:h-3 transition-all">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 심각도 분포 */}
          <div className="bg-white/5 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-3">심각도 분포</div>
            <div className="space-y-2">
              {severityCounts.critical > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs text-red-300 flex-1">심각</span>
                  <span className="text-xs font-bold text-white">{severityCounts.critical}</span>
                </div>
              )}
              {severityCounts.danger > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-xs text-orange-300 flex-1">위험</span>
                  <span className="text-xs font-bold text-white">{severityCounts.danger}</span>
                </div>
              )}
              {severityCounts.warning > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-xs text-yellow-300 flex-1">주의</span>
                  <span className="text-xs font-bold text-white">{severityCounts.warning}</span>
                </div>
              )}
              {severityCounts.info > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs text-blue-300 flex-1">참고</span>
                  <span className="text-xs font-bold text-white">{severityCounts.info}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-300 mt-4">{consensus.summary}</p>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 mr-1">심각도:</span>
        {(["all", "critical", "danger", "warning", "info"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSeverityFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              severityFilter === s
                ? "bg-white/10 text-white border-white/30"
                : "text-gray-500 border-gray-700 hover:border-gray-500"
            }`}
          >
            {s === "all" ? "전체" : severityLabels[s]}
          </button>
        ))}
        <span className="text-xs text-gray-500 ml-3 mr-1">유불리:</span>
        {(["all", "발주자 유리", "공급자 유리", "양측 리스크"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPartyFilter(p)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              partyFilter === p
                ? "bg-white/10 text-white border-white/30"
                : "text-gray-500 border-gray-700 hover:border-gray-500"
            }`}
          >
            {p === "all" ? "전체" : p}
          </button>
        ))}
      </div>

      {/* 공통 지적사항 */}
      {consensus.commonIssues.filter(filterIssue).length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-red-400 inline-block" />
            공통 지적사항 (2개 이상 AI 동의)
          </h3>
          <div className="grid gap-3">
            {consensus.commonIssues.filter(filterIssue).map((issue, i) => (
              <IssueCard key={i} issue={issue} index={i} onIssueClick={onIssueClick} />
            ))}
          </div>
        </div>
      )}

      {/* 개별 AI 의견 */}
      {consensus.uniqueIssues.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" />
            개별 AI 의견
          </h3>
          {consensus.uniqueIssues.map((group, i) => {
            const filtered = group.issues.filter(filterIssue);
            if (filtered.length === 0) return null;
            return (
              <div key={i} className="mb-4">
                <h4 className="text-sm font-semibold text-gray-400 mb-2">
                  {group.provider}
                </h4>
                <div className="grid gap-2">
                  {filtered.map((issue, j) => (
                    <IssueCard key={j} issue={issue} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 각 AI 분석 원문 */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-300 transition-colors">
          각 AI 분석 상세 보기 ({analyses.length}개)
        </summary>
        <div className="mt-4 space-y-4">
          {analyses.map((analysis, i) => (
            <div
              key={i}
              className="bg-gray-900 rounded-xl p-4 border border-gray-800"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold">{analysis.provider}</h4>
                <span
                  className={`text-sm ${riskColors[analysis.riskLevel]}`}
                >
                  위험도: {riskLabels[analysis.riskLevel]}
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-3">{analysis.summary}</p>
              <div className="text-xs text-gray-600">
                발견 이슈: {analysis.issues.length}건
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
