"use client";

import { animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import type { VerdictTone } from "@/lib/utils";

const TONE_STROKE: Record<VerdictTone, string> = {
  pass: "var(--pass-fg)",
  review: "var(--review-fg)",
  fail: "var(--fail-fg)",
};

export interface ScoreRingProps {
  /** 0..1 match score. */
  value: number;
  tone: VerdictTone;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function ScoreRing({
  value,
  tone,
  size = 132,
  strokeWidth = 10,
  label = "score",
}: ScoreRingProps) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);

  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);

  useEffect(() => {
    if (reduce) {
      setDisplay(clamped);
      return;
    }
    const controls = animate(0, clamped, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [clamped, reduce]);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Match ${label} ${clamped.toFixed(2)} out of 1.00`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? offset : c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums text-fg">
          {display.toFixed(2)}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
          {label}
        </span>
      </div>
    </div>
  );
}
