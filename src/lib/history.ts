export interface HistoryEntry {
  id: string;
  fileName: string;
  timestamp: string;
  consensusRate: number;
  riskLevel: string;
  issueCount: number;
  verdict: string;
}

const STORAGE_KEY = "contrax_history";
const MAX_ENTRIES = 5;

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addHistory(entry: HistoryEntry): void {
  const history = getHistory();
  // 중복 제거 (같은 파일명 + 같은 날짜)
  const filtered = history.filter(
    (h) => !(h.fileName === entry.fileName && h.timestamp.slice(0, 10) === entry.timestamp.slice(0, 10))
  );
  filtered.unshift(entry);
  if (filtered.length > MAX_ENTRIES) filtered.length = MAX_ENTRIES;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
