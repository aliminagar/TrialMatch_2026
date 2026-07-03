"use client";

import { Search } from "lucide-react";

import type { AggregateVerdict } from "@/lib/types";
import {
  AGGREGATE_ORDER,
  type TrialSort,
  type VerdictFilter,
} from "@/lib/trialViews";
import { cn } from "@/lib/utils";

const selectClass =
  "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-fg outline-none focus:border-accent-strong";

function verdictLabel(v: AggregateVerdict): string {
  return v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function phaseLabel(p: string): string {
  return p.replace(/_/g, " ").replace(/PHASE/g, "Phase ").replace(/\s+/g, " ").trim();
}

export interface TrialControlsProps {
  sort: TrialSort;
  onSort: (s: TrialSort) => void;
  verdict: VerdictFilter;
  onVerdict: (v: VerdictFilter) => void;
  phase: string;
  onPhase: (p: string) => void;
  query: string;
  onQuery: (q: string) => void;
  phases: string[];
  presentVerdicts: AggregateVerdict[];
}

export function TrialControls({
  sort,
  onSort,
  verdict,
  onVerdict,
  phase,
  onPhase,
  query,
  onQuery,
  phases,
  presentVerdicts,
}: TrialControlsProps) {
  const verdictTabs: VerdictFilter[] = [
    "ALL",
    ...AGGREGATE_ORDER.filter((v) => presentVerdicts.includes(v)),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
      <div role="tablist" aria-label="Filter trials by verdict" className="flex flex-wrap gap-1">
        {verdictTabs.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={verdict === v}
            onClick={() => onVerdict(v)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
              verdict === v
                ? "bg-accent-subtle text-accent"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {v === "ALL" ? "All" : verdictLabel(v)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search trials…"
            aria-label="Search trials by title or NCT id"
            className="w-40 rounded-lg border border-border bg-surface py-1.5 pl-8 pr-2.5 text-sm text-fg outline-none focus:border-accent-strong"
          />
        </div>

        <label className="flex items-center gap-1.5 text-sm text-fg-muted">
          <span className="sr-only sm:not-sr-only">Sort</span>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as TrialSort)}
            className={selectClass}
            aria-label="Sort trials"
          >
            <option value="score">Score</option>
            <option value="verdict">Verdict</option>
            <option value="phase">Phase</option>
          </select>
        </label>

        {phases.length > 0 && (
          <select
            value={phase}
            onChange={(e) => onPhase(e.target.value)}
            className={selectClass}
            aria-label="Filter trials by phase"
          >
            <option value="ALL">All phases</option>
            {phases.map((p) => (
              <option key={p} value={p}>
                {phaseLabel(p)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
