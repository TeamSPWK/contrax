import type { AIAnalysis } from "@/lib/ai/claude";
import type { ConsensusAnalysis } from "@/lib/ai/cross-verify";

export interface AnalysisResult {
  success: boolean;
  fileName: string;
  textLength: number;
  contractText: string;
  analyses: AIAnalysis[];
  consensus: ConsensusAnalysis;
  totalTime: number;
  timestamp: string;
}

export type SSEEvent =
  | { event: "progress"; data: { step: string; message: string; contractText?: string } }
  | { event: "ai_done"; data: { provider: string; elapsed: number; issueCount: number; riskLevel: string } }
  | { event: "ai_error"; data: { provider: string; elapsed: number; error: string } }
  | { event: "result"; data: AnalysisResult }
  | { event: "error"; data: { message: string } };
