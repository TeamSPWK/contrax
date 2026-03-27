"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ContractIssue } from "@/lib/ai/claude";
import { SEVERITY_LABELS } from "@/lib/constants";

interface PdfViewerProps {
  fileUrl: string;
  issues?: ContractIssue[];
  activeIssueIndex?: number | null;
  onIssueClick?: (index: number) => void;
}

const HIGHLIGHT_COLORS: Record<string, string> = {
  critical: "rgba(239, 68, 68, 0.3)",
  danger: "rgba(249, 115, 22, 0.3)",
  warning: "rgba(234, 179, 8, 0.25)",
  info: "rgba(59, 130, 246, 0.2)",
};

const ACTIVE_BORDER: Record<string, string> = {
  critical: "rgba(239, 68, 68, 0.8)",
  danger: "rgba(249, 115, 22, 0.8)",
  warning: "rgba(234, 179, 8, 0.7)",
  info: "rgba(59, 130, 246, 0.7)",
};

interface HighlightRect {
  pageIndex: number;
  rects: { x: number; y: number; w: number; h: number }[];
  issueIndex: number;
  severity: string;
  label: string;
}

export default function PdfViewer({
  fileUrl,
  issues = [],
  activeIssueIndex = null,
  onIssueClick,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<HighlightRect[]>([]);
  const pageWrappersRef = useRef<HTMLDivElement[]>([]);

  // PDF 렌더링 + 텍스트 위치 추출
  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      if (!containerRef.current) return;
      setLoading(true);
      setError(null);
      pageWrappersRef.current = [];

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        setPageCount(pdf.numPages);
        containerRef.current.replaceChildren();

        const allPageTexts: { pageIndex: number; text: string; items: { str: string; x: number; y: number; w: number; h: number }[] }[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });

          const wrapper = document.createElement("div");
          wrapper.className = "relative mb-2";
          wrapper.setAttribute("data-page", String(i));
          wrapper.style.width = `${viewport.width}px`;
          wrapper.style.maxWidth = "100%";

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "w-full rounded";

          wrapper.appendChild(canvas);
          containerRef.current?.appendChild(wrapper);
          pageWrappersRef.current.push(wrapper);

          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, canvas, viewport } as never).promise;
          }

          // 텍스트 위치 추출
          const textContent = await page.getTextContent();
          const items: { str: string; x: number; y: number; w: number; h: number }[] = [];
          let pageText = "";

          for (const item of textContent.items) {
            if ("str" in item && item.str) {
              const tx = (item as never as { transform: number[] }).transform;
              if (tx) {
                const x = tx[4] * scale;
                const y = viewport.height - tx[5] * scale;
                const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]) * scale;
                items.push({
                  str: item.str,
                  x,
                  y: y - fontSize,
                  w: (item as never as { width: number }).width * scale,
                  h: fontSize + 4,
                });
              }
              pageText += item.str + " ";
            }
          }

          allPageTexts.push({ pageIndex: i - 1, text: pageText, items });
        }

        // 이슈별 하이라이트 위치 계산
        if (issues.length > 0) {
          const hlResults: HighlightRect[] = [];

          issues.forEach((issue, issueIdx) => {
            if (!issue.clause) return;

            // clause에서 검색 키워드 추출 (앞 40자 또는 핵심 한글 키워드)
            const searchTerms: string[] = [];
            const shortClause = issue.clause.slice(0, 50);
            searchTerms.push(shortClause);

            const keywords = issue.clause.match(/[가-힣]{3,}[^,.\s]{0,8}/g) || [];
            searchTerms.push(...keywords.slice(0, 3));

            for (const pageData of allPageTexts) {
              let found = false;

              for (const term of searchTerms) {
                if (term.length < 3) continue;
                const matchIdx = pageData.text.indexOf(term);
                if (matchIdx === -1) continue;

                // 매칭된 텍스트 아이템들의 rect 수집
                let charCount = 0;
                const rects: { x: number; y: number; w: number; h: number }[] = [];

                for (const item of pageData.items) {
                  const itemEnd = charCount + item.str.length + 1;
                  if (itemEnd > matchIdx && charCount < matchIdx + term.length) {
                    rects.push({ x: item.x, y: item.y, w: item.w, h: item.h });
                  }
                  charCount = itemEnd;
                }

                if (rects.length > 0) {
                  hlResults.push({
                    pageIndex: pageData.pageIndex,
                    rects,
                    issueIndex: issueIdx,
                    severity: issue.severity,
                    label: `#${issueIdx + 1} ${SEVERITY_LABELS[issue.severity] || ""} ${issue.category}`,
                  });
                  found = true;
                  break;
                }
              }

              if (found) break;
            }
          });

          if (!cancelled) setHighlights(hlResults);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "PDF를 로드할 수 없습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    renderPdf();
    return () => { cancelled = true; };
  }, [fileUrl, issues]);

  // 활성 이슈 변경 시 해당 페이지로 스크롤
  useEffect(() => {
    if (activeIssueIndex === null) return;
    const hl = highlights.find((h) => h.issueIndex === activeIssueIndex);
    if (!hl) return;
    const wrapper = pageWrappersRef.current[hl.pageIndex];
    if (wrapper) {
      wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIssueIndex, highlights]);

  // 페이지 관찰
  useEffect(() => {
    const container = containerRef.current?.parentElement;
    if (!container || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const page = entry.target.getAttribute("data-page");
            if (page) setCurrentPage(Number(page));
          }
        }
      },
      { root: container, threshold: 0.5 }
    );

    containerRef.current?.querySelectorAll("[data-page]").forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [loading]);

  const handleHighlightClick = useCallback(
    (issueIndex: number) => {
      onIssueClick?.(issueIndex);
    },
    [onIssueClick]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-700">
        <span className="text-xs text-gray-400">
          PDF 원본 {highlights.length > 0 && `(${highlights.length}개 하이라이트)`}
        </span>
        {pageCount > 0 && (
          <span className="text-xs text-gray-500">{currentPage} / {pageCount} 페이지</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 bg-gray-900">
        {loading && (
          <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
            PDF 렌더링 중...
          </div>
        )}
        {error && (
          <div className="text-red-400 text-sm p-4">{error}</div>
        )}
        <div ref={containerRef} />

        {/* 하이라이트 오버레이 */}
        {!loading && highlights.map((hl, hlIdx) => {
          const wrapper = pageWrappersRef.current[hl.pageIndex];
          if (!wrapper) return null;

          const isActive = hl.issueIndex === activeIssueIndex;
          const color = HIGHLIGHT_COLORS[hl.severity] || HIGHLIGHT_COLORS.info;
          const border = ACTIVE_BORDER[hl.severity] || ACTIVE_BORDER.info;

          return hl.rects.map((rect, ri) => {
            // wrapper 기준 상대 위치로 변환
            const wrapperRect = wrapper.getBoundingClientRect();
            const containerRect = containerRef.current?.parentElement?.getBoundingClientRect();
            if (!containerRect) return null;

            const scaleX = wrapper.offsetWidth / (wrapper.firstElementChild as HTMLCanvasElement)?.width || 1;

            return (
              <div
                key={`${hlIdx}-${ri}`}
                onClick={() => handleHighlightClick(hl.issueIndex)}
                className="absolute cursor-pointer transition-all group/phl"
                style={{
                  left: `${wrapper.offsetLeft + rect.x * scaleX + 12}px`,
                  top: `${wrapper.offsetTop + rect.y * scaleX}px`,
                  width: `${Math.max(rect.w * scaleX, 100)}px`,
                  height: `${rect.h * scaleX + 2}px`,
                  backgroundColor: color,
                  border: isActive ? `2px solid ${border}` : "1px solid transparent",
                  borderRadius: "2px",
                  zIndex: isActive ? 10 : 5,
                  boxShadow: isActive ? `0 0 8px ${border}` : "none",
                }}
              >
                {/* 라벨 툴팁 */}
                {ri === 0 && (
                  <div
                    className={`absolute -top-6 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium shadow-lg transition-opacity ${
                      isActive ? "opacity-100" : "opacity-0 group-hover/phl:opacity-100"
                    }`}
                    style={{
                      backgroundColor: border,
                      color: "white",
                    }}
                  >
                    {hl.label}
                  </div>
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
