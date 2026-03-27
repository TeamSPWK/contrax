# [Design] ContraX — AI 계약서 교차검증 웹앱

> AXIS Engineering — CPS Framework
> 작성일: 2026-03-27
> Plan 문서: `docs/plans/contrax-ai-contract-verification.md`

---

## Context (설계 배경)

### Plan 요약
- 핵심 문제: 계약서 검토의 비용/시간 장벽 + 단일 AI의 신뢰도 한계
- 선택한 방안: Next.js 풀스택 + 3개 AI 병렬 교차검증 + axis-kit 합의 프로토콜

### 설계 원칙
1. **Zero Server Storage**: 계약서 데이터는 서버에 저장하지 않음. 메모리에서만 처리 후 폐기
2. **Fail-Graceful**: 1~2개 AI가 실패해도 나머지로 분석 결과 제공
3. **Stream-First**: 모든 분석 진행상황을 SSE로 실시간 전달
4. **Prompt-as-Contract**: AI 프롬프트의 JSON 스키마가 곧 데이터 계약

---

## Problem (설계 과제)

### 기술적 과제

| # | 과제 | 복잡도 | 의존성 |
|---|------|--------|--------|
| 1 | PDF → 정확한 텍스트 추출 (디지털 + 스캔) | 중간 | 없음 |
| 2 | 3개 AI 병렬 호출 + 개별 실패 격리 | 높음 | #1 |
| 3 | AI 응답 JSON 파싱 안정성 (마크다운 래핑 등) | 중간 | #2 |
| 4 | 카테고리 정규화 + 합의율 산출 알고리즘 | 높음 | #3 |
| 5 | SSE 스트리밍 (단계별 이벤트 전송) | 중간 | #2 |
| 6 | 원문 하이라이트 퍼지 매칭 | 높음 | #3 |
| 7 | 좌우 패널 레이아웃 + 양방향 연동 | 중간 | #6 |
| 8 | PDF.js 원본 렌더링 (Blob URL) | 중간 | 없음 |
| 9 | 중복 요청 방어 (isProcessing 세마포어) | 낮음 | #5 |

### 기존 시스템과의 접점
- **swk-cloud-manage**: AI API 키 관리 (.secret/external/ai-services.md)
- **axis-kit**: /xv 교차검증 방식을 웹앱 내부 합의 알고리즘으로 채택
- **CLOVA OCR**: 스캔 문서 처리용 (NCP API)

---

## Solution (설계 상세)

### 아키텍처

```
Browser (Client)                          Server (Next.js API Route)
┌─────────────────────┐                   ┌──────────────────────────────┐
│ page.tsx             │                   │ POST /api/analyze            │
│ ├─ UploadZone       │──── FormData ────>│ ├─ extractTextFromFile()     │
│ ├─ ProgressBar      │<─── SSE events ──│ ├─ Promise.allSettled([      │
│ ├─ AnalysisResult   │                   │ │   analyzeWithClaude(),     │
│ │  ├─ 대시보드       │                   │ │   analyzeWithGPT(),        │
│ │  ├─ 필터 바        │                   │ │   analyzeWithGemini()      │
│ │  └─ IssueCard[]   │                   │ │ ])                         │
│ ├─ ContractViewer   │                   │ ├─ buildConsensus()          │
│ │  ├─ 하이라이트     │                   │ └─ SSE: result event        │
│ │  └─ 사이드패널     │                   └──────────────────────────────┘
│ └─ PdfViewer        │
│    └─ pdfjs-dist    │
└─────────────────────┘
      │
      ├─ localStorage: history (max 5)
      └─ Blob URL: PDF 원본 렌더링
```

### 데이터 모델

```typescript
// AI 분석 결과
interface AIAnalysis {
  provider: string;                           // "Claude (Anthropic)" | "GPT-5.4 (OpenAI)" | "Gemini (Google)"
  issues: ContractIssue[];
  summary: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  rawResponse: string;
}

// 개별 이슈
interface ContractIssue {
  category: string;                           // "불공정 조항" | "법적 리스크" | ...
  severity: "info" | "warning" | "danger" | "critical";
  affectedParty: "발주자 유리" | "공급자 유리" | "양측 리스크" | "불명확";
  clause: string;                             // 해당 조항 원문 또는 요약
  description: string;
  suggestion: string;
  revisedText?: string;                       // 실제 대체 가능한 수정 문구
}

// 교차검증 합의 결과
interface ConsensusAnalysis {
  consensusRate: number;                      // 0-100
  verdict: "auto_approve" | "human_review" | "redefine";
  commonIssues: ContractIssue[];              // 2개+ AI 동의
  uniqueIssues: { provider: string; issues: ContractIssue[] }[];
  overallRiskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
}

// 로컬 히스토리
interface HistoryEntry {
  id: string;
  fileName: string;
  timestamp: string;                          // ISO 8601
  consensusRate: number;
  riskLevel: string;
  issueCount: number;
  verdict: string;
}
```

### API 설계

| Method | Endpoint | 설명 | Response |
|--------|----------|------|----------|
| POST | `/api/analyze` | 계약서 분석 (SSE) | `text/event-stream` |

#### SSE 이벤트 스키마

| Event | Data | 시점 |
|-------|------|------|
| `progress` | `{step, message, contractText?}` | 텍스트 추출 시작/완료, AI 시작, 합의 시작 |
| `ai_done` | `{provider, elapsed, issueCount, riskLevel}` | 각 AI 분석 완료 |
| `ai_error` | `{provider, elapsed, error}` | AI 호출 실패 |
| `result` | `{success, fileName, analyses, consensus, totalTime, contractText}` | 최종 결과 |
| `error` | `{message}` | 전체 실패 |

#### 요청 제한
- 동시 요청 1개 (isProcessing 세마포어) → 429 반환
- 파일 크기 최대 10MB
- 허용 MIME: `application/pdf`, `text/plain`, `text/html`, `image/png`, `image/jpeg`, `image/webp`

### 핵심 로직

#### 1. 교차검증 합의 알고리즘

```
입력: 3개 AI의 ContractIssue[] 배열

1. 모든 이슈를 카테고리별로 정규화 (normalizeCategory)
   - "불공정 조항" → "unfair", "법적 리스크" → "legal_risk" 등
   - 한글 동의어 매핑으로 AI 간 표현 차이 흡수

2. 카테고리별 그룹화 (categoryMap)
   - 각 카테고리에 어떤 provider가 지적했는지 추적

3. 공통/고유 이슈 분류
   - providers.size >= 2 → 공통 이슈 (severity 가장 높은 것 대표)
   - providers.size == 1 → 고유 이슈 (provider별 분류)

4. 합의율 = (공통 카테고리 수 / 전체 카테고리 수) × 100

5. 판정
   - >= 90% → auto_approve
   - >= 70% → human_review
   - < 70%  → redefine
```

#### 2. 원문 하이라이트 3단계 퍼지 매칭

```
입력: clause (AI가 반환한 조항 텍스트), text (원문 전체)

1단계: 정확 매칭 — text.indexOf(clause)
2단계: 부분 매칭 — clause 앞부분 60/40/30/20자로 검색
3단계: 키워드 매칭 — clause에서 한글 3글자+ 키워드 추출 → 원문에서 검색
        → 매칭되면 해당 줄 전체를 하이라이트 범위로 설정
```

#### 3. PDF 텍스트 추출 분기

```
입력: Buffer, mimeType

PDF → pdf-parse PDFParse 클래스 → getText()
  └─ 텍스트 < 50자 → CLOVA OCR로 폴백
TXT/HTML → buffer.toString("utf-8")
이미지 → CLOVA OCR (base64 → API)
기타 → Error
```

### 에러 처리

| 에러 상황 | 대응 |
|----------|------|
| AI API 호출 실패 (1~2개) | Fail-Graceful: 성공한 AI만으로 분석. 실패한 AI는 SSE `ai_error` 이벤트 |
| AI API 호출 실패 (3개 전부) | SSE `error` 이벤트 + "모든 AI 분석이 실패했습니다" |
| AI 응답 JSON 파싱 실패 | rawResponse를 summary로 대체, issues=[] |
| PDF 텍스트 추출 < 20자 | 400 에러 "텍스트를 추출할 수 없습니다" |
| 파일 크기 > 10MB | 400 에러 |
| 중복 요청 | 429 에러 "이미 분석이 진행 중입니다" |
| 클라이언트 타임아웃 | AbortController 120초 → "분석 시간 초과" |
| CLOVA OCR 미설정 | 스캔 문서에서 "OCR 키가 설정되지 않았습니다" 에러 |

---

## 검증 계약 (Verification Contract)

### 기능 검증 조건

| # | 조건 | 우선순위 |
|---|------|---------|
| 1 | PDF 파일 업로드 시 텍스트가 추출되고 SSE `extracted` 이벤트가 전송되어야 한다 | Critical |
| 2 | 3개 AI 병렬 호출 시 각 완료/실패가 SSE `ai_done`/`ai_error` 이벤트로 전달되어야 한다 | Critical |
| 3 | 1개 AI가 실패해도 나머지 2개 결과로 합의율이 산출되어야 한다 | Critical |
| 4 | 공통 지적사항은 2개 이상 AI가 동의한 이슈만 포함해야 한다 | Critical |
| 5 | 각 이슈에 affectedParty(유불리)와 severity(심각도)가 표시되어야 한다 | Critical |
| 6 | 합의율 90%+ → auto_approve, 70-89% → human_review, <70% → redefine 판정이어야 한다 | Critical |
| 7 | 원문 뷰어에서 문제 조항이 색상 하이라이트되어야 한다 | Critical |
| 8 | 하이라이트 클릭 시 사이드패널에 이슈 상세가 표시되어야 한다 | Critical |
| 9 | 분석 결과에서 이슈 클릭 시 원문 탭으로 전환 + 해당 조항 스크롤이 되어야 한다 | Critical |
| 10 | 심각도/유불리 필터 선택 시 해당 조건의 이슈만 표시되어야 한다 | Critical |
| 11 | PDF 원본이 좌측 패널에 렌더링되어야 한다 | Critical |
| 12 | 리포트 저장 버튼 클릭 시 HTML 파일이 다운로드되어야 한다 | Critical |
| 13 | 분석 완료 시 로컬 히스토리에 저장되어야 한다 (최대 5개) | Nice-to-have |
| 14 | 키보드 j/k로 이슈 탐색, Esc로 패널 닫기가 동작해야 한다 | Nice-to-have |
| 15 | 이전/다음 버튼으로 이슈 간 순회가 가능해야 한다 | Nice-to-have |
| 16 | 수정 문구의 "복사" 버튼 클릭 시 클립보드에 복사되어야 한다 | Nice-to-have |
| 17 | 10MB 초과 파일 업로드 시 에러 메시지가 표시되어야 한다 | Nice-to-have |
| 18 | 분석 중 중복 업로드 시 429 에러가 반환되어야 한다 | Nice-to-have |

### 역방향 검증 체크리스트
- [x] Plan의 MECE 7개 문제 영역이 모두 설계에 반영되었는가?
  - 문서 처리 → PDF 텍스트 추출 분기 로직
  - AI 분석 정확도 → 3개 AI 병렬 호출 + Fail-Graceful
  - 합의 알고리즘 → normalizeCategory + consensusRate 산출
  - 유불리 판단 → affectedParty 필드 + 필터링
  - 수정 제안 → revisedText 필드 + 복사 버튼
  - 사용자 경험 → SSE 스트리밍 + 좌우 패널 + 필터 + 키보드
  - 결과 활용 → HTML 리포트 + localStorage 히스토리
- [x] 설계의 각 컴포넌트가 Plan의 문제를 해결하는가? (위 매핑 참조)
- [x] 에러 시나리오가 모두 처리되었는가? (에러 처리 테이블 참조)

### 평가 기준
- **기능**: 검증 조건 18개 중 Critical 12개가 모두 동작하는가?
- **설계 품질**: AI 클라이언트가 공통 인터페이스(AIAnalysis)로 통일되고, 새 AI 추가 시 파일 1개만 추가하면 되는가?
- **단순성**: 합의 알고리즘이 카테고리 정규화 → 그룹화 → 비율 계산의 3단계로 완결되는가?
