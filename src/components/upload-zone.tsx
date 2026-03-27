"use client";

import { useCallback, useState } from "react";

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

export default function UploadZone({
  onFileSelected,
  isLoading,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
        isDragging
          ? "border-blue-400 bg-blue-400/10"
          : "border-gray-700 hover:border-gray-500 bg-gray-900/50"
      } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
    >
      <input
        type="file"
        accept=".pdf,.txt,.html,.png,.jpg,.jpeg,.webp"
        onChange={handleChange}
        className="absolute inset-0 opacity-0 cursor-pointer"
        disabled={isLoading}
      />

      <div className="space-y-4">
        <div className="text-5xl">
          {isLoading ? (
            <div className="inline-block animate-spin">{"\u2699"}</div>
          ) : (
            "\uD83D\uDCC4"
          )}
        </div>

        {isLoading ? (
          <div>
            <p className="text-lg font-semibold text-blue-400">
              3개 AI가 교차검증 중...
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Claude + GPT + Gemini 병렬 분석 진행 중
            </p>
          </div>
        ) : fileName ? (
          <div>
            <p className="text-lg font-semibold text-green-400">
              {fileName}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              다른 파일을 업로드하려면 클릭하거나 드래그하세요
            </p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-semibold">
              계약서를 드래그하거나 클릭하여 업로드
            </p>
            <p className="text-sm text-gray-500 mt-2">
              PDF, TXT, 이미지(PNG/JPG) 지원 | 최대 10MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
