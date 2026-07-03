"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { CountUp } from "@/components/ui/CountUp";
import type { LlmStats } from "@/lib/types";

/**
 * "Powered by Claude" attribution plus per-run usage/cost/latency, sourced from
 * the backend's MatchReport.llm_stats. Renders the chip alone (no numbers) when
 * stats are absent — e.g. the deterministic-rules path.
 */
export function LlmStatsBar({ stats, model }: { stats?: LlmStats | null; model?: string }) {
  const label = stats?.model ?? model ?? "claude-sonnet-4-6";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-gradient-to-br from-surface-2 to-surface-3 px-3.5 py-2.5 text-xs">
      <span className="inline-flex items-center gap-1.5 font-medium text-fg">
        <Sparkles size={13} className="text-accent" aria-hidden />
        Powered by Claude · <span className="font-mono text-fg-muted">{label}</span>
      </span>
      {stats && (
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-muted">
          <Stat label="API calls">
            <CountUp value={stats.api_calls} />
          </Stat>
          <Stat label="in">
            <CountUp value={stats.input_tokens} suffix=" tok" />
          </Stat>
          <Stat label="out">
            <CountUp value={stats.output_tokens} suffix=" tok" />
          </Stat>
          <Stat label="cost">
            <CountUp value={stats.cost_usd} decimals={4} prefix="$" />
          </Stat>
          <Stat label="latency">
            <CountUp value={stats.latency_s} decimals={1} suffix="s" />
          </Stat>
        </dl>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-medium tabular-nums text-fg">{children}</dd>
    </div>
  );
}
