"use client";

import { useEffect, useState } from "react";
import { Bot, Sparkles, CheckCircle2, Activity, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

type AgentEvent = {
  id: string;
  timestamp: string;
  agent: string;
  type: string;
  payload: Record<string, any>;
};

const AGENT_LIST = [
  { id: "JobDiscoveryAgent", name: "Job Discovery", role: "Reverse-ATS Radar" },
  { id: "AtsScoringAgent", name: "ATS Scorer", role: "5-Dimension Fit Gate" },
  { id: "ResumeOptimizationAgent", name: "Resume Tailor", role: "AST Fact Verifier" },
  { id: "CoverLetterAgent", name: "Cover Letter", role: "Executive Narrative" },
  { id: "RecruiterResearchAgent", name: "Recruiter Intel", role: "Panel & Culture Intel" },
  { id: "InterviewCoachAgent", name: "Interview Coach", role: "STAR Story Sparring" },
  { id: "SalaryNegotiationAgent", name: "Salary Negotiator", role: "Comp & Equity Modeler" },
  { id: "ApplicationTrackingAgent", name: "Pipeline Tracker", role: "Atomic Ledger Sync" },
];

export function AgentStatusHud() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/agents/events?limit=8");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      // Non-blocking fetch
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 10_000);
    return () => clearInterval(interval);
  }, []);

  const latestAgent = events[events.length - 1]?.agent;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
            <Bot className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Multi-Agent System</h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                Active Blackboard
              </span>
            </div>
            <p className="text-xs text-muted">8 specialized agents operating autonomously via event bus</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
            title="Refresh events"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
          >
            {expanded ? "Collapse" : "Inspect Agents"}
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {AGENT_LIST.map((agent) => {
              const isActive = latestAgent === agent.id;
              return (
                <div
                  key={agent.id}
                  className={`rounded-lg border p-2.5 transition-all ${
                    isActive
                      ? "border-brand bg-brand-soft/20 text-foreground"
                      : "border-border/60 bg-surface-hover/30 text-muted"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{agent.name}</span>
                    <span
                      className={`size-1.5 rounded-full ${
                        isActive ? "animate-pulse bg-brand" : "bg-muted/40"
                      }`}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-faint">{agent.role}</p>
                </div>
              );
            })}
          </div>

          {events.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Live Blackboard Telemetry
              </span>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-pre-bg p-2 font-mono text-[11px] space-y-1">
                {events.slice().reverse().map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-muted">
                    <span className="font-semibold text-brand-text">{e.agent}</span>
                    <span className="text-faint">{e.type}</span>
                    <span className="text-[9px] text-faint">
                      {new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

