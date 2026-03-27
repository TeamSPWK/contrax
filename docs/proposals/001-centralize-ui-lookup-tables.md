# [Rule Proposal] UI Lookup 테이블 중앙 집중화

> AXIS Engineering — Adaptive Rule Proposal
> 날짜: 2026-03-27
> 상태: 승인됨
> 제안자: AI (Claude Opus 4.6)

---

## 감지 (Detect)

### 발견된 패턴
severity/affectedParty/riskLevel에 대한 라벨, 색상, 아이콘 매핑 테이블이 **여러 컴포넌트에서 독립적으로 중복 정의**되어 있다.

### 발생 빈도
- **severityLabels**: 3회 (analysis-result.tsx, contract-viewer.tsx, report.ts)
- **partyColors**: 2회 (analysis-result.tsx, contract-viewer.tsx)
- **severityColors/Highlight**: 2회 (analysis-result.tsx, contract-viewer.tsx)
- **riskLabels/Colors**: 중앙화 완료 (constants.ts) — 하지만 analysis-result.tsx에서 alias로 재참조

### 증거
```typescript
// src/components/analysis-result.tsx:20
const severityLabels: Record<string, string> = {
  info: "참고", warning: "주의", danger: "위험", critical: "심각",
};

// src/components/contract-viewer.tsx:140
const severityLabels: Record<string, string> = {
  critical: "심각", danger: "위험", warning: "주의", info: "참고",
};

// src/lib/report.ts:4
const severityLabels: Record<string, string> = {
  critical: "심각", danger: "위험", warning: "주의", info: "참고",
};
```

---

## 제안 (Propose)

### 규칙 내용
**도메인 라벨/색상 매핑은 `src/lib/constants.ts` 한 곳에서만 정의한다.**

constants.ts에 다음을 추가:
- `SEVERITY_LABELS` — severity → 한글 라벨
- `SEVERITY_COLORS` — severity → Tailwind 클래스 (카드용)
- `SEVERITY_HIGHLIGHT` — severity → Tailwind 클래스 (하이라이트용)
- `PARTY_COLORS` — affectedParty → Tailwind 클래스

각 컴포넌트는 이를 import하여 사용한다. 로컬에서 재정의하지 않는다.

### 적용 범위
- 적용 대상: `src/components/*.tsx`, `src/lib/*.ts` 전체
- 강제 수준: **가이드라인** (린터로 강제하기 어려움, CLAUDE.md에 기록)

### 기대 효과
- 라벨 변경 시 1곳만 수정하면 전체 반영 (현재 3곳 수정 필요)
- 라벨 불일치 버그 방지 (순서 차이 등)
- 새 severity/party 추가 시 누락 방지

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

- 반영 위치: `src/lib/constants.ts` + CLAUDE.md
- 반영 커밋:

## 검증 (Verify)

- 기존 코드 충돌: 없음 — risk 계열은 이미 중앙화됨, severity/party만 추가
- 적용 후 문제: 없음 예상
