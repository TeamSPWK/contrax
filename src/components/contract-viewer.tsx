"use client";

import { useMemo, useRef, useEffect, useCallback } from "react";
import type { ContractIssue } from "@/lib/ai/claude";

interface ContractViewerProps {
  text: string;
  issues: ContractIssue[];
  activeIssueIndex: number | null;
  onIssueClick: (index: number) => void;
}

const severityHighlight: Record<string, string> = {
  critical: "bg-red-500/40 border-b-2 border-red-300 text-red-100",
  danger: "bg-orange-500/35 border-b-2 border-orange-300 text-orange-100",
  warning: "bg-yellow-500/30 border-b-2 border-yellow-300 text-yellow-100",
  info: "bg-blue-500/25 border-b-2 border-blue-300 text-blue-100",
};

interface HighlightSegment {
  text: string;
  issueIndex: number | null;
  severity: string | null;
}

export default function ContractViewer({
  text,
  issues,
  activeIssueIndex,
  onIssueClick,
}: ContractViewerProps) {
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIssueIndex]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!issues.length) return;
    const current = activeIssueIndex ?? -1;
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      const next = Math.min(current + 1, issues.length - 1);
      onIssueClick(next);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      const prev = Math.max(current - 1, 0);
      onIssueClick(prev);
    } else if (e.key === "Escape") {
      onIssueClick(-1);
    }
  }, [activeIssueIndex, issues.length, onIssueClick]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const segments = useMemo(() => {
    if (!issues.length) return [{ text, issueIndex: null, severity: null }];

    // 이슈의 clause에서 핵심 키워드를 추출하여 원문에서 위치 찾기
    const markers: { start: number; end: number; issueIndex: number; severity: string }[] = [];

    const findInText = (clause: string): { start: number; end: number } | null => {
      // 1단계: 전체 clause로 정확 매칭
      let pos = text.indexOf(clause);
      if (pos !== -1) return { start: pos, end: pos + clause.length };

      // 2단계: clause 앞부분 30~60자로 매칭
      for (const len of [60, 40, 30, 20]) {
        const sub = clause.slice(0, len);
        pos = text.indexOf(sub);
        if (pos !== -1) return { start: pos, end: pos + Math.min(clause.length, 200) };
      }

      // 3단계: 핵심 키워드 추출 후 매칭
      // clause에서 한글 단어나 숫자 포함 구문을 추출
      const keywords = clause.match(/[가-힣]{3,}[^,.\s]{0,10}/g) || [];
      for (const kw of keywords) {
        pos = text.indexOf(kw);
        if (pos !== -1) {
          // 키워드 주변 문맥을 포함하여 하이라이트
          const lineStart = text.lastIndexOf("\n", pos);
          const lineEnd = text.indexOf("\n", pos + kw.length);
          return {
            start: lineStart !== -1 ? lineStart + 1 : pos,
            end: lineEnd !== -1 ? lineEnd : Math.min(pos + 150, text.length),
          };
        }
      }

      return null;
    };

    issues.forEach((issue, idx) => {
      if (!issue.clause) return;
      const match = findInText(issue.clause);
      if (match) {
        markers.push({
          ...match,
          issueIndex: idx,
          severity: issue.severity,
        });
      }
    });

    // 위치순 정렬
    markers.sort((a, b) => a.start - b.start);

    // 세그먼트 분리
    const result: HighlightSegment[] = [];
    let cursor = 0;

    for (const marker of markers) {
      if (marker.start > cursor) {
        result.push({ text: text.slice(cursor, marker.start), issueIndex: null, severity: null });
      }
      if (marker.start >= cursor) {
        result.push({
          text: text.slice(marker.start, marker.end),
          issueIndex: marker.issueIndex,
          severity: marker.severity,
        });
        cursor = marker.end;
      }
    }

    if (cursor < text.length) {
      result.push({ text: text.slice(cursor), issueIndex: null, severity: null });
    }

    return result;
  }, [text, issues]);

  const activeIssue = activeIssueIndex !== null ? issues[activeIssueIndex] : null;

  const severityLabels: Record<string, string> = {
    critical: "심각", danger: "위험", warning: "주의", info: "참고",
  };
  const partyColors: Record<string, string> = {
    "발주자 유리": "text-purple-300",
    "공급자 유리": "text-emerald-300",
    "양측 리스크": "text-amber-300",
    "불명확": "text-gray-400",
  };

  return (
    <div className="flex gap-4">
      {/* 원문 */}
      <div className={`bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden ${activeIssue ? "flex-1" : "w-full"}`}>
        <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">계약서 원문</h3>
          <span className="text-xs text-gray-500">
            {issues.filter((i) => i.clause).length}개 조항 하이라이트 — 클릭하여 상세 보기
          </span>
        </div>
        <div className="p-6 overflow-y-auto text-sm leading-relaxed text-gray-300 whitespace-pre-wrap font-mono">
          {segments.map((seg, i) => {
            if (seg.issueIndex === null) {
              return <span key={i}>{seg.text}</span>;
            }

            const isActive = seg.issueIndex === activeIssueIndex;
            const highlight = severityHighlight[seg.severity || "info"];

            const issue = issues[seg.issueIndex];
            const tooltip = issue
              ? `[${severityLabels[issue.severity] || issue.severity}] ${issue.category}${issue.affectedParty ? ` — ${issue.affectedParty}` : ""}`
              : "";

            return (
              <span
                key={i}
                ref={isActive ? activeRef : undefined}
                className={`group/hl relative cursor-pointer rounded-sm px-0.5 transition-all ${highlight} ${
                  isActive ? "ring-2 ring-white/50 scale-[1.01]" : "hover:ring-1 hover:ring-white/30"
                }`}
                onClick={() => onIssueClick(seg.issueIndex!)}
              >
                {seg.text}
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/hl:opacity-100 z-10">
                  {tooltip}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* 이슈 상세 사이드 패널 */}
      {activeIssue && (
        <div className="w-96 shrink-0 bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => activeIssueIndex! > 0 && onIssueClick(activeIssueIndex! - 1)}
                disabled={activeIssueIndex === 0}
                className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                &#9664; 이전
              </button>
              <h3 className="text-sm font-semibold text-gray-300">
                {activeIssueIndex! + 1} / {issues.length}
              </h3>
              <button
                onClick={() => activeIssueIndex! < issues.length - 1 && onIssueClick(activeIssueIndex! + 1)}
                disabled={activeIssueIndex === issues.length - 1}
                className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                다음 &#9654;
              </button>
            </div>
            <button
              onClick={() => onIssueClick(-1)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              닫기
            </button>
          </div>
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                severityHighlight[activeIssue.severity]
              }`}>
                {severityLabels[activeIssue.severity]}
              </span>
              <span className="text-sm font-semibold text-white">{activeIssue.category}</span>
            </div>

            {activeIssue.affectedParty && (
              <div className={`text-sm font-medium ${partyColors[activeIssue.affectedParty] || "text-gray-400"}`}>
                {activeIssue.affectedParty}
              </div>
            )}

            <div>
              <h4 className="text-xs text-gray-500 mb-1">문제점</h4>
              <p className="text-sm text-gray-300">{activeIssue.description}</p>
            </div>

            <div>
              <h4 className="text-xs text-gray-500 mb-1">수정 제안</h4>
              <p className="text-sm text-gray-300">{activeIssue.suggestion}</p>
            </div>

            {activeIssue.revisedText && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs text-green-400 font-semibold">수정 문구</h4>
                  <button
                    onClick={() => navigator.clipboard.writeText(activeIssue.revisedText!)}
                    className="text-xs text-gray-500 hover:text-green-400 transition-colors"
                  >
                    복사
                  </button>
                </div>
                <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {activeIssue.revisedText}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
