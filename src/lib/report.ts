import type { ConsensusAnalysis } from "@/lib/ai/cross-verify";
import type { AIAnalysis, ContractIssue } from "@/lib/ai/claude";

const severityLabels: Record<string, string> = {
  critical: "심각", danger: "위험", warning: "주의", info: "참고",
};

function issueToHtml(issue: ContractIssue, idx: number): string {
  const sev = severityLabels[issue.severity] || issue.severity;
  const party = issue.affectedParty || "";
  const escaped = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let html = `<div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0">`;
  html += `<div><strong>#${idx + 1}</strong> <span style="background:#eee;padding:2px 6px;border-radius:4px;font-size:12px">${escaped(sev)}</span>`;
  html += ` <strong>${escaped(issue.category)}</strong>`;
  if (party) html += ` <span style="color:#666;font-size:12px">${escaped(party)}</span>`;
  html += `</div>`;
  if (issue.clause) html += `<p style="color:#666;font-style:italic;font-size:13px;margin:8px 0">"${escaped(issue.clause.slice(0, 150))}"</p>`;
  html += `<p style="margin:4px 0">${escaped(issue.description)}</p>`;
  html += `<p style="color:#555;font-size:13px"><strong>제안:</strong> ${escaped(issue.suggestion)}</p>`;
  if (issue.revisedText) {
    html += `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px;margin-top:8px">`;
    html += `<div style="font-size:12px;color:#16a34a;font-weight:bold;margin-bottom:4px">수정 문구 제안:</div>`;
    html += `<div style="font-size:13px;white-space:pre-wrap">${escaped(issue.revisedText)}</div></div>`;
  }
  html += `</div>`;
  return html;
}

export function generateReportHtml(
  fileName: string,
  consensus: ConsensusAnalysis,
  analyses: AIAnalysis[],
): string {
  const date = new Date().toLocaleDateString("ko-KR");
  const escaped = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>ContraX 분석 리포트 - ${escaped(fileName)}</title>
<style>
  body{font-family:-apple-system,sans-serif;padding:40px;color:#222;line-height:1.7;max-width:900px;margin:0 auto}
  h1{font-size:24px;margin-bottom:4px;color:#111}
  h2{font-size:18px;margin-top:32px;border-bottom:2px solid #333;padding-bottom:4px}
  .meta{color:#666;font-size:13px;margin-bottom:24px}
  .summary{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0}
  .stat{display:inline-block;text-align:center;padding:8px 16px;margin:4px}
  .stat-value{font-size:24px;font-weight:bold}
  .stat-label{font-size:11px;color:#666}
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid #eee;color:#999;font-size:12px}
  @media print{body{padding:20px}h2{break-before:auto}}
</style></head><body>
<h1>ContraX 계약서 분석 리포트</h1>
<p class="meta">파일: ${escaped(fileName)} | 분석일: ${date} | AI 모델: ${analyses.map(a => escaped(a.provider)).join(", ")}</p>

<div class="summary">
  <div class="stat"><div class="stat-value">${consensus.consensusRate}%</div><div class="stat-label">합의율</div></div>
  <div class="stat"><div class="stat-value">${consensus.commonIssues.length}</div><div class="stat-label">공통 지적</div></div>
  <div class="stat"><div class="stat-value">${consensus.uniqueIssues.reduce((s, u) => s + u.issues.length, 0)}</div><div class="stat-label">개별 의견</div></div>
  <div class="stat"><div class="stat-value" style="color:${consensus.overallRiskLevel === "critical" ? "#dc2626" : consensus.overallRiskLevel === "high" ? "#ea580c" : "#ca8a04"}">${consensus.overallRiskLevel === "critical" ? "심각" : consensus.overallRiskLevel === "high" ? "높음" : consensus.overallRiskLevel === "medium" ? "보통" : "낮음"}</div><div class="stat-label">위험도</div></div>
</div>
<p>${escaped(consensus.summary)}</p>`;

  if (consensus.commonIssues.length > 0) {
    html += `<h2>공통 지적사항 (2개 이상 AI 동의)</h2>`;
    consensus.commonIssues.forEach((issue, i) => {
      html += issueToHtml(issue, i);
    });
  }

  if (consensus.uniqueIssues.length > 0) {
    html += `<h2>개별 AI 의견</h2>`;
    consensus.uniqueIssues.forEach((group) => {
      html += `<h3 style="color:#666;font-size:14px;margin-top:16px">${escaped(group.provider)}</h3>`;
      group.issues.forEach((issue, i) => {
        html += issueToHtml(issue, i);
      });
    });
  }

  html += `<div class="footer">ContraX - AI 계약서 교차검증 시스템<br>본 리포트는 AI 분석 결과이며, 법률 자문을 대체하지 않습니다.</div>`;
  html += `</body></html>`;
  return html;
}
