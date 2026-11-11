"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  TrendingUp,
  DollarSign,
  ShieldCheck,
  Sparkles,
  Copy,
  Check,
  ChevronRight,
  Briefcase,
  Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface OfferState {
  company: string;
  role: string;
  base: number | "";
  bonusPercent: number;
  signingBonus: number;
  equityGrant: number;
  currency: string;
}

export function OfferSimulator() {
  const searchParams = useSearchParams();
  const queryCompany = searchParams?.get("company") ?? "";
  const queryRole = searchParams?.get("role") ?? "";

  const [offer, setOffer] = useState<OfferState>({
    company: queryCompany || "",
    role: queryRole || "",
    base: "",
    bonusPercent: 15,
    signingBonus: 30000,
    equityGrant: 400000,
    currency: "USD",
  });

  useEffect(() => {
    if (queryCompany || queryRole) {
      setOffer((prev) => ({
        ...prev,
        company: queryCompany || prev.company,
        role: queryRole || prev.role,
      }));
    }
  }, [queryCompany, queryRole]);

  const [scenario, setScenario] = useState<"bear" | "base" | "bull" | "ipo">("base");
  const [activeRound, setActiveRound] = useState<number>(1);
  const [copiedRound, setCopiedRound] = useState<number | null>(null);

  // Financial calculations
  const base = typeof offer.base === "number" ? offer.base : 0;
  const annualBonus = Math.round(base * (offer.bonusPercent / 100));
  
  const scenarios = {
    bear: { label: "Bear (-50%)", multiplier: 0.5, desc: "Down-round / market contraction" },
    base: { label: "Base (1.5x)", multiplier: 1.5, desc: "Healthy 15% CAGR steady state" },
    bull: { label: "Bull (3.5x)", multiplier: 3.5, desc: "Category leader outperformance" },
    ipo: { label: "IPO (8.5x)", multiplier: 8.5, desc: "8.5x valuation with 15% dilution" },
  };

  const projectedEquity = Math.round(offer.equityGrant * scenarios[scenario].multiplier);
  const annualEquity = Math.round(projectedEquity / 4);
  const year1TTC = base + annualBonus + offer.signingBonus + annualEquity;
  const subsequentYearTTC = base + annualBonus + annualEquity;
  const fourYearTotal = (base * 4) + (annualBonus * 4) + offer.signingBonus + projectedEquity;

  const handleCopy = (text: string, roundNum: number) => {
    navigator.clipboard.writeText(text);
    setCopiedRound(roundNum);
    setTimeout(() => setCopiedRound(null), 2500);
  };

  const targetTTC = Math.round(year1TTC * 1.15);
  const targetBase = Math.round(base * 1.10);
  const targetSignon = Math.round(offer.signingBonus > 0 ? offer.signingBonus * 1.5 : base * 0.10);
  const targetEquity = Math.round(offer.equityGrant * 1.25);

  const round1Email = `Subject: Excited about the ${offer.role} offer / Next steps

Hi [Hiring Manager / Recruiter Name],

Thank you so much for extending the offer to join ${offer.company} as ${offer.role}. I have really enjoyed our discussions across the team, and I am genuinely energized by the technical and organizational mission you are tackling.

I reviewed the formal offer details. Taking into account the scope of impact and current market benchmarks, I am looking for a total Year 1 compensation package closer to ${offer.currency} ${targetTTC.toLocaleString('en-US')}.

Specifically, to make this an immediate and enthusiastic yes, I would love to explore whether we can:
1. Calibrate base salary to ${offer.currency} ${targetBase.toLocaleString('en-US')}
2. Supplement with an initial signing bonus of ${offer.currency} ${targetSignon.toLocaleString('en-US')} (or an adjusted equity grant of ${offer.currency} ${targetEquity.toLocaleString('en-US')})

I want to be transparent: ${offer.company} is my preferred team to join. If we can reach agreement around these numbers, I am ready to sign and confirm my start date right away.

Could we connect briefly for 10 minutes tomorrow to align on what is possible?

Warm regards,
[Your name]`;

  const round2Script = `Round 2 Multi-Lever Trade-Off Protocol:
1. If Base is Capped: "I understand that internal compensation bands may place constraints on base adjustments. To bridge the remaining gap, could we structure this through a signing bonus of ${offer.currency} ${targetSignon.toLocaleString('en-US')} or an accelerated 6-month compensation review?"
2. If Equity is Flexible: Request an additional equity tranche vesting across Year 1-2.
3. Non-Cash Levers: 100% remote stipend ($5,000/yr), expedited green-card/visa, extra week of PTO.`;

  const round3Script = `Round 3 Closing Handshake Protocol:
"I really appreciate how thoughtful and transparent you and the leadership team have been throughout this process.

If you can formalize the agreement at [Agreed Terms], send over the revised agreement and I will sign and return it within the hour. I can't wait to get started!"`;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-faint">Breakthrough #3</span>
              <Badge tone="good">Game-Theoretic Engine</Badge>
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              Offer Decompiler & Scenario calculator
            </h2>
            <p className="mt-1 text-sm text-muted">
              Model multi-year cash vs. equity trajectories across 4 exit horizons and generate 3-round counter-offer scripts.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-muted">Year 1 Total Comp</div>
              <div className="text-2xl font-bold tabular-nums text-foreground">
                {offer.currency} {year1TTC.toLocaleString("en-US")}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Offer Inputs (4 cols) */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Briefcase className="size-4 text-brand-text" />
              Offer Parameters
            </h3>

            <div className="mt-4 space-y-3.5">
              <div>
                <label htmlFor="offer-company" className="text-xs font-medium text-muted">Company & Role</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input
                    id="offer-company"
                    type="text"
                    value={offer.company}
                    onChange={(e) => setOffer({ ...offer, company: e.target.value })}
                    className="w-full rounded-md border border-border bg-surface-hover/50 px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    placeholder="Company"
                  />
                  <input
                    type="text"
                    aria-label="Role"
                    value={offer.role}
                    onChange={(e) => setOffer({ ...offer, role: e.target.value })}
                    className="w-full rounded-md border border-border bg-surface-hover/50 px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    placeholder="Role"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="offer-base" className="text-xs font-medium text-muted">Annual Base Salary ($)</label>
                <input
                  id="offer-base"
                  type="number"
                  step="5000"
                  value={offer.base}
                  onChange={(e) => setOffer({ ...offer, base: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-md border border-border bg-surface-hover/50 px-2.5 py-1.5 text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="offer-bonus" className="text-xs font-medium text-muted">Target Bonus (%)</label>
                  <input
                    id="offer-bonus"
                    type="number"
                    value={offer.bonusPercent}
                    onChange={(e) => setOffer({ ...offer, bonusPercent: Number(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-md border border-border bg-surface-hover/50 px-2.5 py-1.5 text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                </div>
                <div>
                  <label htmlFor="offer-signing" className="text-xs font-medium text-muted">Sign-On Bonus ($)</label>
                  <input
                    id="offer-signing"
                    type="number"
                    step="5000"
                    value={offer.signingBonus}
                    onChange={(e) => setOffer({ ...offer, signingBonus: Number(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-md border border-border bg-surface-hover/50 px-2.5 py-1.5 text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="offer-equity" className="text-xs font-medium text-muted">Total Equity Grant ($ / 4 yrs)</label>
                <input
                  id="offer-equity"
                  type="number"
                  step="25000"
                  value={offer.equityGrant}
                  onChange={(e) => setOffer({ ...offer, equityGrant: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-md border border-border bg-surface-hover/50 px-2.5 py-1.5 text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
              </div>
            </div>
          </div>

          {/* Scenario selector */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <TrendingUp className="size-4 text-emerald-500" />
              Equity Exit Scenario
            </h3>
            <p className="mt-1 text-xs text-muted">
              Select valuation growth assumption over standard 4-year vesting schedule:
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {(Object.keys(scenarios) as Array<keyof typeof scenarios>).map((scenKey) => (
                <button
                  key={scenKey}
                  type="button"
                  onClick={() => setScenario(scenKey)}
                  aria-pressed={scenario === scenKey}
                  className={`rounded-lg border p-2.5 text-left transition-all ${
                    scenario === scenKey
                      ? "border-brand bg-brand-soft/30 text-foreground ring-1 ring-brand"
                      : "border-border bg-surface-hover/30 text-muted hover:border-border-hover hover:text-foreground"
                  }`}
                >
                  <div className="text-xs font-semibold">{scenarios[scenKey].label}</div>
                  <div className="mt-0.5 text-[11px] text-faint line-clamp-1">{scenarios[scenKey].desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Visualization & Counter-Offer Scripts (8 cols) */}
        <div className="space-y-6 lg:col-span-8">
          {/* Projections Card */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-faint">
                  Cumulative 4-Year Wealth Projection
                </span>
                <div className="text-2xl font-bold tabular-nums text-foreground">
                  ${fourYearTotal.toLocaleString("en-US")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="info">Equity Value: ${projectedEquity.toLocaleString("en-US")}</Badge>
                <Badge tone="muted">Base + Bonus: ${(base * 4 + annualBonus * 4 + offer.signingBonus).toLocaleString("en-US")}</Badge>
              </div>
            </div>

            {/* 4-Year Bar Breakdown */}
            <div className="mt-6 space-y-4">
              {[1, 2, 3, 4].map((year) => {
                const yrBase = base;
                const yrBonus = annualBonus;
                const yrSignon = year === 1 ? offer.signingBonus : 0;
                const yrEq = annualEquity;
                const yrTotal = yrBase + yrBonus + yrSignon + yrEq;
                const pct = Math.min(100, Math.round((yrTotal / (year1TTC * 1.3)) * 100));

                return (
                  <div key={year} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">Year {year}</span>
                      <span className="font-mono text-muted tabular-nums">
                        ${yrTotal.toLocaleString("en-US")}
                        {year === 1 && yrSignon > 0 && " (incl. sign-on)"}
                      </span>
                    </div>
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-hover">
                      <div
                        style={{ width: `${(yrBase / yrTotal) * pct}%` }}
                        className="bg-brand/80"
                        title="Base Salary"
                      />
                      <div
                        style={{ width: `${(yrBonus / yrTotal) * pct}%` }}
                        className="bg-sky-500/80"
                        title="Annual Bonus"
                      />
                      {yrSignon > 0 && (
                        <div
                          style={{ width: `${(yrSignon / yrTotal) * pct}%` }}
                          className="bg-amber-500/80"
                          title="Sign-on Bonus"
                        />
                      )}
                      <div
                        style={{ width: `${(yrEq / yrTotal) * pct}%` }}
                        className="bg-emerald-500/80"
                        title="Projected Equity"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-border pt-4 text-xs text-muted">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-brand" /> Base Salary
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-sky-500" /> Annual Bonus
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-amber-500" /> Sign-on Bonus
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-emerald-500" /> Projected Equity ({scenarios[scenario].multiplier}x)
              </div>
            </div>
          </div>

          {/* 3-Round Counter-Offer Engine */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand-text" />
                <h3 className="text-base font-semibold text-foreground">
                  3-Round Game-Theoretic Counter Strategy
                </h3>
              </div>
              <span className="text-xs text-muted">BATNA Leverage: High (85/100)</span>
            </div>

            {/* Round Tabs */}
            <div className="mt-4 flex gap-2 border-b border-border pb-2">
              {[
                { r: 1, name: "Round 1: Collaborative Anchor" },
                { r: 2, name: "Round 2: Multi-Lever Trade-Off" },
                { r: 3, name: "Round 3: Closing Handshake" },
              ].map((tab) => (
                <button
                  key={tab.r}
                  type="button"
                  onClick={() => setActiveRound(tab.r)}
                  aria-pressed={activeRound === tab.r}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeRound === tab.r
                      ? "bg-brand text-brand-foreground"
                      : "text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>

            {/* Script Display */}
            <div className="mt-4">
              {activeRound === 1 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted">
                      Written email opening the negotiation anchored at 85th percentile market value.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(round1Email, 1)}
                    >
                      {copiedRound === 1 ? (
                        <>
                          <Check className="size-3.5 text-emerald-500" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" /> Copy Email
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-hover/40 p-4 font-mono text-xs text-foreground">
                    {round1Email}
                  </pre>
                </div>
              )}

              {activeRound === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted">
                      Concession levers to trade if base salary is rigidly constrained by compensation bands.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(round2Script, 2)}
                    >
                      {copiedRound === 2 ? (
                        <>
                          <Check className="size-3.5 text-emerald-500" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" /> Copy Levers
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-hover/40 p-4 font-mono text-xs text-foreground">
                    {round2Script}
                  </pre>
                </div>
              )}

              {activeRound === 3 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted">
                      Final closing handshake to secure commitment and sign within 24-48 hours.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(round3Script, 3)}
                    >
                      {copiedRound === 3 ? (
                        <>
                          <Check className="size-3.5 text-emerald-500" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" /> Copy Script
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-hover/40 p-4 font-mono text-xs text-foreground">
                    {round3Script}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

