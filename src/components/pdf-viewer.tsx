"use client";

import { useEffect, useRef, useState } from "react";

interface PdfViewerProps {
  fileUrl: string;
}

export default function PdfViewer({ fileUrl }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      if (!containerRef.current) return;
      setLoading(true);
      setError(null);

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        setPageCount(pdf.numPages);
        containerRef.current.replaceChildren();

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });

          const wrapper = document.createElement("div");
          wrapper.className = "relative mb-2";
          wrapper.setAttribute("data-page", String(i));

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "w-full rounded";

          wrapper.appendChild(canvas);
          containerRef.current?.appendChild(wrapper);

          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, canvas, viewport } as never).promise;
          }
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
  }, [fileUrl]);

  useEffect(() => {
    const container = containerRef.current?.parentElement;
    if (!container) return;

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
        <span className="text-xs text-gray-400">PDF 원본</span>
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
