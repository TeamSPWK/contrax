"use client";

export interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

interface ProgressBarProps {
  steps: ProgressStep[];
}

const statusStyles: Record<string, string> = {
  pending: "bg-gray-700 text-gray-500",
  active: "bg-blue-500/20 text-blue-400 border-blue-500/50 animate-pulse",
  done: "bg-green-500/20 text-green-400 border-green-500/50",
  error: "bg-red-500/20 text-red-400 border-red-500/50",
};

const statusIcons: Record<string, string> = {
  pending: "\u25CB",
  active: "\u25CF",
  done: "\u2713",
  error: "\u2718",
};

export default function ProgressBar({ steps }: ProgressBarProps) {
  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div
          key={step.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${statusStyles[step.status]}`}
        >
          <span className="text-lg font-mono w-6 text-center">
            {statusIcons[step.status]}
          </span>
          <div className="flex-1">
            <span className="text-sm font-medium">{step.label}</span>
            {step.detail && (
              <span className="text-xs opacity-70 ml-2">{step.detail}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
