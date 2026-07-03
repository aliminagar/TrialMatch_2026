"use client";

import { motion, useReducedMotion } from "framer-motion";

import { verdictCounts, type TrialVerdict } from "@/lib/types";

const SEGMENTS = [
  { key: "PASS", tone: "pass", label: "pass" },
  { key: "INSUFFICIENT_INFO", tone: "review", label: "insufficient" },
  { key: "FAIL", tone: "fail", label: "fail" },
] as const;

function gradient(tone: "pass" | "review" | "fail"): string {
  return `linear-gradient(90deg, var(--${tone}-ring-from), var(--${tone}-ring-to))`;
}

/**
 * Compact stacked bar of a trial's Pass / Insufficient / Fail proportions — the
 * "match confidence" at a glance. Purely presentational; counts are labelled
 * elsewhere, so this is aria-hidden decorative detail with a summarizing title.
 */
export function MatchConfidenceBar({
  trial,
  className,
}: {
  trial: TrialVerdict;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const counts = verdictCounts(trial);
  const total = trial.criteria_verdicts.length || 1;

  return (
    <div
      className={className}
      role="img"
      aria-label={`Criteria mix: ${counts.PASS} pass, ${counts.INSUFFICIENT_INFO} insufficient, ${counts.FAIL} fail`}
    >
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
        {SEGMENTS.map(({ key, tone }) => {
          const value = counts[key];
          if (value === 0) return null;
          return (
            <motion.div
              key={key}
              style={{ backgroundImage: gradient(tone) }}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${(value / total) * 100}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}
      </div>
    </div>
  );
}
