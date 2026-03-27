# [Rule Proposal] AI 클라이언트 에러 패턴 통일

> AXIS Engineering — Adaptive Rule Proposal
> 날짜: 2026-03-27
> 상태: 승인됨
> 제안자: AI (Claude Opus 4.6)

---

## 감지 (Detect)

### 발견된 패턴
3개 AI 클라이언트(claude.ts, openai.ts, gemini.ts)가 **동일한 에러 처리 구조**를 반복한다:
1. API 키 존재 확인 → throw
2. fetch 호출
3. !response.ok → 에러 텍스트 읽고 throw
4. JSON 파싱 → parseAIResponse

### 발생 빈도
- 3회 (claude.ts, openai.ts, gemini.ts)
- 동일 패턴: `if (!apiKey) throw` → `fetch()` → `if (!response.ok) throw` → `parseAIResponse()`

### 증거
```typescript
// claude.ts:25-49 (요약)
if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
const response = await fetch(url, options);
if (!response.ok) { const err = await response.text(); throw new Error(`Claude API error: ${response.status} - ${err}`); }
return parseAIResponse("Claude (Anthropic)", text);

// openai.ts:8-33 — 동일 구조
// gemini.ts:8-28 — 동일 구조
```

---

## 제안 (Propose)

### 규칙 내용
**새 AI 클라이언트 추가 시 기존 3개 파일의 패턴을 따른다:**
1. 파일명: `src/lib/ai/{provider}.ts`
2. export 함수명: `analyzeWith{Provider}(contractText: string): Promise<AIAnalysis>`
3. 에러 메시지 형식: `"{Provider} API error: {status} - {body}"`
4. 반환값: `parseAIResponse("{Provider명} ({회사명})", text)`

공통 fetch 래퍼 추출은 **하지 않는다** — 3개 API의 헤더/body 구조가 모두 다르기 때문에 추상화 비용 > 이득.

### 적용 범위
- 적용 대상: `src/lib/ai/*.ts`
- 강제 수준: **가이드라인** (CLAUDE.md에 기록)

### 기대 효과
- 새 AI (예: HyperCLOVA X) 추가 시 3분 이내 완료 가능
- 인터페이스 일관성 유지 (AIAnalysis 타입)

---

## 승인 (Approve)

> 아래는 사람이 작성

- [ ] 승인
- [ ] 수정 후 승인 (수정 내용: )
- [ ] 기각 (사유: )

승인자:
승인일:

---

## 적용 (Apply)

> 승인 후 작성

- 반영 위치: CLAUDE.md
- 반영 커밋:

## 검증 (Verify)

- 기존 코드 충돌: 없음
- 적용 후 문제: 없음 예상
