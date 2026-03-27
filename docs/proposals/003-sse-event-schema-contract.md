# [Rule Proposal] SSE 이벤트 스키마 계약

> AXIS Engineering — Adaptive Rule Proposal
> 날짜: 2026-03-27
> 상태: 제안됨
> 제안자: AI (Claude Opus 4.6)

---

## 감지 (Detect)

### 발견된 패턴
SSE 이벤트 타입과 데이터 구조가 **서버(route.ts)와 클라이언트(page.tsx)에서 문자열로만 약속**되어 있다. 타입이 없어서 이벤트명 오타나 필드 불일치가 런타임에서만 발견된다.

### 발생 빈도
- 서버 send() 호출: 8회 (route.ts)
- 클라이언트 handleSSEEvent switch: 5개 case (page.tsx)
- 이벤트명 "progress", "ai_done", "ai_error", "result", "error" — 모두 string 리터럴

### 증거
```typescript
// route.ts — 서버에서 전송
send("progress", { step: "extract", ... });
send("ai_done", { provider, elapsed, issueCount, riskLevel });

// page.tsx — 클라이언트에서 수신
case "ai_done": {
  const provider = (data.provider as string).toLowerCase();
  const elapsed = data.elapsed as number;  // type assertion 의존
```

---

## 제안 (Propose)

### 규칙 내용
**SSE 이벤트명과 데이터 구조를 공유 타입으로 정의한다.**

`src/lib/sse-types.ts`:
```typescript
export type SSEEvent =
  | { event: "progress"; data: { step: string; message: string; contractText?: string } }
  | { event: "ai_done"; data: { provider: string; elapsed: number; issueCount: number; riskLevel: string } }
  | { event: "ai_error"; data: { provider: string; elapsed: number; error: string } }
  | { event: "result"; data: AnalysisData }
  | { event: "error"; data: { message: string } };
```

서버 send()와 클라이언트 handleSSEEvent가 이 타입을 참조하여 컴파일 타임에 불일치를 감지.

### 적용 범위
- 적용 대상: `src/app/api/analyze/route.ts`, `src/app/page.tsx`
- 강제 수준: **권장** (타입 정의만 추가, 기존 코드는 점진적 적용)

### 기대 효과
- 이벤트 추가/변경 시 서버-클라이언트 불일치를 컴파일 타임에 감지
- `as string`, `as number` 등 type assertion 제거 가능

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

- 반영 위치: `src/lib/sse-types.ts` (신규)
- 반영 커밋:

## 검증 (Verify)

- 기존 코드 충돌: 없음 — 타입 추가만으로 기존 로직에 영향 없음
- 적용 후 문제: 없음 예상
