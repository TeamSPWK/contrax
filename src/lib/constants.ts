// ── Risk Level ──
export const RISK_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  critical: "심각",
};

export const RISK_COLORS: Record<string, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

// ── Severity ──
export const SEVERITY_LABELS: Record<string, string> = {
  info: "참고",
  warning: "주의",
  danger: "위험",
  critical: "심각",
};

export const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-500/25 text-blue-200 border-blue-400/40",
  warning: "bg-yellow-500/25 text-yellow-200 border-yellow-400/40",
  danger: "bg-orange-500/30 text-orange-200 border-orange-400/50",
  critical: "bg-red-500/30 text-red-200 border-red-400/50",
};

export const SEVERITY_HIGHLIGHT: Record<string, string> = {
  critical: "bg-red-500/40 border-b-2 border-red-300 text-red-100",
  danger: "bg-orange-500/35 border-b-2 border-orange-300 text-orange-100",
  warning: "bg-yellow-500/30 border-b-2 border-yellow-300 text-yellow-100",
  info: "bg-blue-500/25 border-b-2 border-blue-300 text-blue-100",
};

// ── Affected Party ──
export const PARTY_COLORS: Record<string, string> = {
  "발주자 유리": "bg-purple-500/30 text-purple-200 font-semibold",
  "공급자 유리": "bg-emerald-500/30 text-emerald-200 font-semibold",
  "양측 리스크": "bg-amber-500/30 text-amber-200 font-semibold",
  "불명확": "bg-gray-500/25 text-gray-300",
};

export const PARTY_TEXT_COLORS: Record<string, string> = {
  "발주자 유리": "text-purple-300",
  "공급자 유리": "text-emerald-300",
  "양측 리스크": "text-amber-300",
  "불명확": "text-gray-400",
};
