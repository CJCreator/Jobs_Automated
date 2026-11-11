"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Calendar,
  ExternalLink,
  FileText,
  MapPin,
  MoreVertical,
  ArrowRight,
  CheckCircle2,
  Inbox,
  Send,
  UserCheck,
  Award,
  Archive,
  Compass,
  TrendingUp,
} from "lucide-react";
import type { Application } from "@/lib/career-ops";
import { canonStatus, scoreTone } from "@/lib/format";
import { CompanyLogo } from "@/components/company-logo";
import { Badge } from "@/components/ui/badge";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { Drawer } from "@/components/ui/drawer";
import { useToast } from "@/components/ui/toast";
import { saveStatus } from "@/lib/pipeline-status.mjs";
import { postingHref } from "@/lib/posting-url.mjs";
import { cn } from "@/lib/cn";

export interface KanbanColumnDef {
  id: string;
  label: string;
  statuses: string[];
  targetStatus: string;
  icon: React.ElementType;
  tone: "neutral" | "sky" | "amber" | "emerald" | "purple" | "zinc";
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  {
    id: "evaluated",
    label: "Evaluated / Inbox",
    statuses: ["Evaluated", "evaluada", "condicional", "hold", "evaluar"],
    targetStatus: "Evaluated",
    icon: Inbox,
    tone: "neutral",
  },
  {
    id: "applied",
    label: "Applied",
    statuses: ["Applied", "aplicado", "enviada", "aplicada", "sent"],
    targetStatus: "Applied",
    icon: Send,
    tone: "sky",
  },
  {
    id: "screening",
    label: "Screening & Assessment",
    statuses: ["Responded", "Assessment", "screening", "online assessment"],
    targetStatus: "Assessment",
    icon: UserCheck,
    tone: "amber",
  },
  {
    id: "interview",
    label: "Interview Loop",
    statuses: ["Interview", "entrevista", "mülakat"],
    targetStatus: "Interview",
    icon: Compass,
    tone: "purple",
  },
  {
    id: "offer",
    label: "Offer & Hired",
    statuses: ["Offer", "Hired", "oferta"],
    targetStatus: "Offer",
    icon: Award,
    tone: "emerald",
  },
  {
    id: "archive",
    label: "Archive",
    statuses: ["Rejected", "Discarded", "SKIP", "rechazado"],
    targetStatus: "Rejected",
    icon: Archive,
    tone: "zinc",
  },
];

export function KanbanBoard({
  applications,
  hasCv,
  onStatusChange,
}: {
  applications: Application[];
  hasCv: Set<string>;
  onStatusChange?: (n: string, nextStatus: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [draggedApp, setDraggedApp] = React.useState<Application | null>(null);
  const [dragOverCol, setDragOverCol] = React.useState<string | null>(null);
  const [selectedApp, setSelectedApp] = React.useState<Application | null>(null);
  const [cardMenuOpen, setCardMenuOpen] = React.useState<string | null>(null);

  // Group applications into columns
  const columnData = React.useMemo(() => {
    const map = new Map<string, Application[]>();
    KANBAN_COLUMNS.forEach((c) => map.set(c.id, []));

    for (const app of applications) {
      const canonical = canonStatus(app.status || "Evaluated").toLowerCase();
      let matchedCol = KANBAN_COLUMNS.find((c) =>
        c.statuses.some((s) => s.toLowerCase() === canonical),
      );

      // Fallback matching
      if (!matchedCol) {
        if (canonical.includes("hire") || canonical.includes("offer")) {
          matchedCol = KANBAN_COLUMNS.find((c) => c.id === "offer");
        } else if (canonical.includes("interview")) {
          matchedCol = KANBAN_COLUMNS.find((c) => c.id === "interview");
        } else if (canonical.includes("assess") || canonical.includes("screen") || canonical.includes("respond")) {
          matchedCol = KANBAN_COLUMNS.find((c) => c.id === "screening");
        } else if (canonical.includes("apply") || canonical.includes("sent")) {
          matchedCol = KANBAN_COLUMNS.find((c) => c.id === "applied");
        } else if (canonical.includes("reject") || canonical.includes("skip") || canonical.includes("discard")) {
          matchedCol = KANBAN_COLUMNS.find((c) => c.id === "archive");
        } else {
          matchedCol = KANBAN_COLUMNS[0];
        }
      }

      if (matchedCol) {
        map.get(matchedCol.id)?.push(app);
      }
    }
    return map;
  }, [applications]);

  const moveApplication = React.useCallback(
    async (app: Application, targetColId: string) => {
      const targetCol = KANBAN_COLUMNS.find((c) => c.id === targetColId);
      if (!targetCol) return;
      const nextStatus = targetCol.targetStatus;
      if (app.status === nextStatus) return;

      onStatusChange?.(app.n, nextStatus);

      try {
        await saveStatus(app.n, app.status, nextStatus);
        toast({
          title: "Status updated",
          description: `${app.company} moved to ${nextStatus}`,
          variant: "success",
        });
        router.refresh();
      } catch (err: any) {
        toast({
          title: "Update failed",
          description: err.message || "Could not move status",
          variant: "error",
        });
        router.refresh();
      }
    },
    [onStatusChange, router, toast],
  );

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-6 pt-2 snap-x select-none">
        {KANBAN_COLUMNS.map((col) => {
          const items = columnData.get(col.id) || [];
          const isOver = dragOverCol === col.id;
          const Icon = col.icon;

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverCol !== col.id) setDragOverCol(col.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCol(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCol(null);
                if (draggedApp) {
                  moveApplication(draggedApp, col.id);
                  setDraggedApp(null);
                }
              }}
              className={cn(
                "flex h-[75vh] min-w-[300px] max-w-[340px] flex-1 flex-col rounded-2xl border bg-surface/35 p-3 backdrop-blur-xs transition-colors duration-150",
                isOver ? "border-brand/60 bg-brand/5 shadow-inner" : "border-border/80",
              )}
            >
              {/* Column Header */}
              <div className="mb-3 flex items-center justify-between px-1.5 py-1">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex size-6 items-center justify-center rounded-lg border",
                      col.tone === "sky" && "border-sky-500/30 bg-sky-500/10 text-sky-500",
                      col.tone === "amber" && "border-amber-500/30 bg-amber-500/10 text-amber-500",
                      col.tone === "purple" && "border-purple-500/30 bg-purple-500/10 text-purple-500",
                      col.tone === "emerald" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
                      col.tone === "zinc" && "border-border bg-surface-hover text-muted",
                      col.tone === "neutral" && "border-border bg-surface text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {col.label}
                  </h3>
                </div>
                <span className="rounded-full border border-border bg-surface/70 px-2 py-0.5 text-[11px] font-bold text-muted tabular-nums">
                  {items.length}
                </span>
              </div>

              {/* Column Cards Container */}
              <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
                {items.length === 0 ? (
                  <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 p-4 text-center">
                    <p className="text-xs text-faint">No applications</p>
                    <p className="mt-1 text-[11px] text-faint/70">Drag cards here</p>
                  </div>
                ) : (
                  items.map((app) => {
                    const tailoredCvExists = hasCv.has(app.n);
                    const reportNum = app.report?.match(/#?(\d+)/)?.[1] || app.n;
                    const isDragging = draggedApp?.n === app.n;

                    return (
                      <div
                        key={app.n}
                        draggable
                        onDragStart={(e) => {
                          setDraggedApp(app);
                          e.dataTransfer.setData("text/plain", app.n);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggedApp(null);
                          setDragOverCol(null);
                        }}
                        onClick={() => setSelectedApp(app)}
                        className={cn(
                          "group relative cursor-grab rounded-xl border border-border/80 bg-surface p-3.5 shadow-xs transition-all duration-150 hover:border-brand/40 hover:shadow-md active:cursor-grabbing",
                          isDragging && "opacity-40 scale-95 border-brand ring-2 ring-brand/30",
                        )}
                      >
                        {/* Card Header: Logo, Company & Menu */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <CompanyLogo name={app.company} size={24} />
                            <div className="min-w-0">
                              <h4 className="truncate text-xs font-semibold text-foreground group-hover:text-brand-text">
                                {app.company}
                              </h4>
                              <p className="truncate text-[11px] text-muted">
                                {app.role || "Untitled Role"}
                              </p>
                            </div>
                          </div>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCardMenuOpen(cardMenuOpen === app.n ? null : app.n);
                              }}
                              className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground"
                              aria-label="Card options"
                            >
                              <MoreVertical className="size-3.5" />
                            </button>

                            {/* Dropdown Quick Move Menu */}
                            {cardMenuOpen === app.n && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-border bg-surface p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95"
                              >
                                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-faint">
                                  Move to Stage
                                </div>
                                {KANBAN_COLUMNS.map((target) => (
                                  <button
                                    key={target.id}
                                    type="button"
                                    onClick={() => {
                                      moveApplication(app, target.id);
                                      setCardMenuOpen(null);
                                    }}
                                    className={cn(
                                      "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-left transition-colors",
                                      target.id === col.id
                                        ? "bg-brand/10 font-medium text-brand-text"
                                        : "hover:bg-surface-hover text-muted hover:text-foreground",
                                    )}
                                  >
                                    <span>{target.label}</span>
                                    {target.id === col.id && (
                                      <CheckCircle2 className="size-3" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Badges / Metrics Row */}
                        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5">
                          <div className="flex items-center gap-1.5">
                            {app.score ? (
                              <Badge tone={scoreTone(app.score)} className="text-[10px]">
                                {app.score}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-faint">Unscored</span>
                            )}
                            {tailoredCvExists && (
                              <span
                                title="Tailored CV ready"
                                className="inline-flex items-center gap-0.5 rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-text"
                              >
                                <FileText className="size-2.5" /> CV
                              </span>
                            )}
                          </div>

                          <span className="text-[10px] text-faint tabular-nums">
                            {app.date}
                          </span>
                        </div>

                        {/* Location / Meta info */}
                        {app.location && (
                          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-faint truncate">
                            <MapPin className="size-2.5 shrink-0" />
                            <span className="truncate">{app.location}</span>
                          </div>
                        )}

                        {/* Offer Negotiation Quick Action */}
                        {(col.id === "offer" || app.status?.toLowerCase().includes("offer")) && (
                          <Link
                            href={`/negotiation?company=${encodeURIComponent(app.company)}&role=${encodeURIComponent(app.role || "")}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          >
                            <TrendingUp className="size-3" /> Negotiate Offer
                          </Link>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Slide-over Job Details Drawer */}
      <Drawer
        open={Boolean(selectedApp)}
        onClose={() => setSelectedApp(null)}
        title={
          selectedApp && (
            <div className="flex items-center gap-3">
              <CompanyLogo name={selectedApp.company} size={36} />
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {selectedApp.company}
                </h3>
                <p className="text-xs text-muted">{selectedApp.role}</p>
              </div>
            </div>
          )
        }
        description={selectedApp ? `Tracker Row #${selectedApp.n} · Date: ${selectedApp.date}` : undefined}
        footer={
          selectedApp && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {postingHref(selectedApp.url) && (
                  <a
                    href={postingHref(selectedApp.url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-hover"
                  >
                    Job Ad <ExternalLink className="size-3" />
                  </a>
                )}
                {selectedApp.status?.toLowerCase().includes("offer") && (
                  <Link
                    href={`/negotiation?company=${encodeURIComponent(selectedApp.company)}&role=${encodeURIComponent(selectedApp.role || "")}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:bg-emerald-500/20"
                  >
                    <TrendingUp className="size-3" /> Negotiate
                  </Link>
                )}
              </div>

              <Link
                href={`/pipeline/${selectedApp.report?.match(/#?(\d+)/)?.[1] || selectedApp.n}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-200"
              >
                Open Full Report <ArrowRight className="size-3.5" />
              </Link>
            </div>
          )
        }
      >
        {selectedApp && (
          <div className="space-y-5">
            {/* Score & Status Highlight Card */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface/60 p-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-faint">
                  Match Score
                </div>
                <div className="mt-1">
                  <ScoreGauge score={selectedApp.score} size="md" />
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-faint">
                  Current Status
                </div>
                <div className="mt-1">
                  <Badge tone="good" className="text-xs px-2.5 py-1">
                    {selectedApp.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Quick Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-border/80 bg-surface/40 p-3">
                <span className="text-[10px] text-faint block">Location</span>
                <span className="font-medium text-foreground mt-0.5 block">
                  {selectedApp.location || "Not specified"}
                </span>
              </div>
              <div className="rounded-lg border border-border/80 bg-surface/40 p-3">
                <span className="text-[10px] text-faint block">Channel / Via</span>
                <span className="font-medium text-foreground mt-0.5 block">
                  {selectedApp.via || "Direct"}
                </span>
              </div>
              <div className="rounded-lg border border-border/80 bg-surface/40 p-3">
                <span className="text-[10px] text-faint block">Follow-up Date</span>
                <span className="font-medium text-foreground mt-0.5 block">
                  {selectedApp.followUp || "—"}
                </span>
              </div>
              <div className="rounded-lg border border-border/80 bg-surface/40 p-3">
                <span className="text-[10px] text-faint block">Tailored CV</span>
                <span className="font-medium text-foreground mt-0.5 block">
                  {hasCv.has(selectedApp.n) ? "✓ Generated" : "Not yet generated"}
                </span>
              </div>
            </div>

            {/* Notes Section */}
            {selectedApp.notes && (
              <div className="rounded-xl border border-border/80 bg-surface/40 p-4">
                <h4 className="text-xs font-semibold text-foreground mb-1.5">
                  Tracker Notes
                </h4>
                <p className="text-xs text-muted whitespace-pre-wrap leading-relaxed">
                  {selectedApp.notes}
                </p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
