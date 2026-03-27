"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import UploadZone from "@/components/upload-zone";
import AnalysisResult from "@/components/analysis-result";
import ProgressBar, { type ProgressStep } from "@/components/progress-bar";
import ContractViewer from "@/components/contract-viewer";
import PdfViewer from "@/components/pdf-viewer";
import { generateReportHtml } from "@/lib/report";
import { getHistory, addHistory, getHistoryDetail, type HistoryEntry } from "@/lib/history";
import type { ConsensusAnalysis } from "@/lib/ai/cross-verify";
import type { AIAnalysis } from "@/lib/ai/claude";
import { RISK_LABELS, RISK_COLORS } from "@/lib/constants";

interface AnalysisData {
  success: boolean;
  fileName: string;
  textLength: number;
  contractText: string;
  analyses: AIAnalysis[];
  consensus: ConsensusAnalysis;
  totalTime: number;
  timestamp: string;
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [activeIssueIndex, setActiveIssueIndex] = useState<number | null>(null);
  const [leftTab, setLeftTab] = useState<"pdf" | "text">("pdf");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const contractTextRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const updateStep = useCallback(
    (id: string, updates: Partial<ProgressStep>) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    []
  );

  async function handleFileSelected(file: File) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    // PDF URL 생성
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    if (file.type === "application/pdf") {
      setPdfUrl(URL.createObjectURL(file));
    } else {
      setPdfUrl(null);
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setActiveIssueIndex(null);
    setLeftTab("pdf");

    const initialSteps: ProgressStep[] = [
      { id: "extract", label: "텍스트 추출", status: "active" },
      { id: "claude", label: "Claude 분석", status: "pending" },
      { id: "gpt", label: "GPT-5.4 분석", status: "pending" },

      { id: "gemini", label: "Gemini 분석", status: "pending" },
      { id: "consensus", label: "합의 분석", status: "pending" },
    ];
    setSteps(initialSteps);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "분석 중 오류가 발생했습니다.");
        setIsLoading(false);
        setSteps([]);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("스트림을 읽을 수 없습니다.");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 표준: 이벤트는 \n\n으로 구분
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          let eventName = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventName = line.slice(7);
            else if (line.startsWith("data: ")) dataStr = line.slice(6);
          }
          if (eventName && dataStr) {
            try {
              const data = JSON.parse(dataStr);
              handleSSEEvent(eventName, data, file.name);
            } catch {
              console.warn("[SSE] JSON parse failed for event:", eventName, dataStr.slice(0, 100));
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("분석이 취소되었습니다.");
      } else {
        setError(err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleSSEEvent(event: string, data: Record<string, unknown>, fileName: string) {
    switch (event) {
      case "progress": {
        const step = data.step as string;
        if (step === "extract") updateStep("extract", { status: "active" });
        else if (step === "extracted") {
          contractTextRef.current = (data.contractText as string) || "";
          updateStep("extract", { status: "done", detail: `${(data.message as string).match(/[\d,]+/)?.[0] || ""}자` });
          updateStep("claude", { status: "active" });
          updateStep("gpt", { status: "active" });
          updateStep("gemini", { status: "active" });
        } else if (step === "consensus") updateStep("consensus", { status: "active" });
        break;
      }
      case "ai_done": {
        const provider = (data.provider as string).toLowerCase();
        const elapsed = data.elapsed as number;
        const count = data.issueCount as number;
        let stepId = "claude";
        if (provider.includes("gpt")) stepId = "gpt";
        else if (provider.includes("gemini")) stepId = "gemini";
        updateStep(stepId, { status: "done", detail: `${count}건 (${(elapsed / 1000).toFixed(1)}s)` });
        break;
      }
      case "ai_error": {
        const provider = (data.provider as string).toLowerCase();
        let stepId = "claude";
        if (provider.includes("gpt")) stepId = "gpt";
        else if (provider.includes("gemini")) stepId = "gemini";
        updateStep(stepId, { status: "error", detail: data.error as string });
        break;
      }
      case "result": {
        const analysisResult = data as unknown as AnalysisData;
        analysisResult.contractText = analysisResult.contractText || contractTextRef.current;
        const consensus = analysisResult.consensus;
        updateStep("consensus", { status: "done", detail: `${consensus.consensusRate}%` });
        setResult(analysisResult);
        // 히스토리 저장
        const entry: HistoryEntry = {
          id: Date.now().toString(),
          fileName,
          timestamp: new Date().toISOString(),
          consensusRate: consensus.consensusRate,
          riskLevel: consensus.overallRiskLevel,
          issueCount: consensus.commonIssues.length,
          verdict: consensus.verdict,
        };
        addHistory(entry, {
          fileName: analysisResult.fileName,
          textLength: analysisResult.textLength,
          contractText: analysisResult.contractText,
          analyses: analysisResult.analyses,
          consensus: analysisResult.consensus,
          totalTime: analysisResult.totalTime,
          timestamp: analysisResult.timestamp,
        });
        setHistory(getHistory());
        break;
      }
      case "error": {
        setError(data.message as string);
        setSteps((prev) => prev.map((s) => s.status === "active" ? { ...s, status: "error" } : s));
        break;
      }
    }
  }

  function handleLoadHistory(id: string) {
    const detail = getHistoryDetail(id);
    if (!detail) {
      setError("저장된 분석 결과를 찾을 수 없습니다.");
      return;
    }
    setResult({
      success: true,
      fileName: detail.fileName,
      textLength: detail.textLength,
      contractText: detail.contractText,
      analyses: detail.analyses,
      consensus: detail.consensus,
      totalTime: detail.totalTime,
      timestamp: detail.timestamp,
    });
    setPdfUrl(null); // 원본 PDF는 없음
    setLeftTab("text");
    setError(null);
    setSteps([]);
  }

  function handleDownloadReport() {
    if (!result) return;
    const html = generateReportHtml(result.fileName, result.consensus, result.analyses);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ContraX_리포트_${result.fileName.replace(/\.[^.]+$/, "")}_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allIssues = result ? result.consensus.commonIssues : [];

  // ── 랜딩 (결과 없음) ──
  if (!result && !isLoading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-16">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold tracking-tight">
            Contra<span className="text-blue-400">X</span>
          </h1>
          <p className="text-gray-400 mt-3 text-lg">AI 계약서 교차검증 시스템</p>
          <p className="text-gray-600 mt-1 text-sm">
            Claude + GPT + Gemini 3개 AI가 독립적으로 분석하고 합의율을 산출합니다
          </p>
        </header>

        <UploadZone onFileSelected={handleFileSelected} isLoading={false} />

        {error && (
          <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">{error}</div>
        )}

        {/* 히스토리 */}
        {history.length > 0 && (
          <div className="mt-12">
            <h3 className="text-sm font-semibold text-gray-500 mb-3">최근 분석 기록</h3>
            <div className="grid gap-2">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => handleLoadHistory(h.id)}
                  className="flex items-center gap-4 bg-gray-900/50 rounded-xl px-4 py-3 border border-gray-800 hover:border-blue-500/40 hover:bg-gray-800/50 transition-colors w-full text-left"
                >
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-200">{h.fileName}</span>
                    <span className="text-xs text-gray-600 ml-2">{new Date(h.timestamp).toLocaleDateString("ko-KR")}</span>
                  </div>
                  <span className="text-sm font-bold text-white">{h.consensusRate}%</span>
                  <span className={`text-xs ${RISK_COLORS[h.riskLevel] || "text-gray-400"}`}>
                    {RISK_LABELS[h.riskLevel] || "보통"}
                  </span>
                  <span className="text-xs text-gray-600">{h.issueCount}건</span>
                  <span className="text-xs text-gray-600">불러오기</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
            <div className="text-3xl mb-3 text-blue-400 font-bold">1</div>
            <h3 className="font-semibold mb-2">문서 업로드</h3>
            <p className="text-sm text-gray-500">PDF, 텍스트, 이미지 업로드 시 자동 텍스트 추출</p>
          </div>
          <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
            <div className="text-3xl mb-3 text-purple-400 font-bold">2</div>
            <h3 className="font-semibold mb-2">3개 AI 병렬 분석</h3>
            <p className="text-sm text-gray-500">Claude, GPT, Gemini가 독립적으로 리스크 분석</p>
          </div>
          <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
            <div className="text-3xl mb-3 text-green-400 font-bold">3</div>
            <h3 className="font-semibold mb-2">교차검증 합의</h3>
            <p className="text-sm text-gray-500">AI 합의율 산출 + 수정 문구 제안</p>
          </div>
        </div>

        <footer className="mt-16 text-center text-xs text-gray-600">
          ContraX는 AI 기반 참고 도구이며, 법률 자문을 대체하지 않습니다.
        </footer>
      </main>
    );
  }

  // ── 분석 중 (로딩) ──
  if (isLoading) {
    return (
      <main className="h-screen flex">
        {/* 좌측: PDF 미리보기 */}
        <div className="w-1/2 border-r border-gray-800 flex flex-col">
          {pdfUrl ? (
            <PdfViewer fileUrl={pdfUrl} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              PDF 미리보기 불가
            </div>
          )}
        </div>
        {/* 우측: 진행상황 */}
        <div className="w-1/2 flex flex-col items-center justify-center p-8">
          <h2 className="text-xl font-bold mb-6">
            Contra<span className="text-blue-400">X</span> 분석 중
          </h2>
          <div className="w-full max-w-md">
            <ProgressBar steps={steps} />
          </div>
        </div>
      </main>
    );
  }

  // ── 결과 화면 (풀와이드 좌우 패널) ──
  if (!result) return null;
  return (
    <main className="h-screen flex flex-col">
      {/* 상단 바 */}
      <header className="flex items-center gap-4 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <h1 className="text-lg font-bold">
          Contra<span className="text-blue-400">X</span>
        </h1>
        <span className="text-sm text-gray-400">{result.fileName}</span>
        <span className="text-xs text-gray-600">
          합의율 <span className="text-white font-bold">{result.consensus.consensusRate}%</span>
        </span>
        <span className={`text-xs ${RISK_COLORS[result.consensus.overallRiskLevel]}`}>
          위험도: {RISK_LABELS[result.consensus.overallRiskLevel] || "보통"}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleDownloadReport}
          className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-300 border border-gray-700 hover:text-white hover:border-gray-500 transition-colors"
        >
          리포트 저장
        </button>
        <button
          onClick={() => { setResult(null); setError(null); setSteps([]); }}
          className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-300 border border-gray-700 hover:text-white hover:border-gray-500 transition-colors"
        >
          새 분석
        </button>
      </header>

      {/* 좌우 패널 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: PDF / 원문 */}
        <div className="w-1/2 border-r border-gray-800 flex flex-col overflow-hidden">
          {/* 좌측 탭 */}
          <div className="flex gap-1 px-3 py-2 bg-gray-900/80 border-b border-gray-800">
            {pdfUrl && (
              <button
                onClick={() => setLeftTab("pdf")}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  leftTab === "pdf" ? "bg-blue-500/20 text-blue-400" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                PDF 원본
              </button>
            )}
            <button
              onClick={() => setLeftTab("text")}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                leftTab === "text" ? "bg-blue-500/20 text-blue-400" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              텍스트 + 하이라이트
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {leftTab === "pdf" && pdfUrl ? (
              <PdfViewer
                fileUrl={pdfUrl}
                issues={allIssues}
                activeIssueIndex={activeIssueIndex}
                onIssueClick={(idx) => setActiveIssueIndex(idx)}
              />
            ) : (
              <div className="h-full overflow-y-auto">
                <ContractViewer
                  text={result.contractText}
                  issues={allIssues}
                  activeIssueIndex={activeIssueIndex}
                  onIssueClick={(idx) => setActiveIssueIndex(idx === -1 ? null : idx)}
                />
              </div>
            )}
          </div>
        </div>

        {/* 우측: 분석 결과 */}
        <div className="w-1/2 overflow-y-auto p-6" id="print-area">
          <AnalysisResult
            result={result as never}
            onIssueClick={(idx) => {
              setActiveIssueIndex(idx);
              setLeftTab(pdfUrl ? "pdf" : "text");
            }}
          />
        </div>
      </div>
    </main>
  );
}
