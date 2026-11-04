"use client";

import { useState } from "react";
import { ShieldCheck, AlertTriangle, Ghost, HelpCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface ForensicSignalItem {
  code: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskContribution: number;
  message: string;
}

interface GhostJobBadgeProps {
  probability?: number;
  tier?: "HIGH_CONFIDENCE" | "MODERATE_CONFIDENCE" | "ELEVATED_GHOST_RISK" | "PROBABLE_GHOST";
  signals?: ForensicSignalItem[];
  daysPosted?: number;
  repostCount?: number;
  className?: string;
}

export function GhostJobBadge({
  probability = 88,
  tier = "HIGH_CONFIDENCE",
  signals = [],
  daysPosted,
  repostCount,
  className = "",
}: GhostJobBadgeProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Determine badge tone and icon
  let tone: "good" | "warn" | "bad" | "info" = "good";
  let Icon = ShieldCheck;
  let label = `${probability}% Legit`;

  if (tier === "PROBABLE_GHOST" || probability < 30) {
    tone = "bad";
    Icon = Ghost;
    label = `${probability}% Ghost Risk`;
  } else if (tier === "ELEVATED_GHOST_RISK" || probability < 50) {
    tone = "warn";
    Icon = AlertTriangle;
    label = `${probability}% Stale / Risk`;
  } else if (tier === "MODERATE_CONFIDENCE" || probability < 75) {
    tone = "info";
    Icon = ShieldCheck;
    label = `${probability}% Active`;
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className={`group inline-flex items-center gap-1.5 transition-transform hover:scale-105 focus:outline-none ${className}`}
        title="Click to view hiring legitimacy forensics"
      >
        <Badge tone={tone} className="flex items-center gap-1 py-0.5 px-2 font-mono text-[11px]">
          <Icon className="size-3" />
          <span>{label}</span>
        </Badge>
      </button>

      {/* Forensic Inspection Modal / Popover */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-0">
          <div
            className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`flex size-8 items-center justify-center rounded-lg ${
                    tone === "good"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : tone === "warn"
                      ? "bg-amber-500/10 text-amber-500"
                      : "bg-red-500/10 text-red-500"
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Hiring Legitimacy Forensics
                  </h4>
                  <p className="text-xs text-muted">
                    True Hiring Probability:{" "}
                    <span className="font-semibold text-foreground">{probability}%</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-surface-hover/40 p-3 text-xs">
              <div>
                <span className="text-faint">Requisition Age:</span>{" "}
                <span className="font-semibold text-foreground">
                  {daysPosted !== undefined ? `${daysPosted} days` : "Recent"}
                </span>
              </div>
              <div>
                <span className="text-faint">Repost Count:</span>{" "}
                <span className="font-semibold text-foreground">
                  {repostCount !== undefined ? `${repostCount} times` : "0 (Fresh)"}
                </span>
              </div>
            </div>

            {/* Signal Details */}
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-muted">Forensic Indicators:</div>
              {signals.length === 0 ? (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs text-emerald-800 dark:text-emerald-400">
                  No ghost job anomalies detected. Immediate active hiring velocity confirmed.
                </div>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {signals.map((sig, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border border-border bg-surface-hover/30 p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span className="text-faint">{sig.code}</span>
                        <span
                          className={
                            sig.severity === "CRITICAL" || sig.severity === "HIGH"
                              ? "text-red-500"
                              : "text-amber-500"
                          }
                        >
                          +{sig.riskContribution}% Risk
                        </span>
                      </div>
                      <p className="mt-1 text-foreground">{sig.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="w-full rounded-md bg-surface-hover py-1.5 text-xs font-medium text-foreground hover:bg-border"
              >
                Close Forensics Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
