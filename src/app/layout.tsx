import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ContraX - AI 계약서 교차검증",
  description:
    "Claude, GPT, Gemini 3개 AI가 교차검증하는 계약서 리스크 분석 서비스",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-950 text-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
