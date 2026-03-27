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
  critical: "rgba(239, 68, 68, 0.35)",
  danger: "rgba(249, 115, 22, 0.3)",
  warning: "rgba(234, 179, 8, 0.25)",
  info: "rgba(59, 130, 246, 0.2)",
};

const ACTIVE_BORDER: Record<string, string> = {
  critical: "rgba(239, 68, 68, 0.9)",
  danger: "rgba(249, 115, 22, 0.9)",
  warning: "rgba(234, 179, 8, 0.8)",
  info: "rgba(59, 130, 246, 0.8)",
};

interface HighlightInfo {
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
  const highlightsRef = useRef<HighlightInfo[]>([]);
  const pageWrappersRef = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      if (!containerRef.current) return;
      setLoading(true);
      setError(null);
      pageWrappersRef.current.clear();

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        setPageCount(pdf.numPages);
        containerRef.current.replaceChildren();

        // 페이지별 텍스트 정보 수집
        const allPageTexts: { pageIndex: number; text: string; items: { str: string; x: number; y: number; w: number; h: number }[] }[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });

          // 페이지 wrapper — position: relative로 하이라이트 기준점
          const wrapper = document.createElement("div");
          wrapper.className = "relative mb-2";
          wrapper.setAttribute("data-page", String(i));

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "w-full rounded";

          wrapper.appendChild(canvas);
          containerRef.current?.appendChild(wrapper);
          pageWrappersRef.current.set(i - 1, wrapper);

          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, canvas, viewport } as never).promise;
          }

          // 텍스트 좌표 추출
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
                const w = (item as never as { width: number }).width * scale;
                items.push({ str: item.str, x, y: y - fontSize, w, h: fontSize + 2 });
              }
              pageText += item.str + " ";
            }
          }

          allPageTexts.push({ pageIndex: i - 1, text: pageText, items });
        }

        // 이슈별 하이라이트 위치 계산
        if (issues.length > 0 && !cancelled) {
          const hlResults: HighlightInfo[] = [];

          issues.forEach((issue, issueIdx) => {
            if (!issue.clause) return;

            const searchTerms: string[] = [];
            searchTerms.push(issue.clause.slice(0, 50));
            const keywords = issue.clause.match(/[가-힣]{3,}[^,.\s]{0,8}/g) || [];
            searchTerms.push(...keywords.slice(0, 3));

            for (const pageData of allPageTexts) {
              let found = false;
              for (const term of searchTerms) {
                if (term.length < 3) continue;
                const matchIdx = pageData.text.indexOf(term);
                if (matchIdx === -1) continue;

                let charCount = 0;
                const rects: { x: number; y: number; w: number; h: number }[] = [];
                for (const item of pageData.items) {
                  const itemEnd = charCount + item.str.length + 1;
                  if (itemEnd > matchIdx && charCount < matchIdx + term.length) {
                    rects.push({ ...item });
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

          highlightsRef.current = hlResults;
          // DOM에 하이라이트 삽입
          renderHighlights(hlResults, null);
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

  // 하이라이트를 각 페이지 wrapper 안에 DOM으로 직접 삽입
  const renderHighlights = useCallback((hls: HighlightInfo[], activeIdx: number | null) => {
    // 기존 하이라이트 제거
    document.querySelectorAll("[data-hl]").forEach((el) => el.remove());

    for (const hl of hls) {
      const wrapper = pageWrappersRef.current.get(hl.pageIndex);
      if (!wrapper) continue;

      const canvas = wrapper.querySelector("canvas");
      if (!canvas) continue;
      const scaleX = wrapper.offsetWidth / canvas.width;
      const isActive = hl.issueIndex === activeIdx;
      const color = HIGHLIGHT_COLORS[hl.severity] || HIGHLIGHT_COLORS.info;
      const border = ACTIVE_BORDER[hl.severity] || ACTIVE_BORDER.info;

      hl.rects.forEach((rect, ri) => {
        const div = document.createElement("div");
        div.setAttribute("data-hl", String(hl.issueIndex));
        div.style.cssText = `
          position:absolute;
          left:${rect.x * scaleX}px;
          top:${rect.y * scaleX}px;
          width:${Math.max(rect.w * scaleX, 80)}px;
          height:${rect.h * scaleX + 2}px;
          background:${color};
          border:${isActive ? `2px solid ${border}` : "1px solid transparent"};
          border-radius:2px;
          cursor:pointer;
          z-index:${isActive ? 10 : 5};
          ${isActive ? `box-shadow:0 0 8px ${border};` : ""}
          transition:all 0.2s;
        `;
        div.addEventListener("click", () => onIssueClick?.(hl.issueIndex));
        div.addEventListener("mouseenter", () => {
          div.style.border = `2px solid ${border}`;
        });
        div.addEventListener("mouseleave", () => {
          if (hl.issueIndex !== activeIdx) {
            div.style.border = "1px solid transparent";
          }
        });

        // 첫 번째 rect에만 라벨
        if (ri === 0) {
          const label = document.createElement("div");
          label.style.cssText = `
            position:absolute;top:-22px;left:0;white-space:nowrap;
            background:${border};color:white;font-size:10px;font-weight:600;
            padding:1px 6px;border-radius:3px;
            opacity:${isActive ? "1" : "0"};
            transition:opacity 0.2s;pointer-events:none;
          `;
          label.textContent = hl.label;
          div.appendChild(label);

          div.addEventListener("mouseenter", () => { label.style.opacity = "1"; });
          div.addEventListener("mouseleave", () => {
            if (hl.issueIndex !== activeIdx) label.style.opacity = "0";
          });
        }

        wrapper.appendChild(div);
      });
    }
  }, [onIssueClick]);

  // activeIssueIndex 변경 시 하이라이트 업데이트 + 스크롤
  useEffect(() => {
    renderHighlights(highlightsRef.current, activeIssueIndex);

    if (activeIssueIndex === null) return;
    const hl = highlightsRef.current.find((h) => h.issueIndex === activeIssueIndex);
    if (!hl) return;
    const wrapper = pageWrappersRef.current.get(hl.pageIndex);
    if (wrapper) {
      wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIssueIndex, renderHighlights]);

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-700">
        <span className="text-xs text-gray-400">
          PDF 원본 {highlightsRef.current.length > 0 && `(${highlightsRef.current.length}개 하이라이트)`}
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
      </div>
    </div>
  );
}
