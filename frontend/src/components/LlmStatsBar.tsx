"use client";

import { Sparkles } from "lucide-react";

import type { LlmStats } from "@/lib/types";

function fmtTokens(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * "Powered by Claude" attribution plus per-run usage/cost/latency, sourced from
 * the backend's MatchReport.llm_stats. Renders the chip alone (no numbers) when
 * stats are absent — e.g. the deterministic-rules path.
 */
export function LlmStatsBar({ stats, model }: { stats?: LlmStats | null; model?: string }) {
  const label = stats?.model ?? model ?? "claude-sonnet-4-6";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs">
      <span className="inline-flex items-center gap-1.5 font-medium text-fg">
        <Sparkles size={13} className="text-accent" aria-hidden />
        Powered by Claude · <span className="font-mono text-fg-muted">{label}</span>
      </span>
      {stats && (
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-muted">
          <Stat label="API calls" value={String(stats.api_calls)} />
          <Stat label="in" value={`${fmtTokens(stats.input_tokens)} tok`} />
          <Stat label="out" value={`${fmtTokens(stats.output_tokens)} tok`} />
          <Stat label="cost" value={`$${stats.cost_usd.toFixed(4)}`} />
          <Stat label="latency" value={`${stats.latency_s.toFixed(1)}s`} />
        </dl>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-medium tabular-nums text-fg">{value}</dd>
    </div>
  );
}
