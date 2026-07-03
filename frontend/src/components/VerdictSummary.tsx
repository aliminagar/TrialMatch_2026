"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { TrialVerdict } from "@/lib/types";
import { verdictCounts } from "@/lib/types";
import { cn, verdictTone } from "@/lib/utils";

import { ScoreRing } from "./ScoreRing";
import { VerdictBadge } from "./VerdictBadge";

const STAT_META = [
  { key: "PASS", label: "Pass", dot: "bg-pass-fg" },
  { key: "FAIL", label: "Fail", dot: "bg-fail-fg" },
  { key: "INSUFFICIENT_INFO", label: "Insufficient", dot: "bg-review-fg" },
] as const;

export function VerdictSummary({ trial }: { trial: TrialVerdict }) {
  const reduce = useReducedMotion();
  const counts = verdictCounts(trial);
  const tone = verdictTone(trial.aggregate_verdict);

  return (
    <motion.section
      aria-label="Match verdict summary"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8"
    >
      <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-center gap-4 sm:items-start">
          <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
            Aggregate verdict
          </p>
          <VerdictBadge verdict={trial.aggregate_verdict} size="lg" animate />
          <p className="max-w-xs text-center text-sm text-fg-muted sm:text-left">
            Reflects available profile data only — every verdict requires clinician
            confirmation.
          </p>
          <dl className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {STAT_META.map(({ key, label, dot }) => (
              <div
                key={key}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5"
              >
                <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />
                <dt className="text-sm text-fg-muted">{label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-fg">
                  {counts[key]}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <ScoreRing value={trial.score} tone={tone} size={148} />
      </div>
    </motion.section>
  );
}
