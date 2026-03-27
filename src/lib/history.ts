import type { AIAnalysis } from "@/lib/ai/claude";
import type { ConsensusAnalysis } from "@/lib/ai/cross-verify";

export interface HistoryEntry {
  id: string;
  fileName: string;
  timestamp: string;
  consensusRate: number;
  riskLevel: string;
  issueCount: number;
  verdict: string;
}

export interface HistoryDetail {
  fileName: string;
  textLength: number;
  contractText: string;
  analyses: AIAnalysis[];
  consensus: ConsensusAnalysis;
  totalTime: number;
  timestamp: string;
}

const INDEX_KEY = "contrax_history";
const DETAIL_PREFIX = "contrax_detail_";
const MAX_ENTRIES = 5;

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addHistory(entry: HistoryEntry, detail: HistoryDetail): void {
  const history = getHistory();
  // 중복 제거
  const filtered = history.filter(
    (h) => !(h.fileName === entry.fileName && h.timestamp.slice(0, 10) === entry.timestamp.slice(0, 10))
  );
  // 오래된 디테일 삭제
  if (filtered.length >= MAX_ENTRIES) {
    const removed = filtered.pop();
    if (removed) {
      try { localStorage.removeItem(DETAIL_PREFIX + removed.id); } catch { /* ignore */ }
    }
  }
  filtered.unshift(entry);
  localStorage.setItem(INDEX_KEY, JSON.stringify(filtered));
  // 디테일 저장 (contractText는 용량 절약을 위해 앞 5000자만)
  const saved: HistoryDetail = {
    ...detail,
    contractText: detail.contractText.slice(0, 5000),
  };
  try {
    localStorage.setItem(DETAIL_PREFIX + entry.id, JSON.stringify(saved));
  } catch {
    // localStorage 용량 초과 시 무시
  }
}

export function getHistoryDetail(id: string): HistoryDetail | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DETAIL_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearHistory(): void {
  const history = getHistory();
  for (const h of history) {
    try { localStorage.removeItem(DETAIL_PREFIX + h.id); } catch { /* ignore */ }
  }
  localStorage.removeItem(INDEX_KEY);
}
