import { NextRequest } from "next/server";
import { extractTextFromFile } from "@/lib/pdf/extract";
import { analyzeWithClaude } from "@/lib/ai/claude";
import { analyzeWithGPT } from "@/lib/ai/openai";
import { analyzeWithGemini } from "@/lib/ai/gemini";
import { buildConsensus } from "@/lib/ai/cross-verify";
import type { AIAnalysis } from "@/lib/ai/claude";
import { appendFileSync, writeFileSync } from "fs";

const LOG_FILE = "/tmp/contrax.log";
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { appendFileSync(LOG_FILE, line); } catch { /* ignore */ }
}

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

const ALLOWED_TYPES = [
  "application/pdf", "text/plain", "text/html",
  "image/png", "image/jpeg", "image/webp",
];

export const maxDuration = 120;

let isProcessing = false;

export async function POST(request: NextRequest) {
  // Validation — isProcessing 변경 전에 처리
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return errorResponse("파일이 업로드되지 않았습니다.", 400);
  if (file.size > 10 * 1024 * 1024) return errorResponse("파일 크기가 10MB를 초과합니다.", 400);
  if (!ALLOWED_TYPES.includes(file.type)) return errorResponse(`지원하지 않는 파일 형식입니다. (${file.type})`, 400);
  if (isProcessing) return errorResponse("이미 분석이 진행 중입니다. 완료 후 다시 시도해주세요.", 429);

  isProcessing = true;
  const fileName = file.name;
  const buffer = Buffer.from(await file.arrayBuffer());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        writeFileSync(LOG_FILE, "");

        // Step 1: 텍스트 추출
        send("progress", { step: "extract", message: "계약서 텍스트 추출 중..." });
        log(`파일: ${fileName} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)`);

        const contractText = await extractTextFromFile(buffer, file.type);
        log(`텍스트 추출 완료: ${contractText.length}자`);

        if (contractText.trim().length < 20) {
          send("error", { message: "계약서에서 충분한 텍스트를 추출할 수 없습니다." });
          return;
        }

        send("progress", {
          step: "extracted",
          message: `텍스트 추출 완료 (${contractText.length.toLocaleString()}자)`,
          contractText,
        });

        // Step 2: 3개 AI 병렬 분석
        send("progress", { step: "ai_start", message: "3개 AI 교차검증 시작..." });
        log("3개 AI 교차검증 시작...");
        const startTime = Date.now();

        const aiPromises = [
          { name: "Claude", fn: analyzeWithClaude },
          { name: "GPT-5.4", fn: analyzeWithGPT },
          { name: "Gemini", fn: analyzeWithGemini },
        ].map(async ({ name, fn }) => {
          try {
            const result = await fn(contractText);
            const elapsed = Date.now() - startTime;
            log(`${name} 완료 (${elapsed}ms) — 이슈: ${result.issues.length}건`);
            send("ai_done", {
              provider: name,
              elapsed,
              issueCount: result.issues.length,
              riskLevel: result.riskLevel,
            });
            return result;
          } catch (err) {
            const elapsed = Date.now() - startTime;
            log(`${name} 실패 (${elapsed}ms): ${err instanceof Error ? err.message : err}`);
            send("ai_error", {
              provider: name,
              elapsed,
              error: err instanceof Error ? err.message : "알 수 없는 오류",
            });
            return null;
          }
        });

        const results = await Promise.all(aiPromises);
        const analyses = results.filter((r): r is AIAnalysis => r !== null);

        if (analyses.length === 0) {
          send("error", { message: "모든 AI 분석이 실패했습니다." });
          return;
        }

        // Step 3: 합의 분석
        send("progress", { step: "consensus", message: "교차검증 합의 분석 중..." });
        const consensus = buildConsensus(analyses);
        const totalTime = Date.now() - startTime;
        log(`교차검증 완료 — 합의율: ${consensus.consensusRate}%, 판정: ${consensus.verdict}`);

        // Step 4: 최종 결과
        send("result", {
          success: true,
          fileName,
          textLength: contractText.length,
          contractText,
          analyses,
          consensus,
          totalTime,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        log(`에러: ${err instanceof Error ? err.message : String(err)}`);
        send("error", {
          message: err instanceof Error ? err.message : "분석 중 오류가 발생했습니다.",
        });
      } finally {
        isProcessing = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
