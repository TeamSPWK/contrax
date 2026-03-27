# ContraX — AI 계약서 교차검증 웹앱

## 프로젝트 개요
PDF/텍스트 계약서를 업로드하면 Claude + GPT + Gemini 3개 AI가 독립 분석 후 교차검증 합의율을 산출하는 웹앱.

## 기술 스택
- Next.js 16 + TypeScript + Tailwind CSS 4
- pdf-parse (PDF 텍스트 추출) + pdfjs-dist (PDF 렌더링)
- CLOVA OCR (스캔 문서)

## 프로젝트 규칙

### R001. UI Lookup 테이블 중앙 집중화
severity/affectedParty/riskLevel의 라벨, 색상 매핑은 **`src/lib/constants.ts` 한 곳에서만 정의**한다. 컴포넌트에서 로컬로 재정의하지 않는다.

### R002. AI 클라이언트 패턴
새 AI 클라이언트 추가 시:
1. 파일: `src/lib/ai/{provider}.ts`
2. 함수: `export async function analyzeWith{Provider}(contractText: string): Promise<AIAnalysis>`
3. 에러: `throw new Error("{Provider} API error: {status} - {body}")`
4. 반환: `parseAIResponse("{Provider명} ({회사명})", text)`
5. 공통 프롬프트: `prompt.ts`의 `CONTRACT_REVIEW_PROMPT` 사용

### R003. SSE 이벤트 스키마
서버-클라이언트 간 SSE 이벤트는 `src/lib/sse-types.ts`의 `SSEEvent` 타입을 따른다. 새 이벤트 추가 시 타입 정의를 먼저 업데이트한다.

## 디렉토리 구조
```
src/
  app/           # Next.js App Router
  lib/ai/        # AI 클라이언트 (claude, openai, gemini, cross-verify, prompt)
  lib/pdf/       # PDF 텍스트 추출
  lib/           # constants, history, report, sse-types
  components/    # React 컴포넌트
docs/
  plans/         # CPS Plan 문서
  designs/       # CPS Design 문서
  verifications/ # 교차검증 결과
  proposals/     # 규칙 제안
```

## Known Mistakes
(없음)
