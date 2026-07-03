"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { VerdictTone } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TONE_FILL: Record<VerdictTone, string> = {
  pass: "bg-pass-fg",
  review: "bg-review-fg",
  fail: "bg-fail-fg",
};

/** Compact horizontal confidence meter (0..1) with its numeric value. */
export function ConfidenceBar({
  value,
  tone,
}: {
  value: number;
  tone: VerdictTone;
}) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, value));
  const pct = Math.round(clamped * 100);
  // Subtle intensity: low-confidence fills read fainter than high-confidence.
  const intensity = 0.5 + 0.5 * clamped;

  return (
    <div className="flex items-center gap-2" title={`Confidence ${pct}%`}>
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Confidence"
      >
        <motion.div
          className={cn("h-full rounded-full", TONE_FILL[tone])}
          style={{ opacity: intensity }}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className="w-8 text-xs tabular-nums text-fg-muted">
        {(value).toFixed(2)}
      </span>
    </div>
  );
}
