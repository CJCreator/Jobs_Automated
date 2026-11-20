"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface ScoreGaugeProps {
  score: number | string | null | undefined;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function ScoreGauge({
  score,
  size = "md",
  showLabel = true,
  className,
}: ScoreGaugeProps) {
  const numericScore = typeof score === "string" ? parseFloat(score) : (score ?? 0);
  const normalized = Math.max(0, Math.min(5, isNaN(numericScore) ? 0 : numericScore));
  const percentage = (normalized / 5) * 100;

  // Tones
  const tone =
    normalized >= 4.0
      ? { stroke: "#10b981", text: "text-emerald-500", bg: "bg-emerald-500/10", label: "Strong Match" }
      : normalized >= 3.0
        ? { stroke: "#f59e0b", text: "text-amber-500", bg: "bg-amber-500/10", label: "Moderate Fit" }
        : normalized > 0
          ? { stroke: "#ef4444", text: "text-red-500", bg: "bg-red-500/10", label: "Weak Match" }
          : { stroke: "#71717a", text: "text-muted", bg: "bg-muted/10", label: "Unscored" };

  const dim = size === "sm" ? 36 : size === "lg" ? 80 : 54;
  const strokeWidth = size === "sm" ? 3.5 : size === "lg" ? 6 : 4.5;
  const radius = (dim - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-border/60"
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke={tone.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
            fill="transparent"
          />
        </svg>
        <span
          className={cn(
            "absolute font-bold tabular-nums tracking-tighter",
            tone.text,
            size === "sm" ? "text-xs" : size === "lg" ? "text-xl" : "text-sm",
          )}
        >
          {normalized > 0 ? normalized.toFixed(1) : "—"}
        </span>
      </div>

      {showLabel && size !== "sm" && (
        <div className="flex flex-col">
          <span className={cn("text-xs font-semibold leading-none", tone.text)}>
            {tone.label}
          </span>
          <span className="text-[10px] text-muted mt-0.5">Scale: 1.0 – 5.0</span>
        </div>
      )}
    </div>
  );
}

