"use client";

import { animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useState } from "react";

import type { VerdictTone } from "@/lib/utils";

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
  const gradId = useId();

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
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`var(--${tone}-ring-from)`} />
            <stop offset="100%" stopColor={`var(--${tone}-ring-to)`} />
          </linearGradient>
        </defs>
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
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? offset : c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        {!reduce && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#ffffff"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={c}
            style={{ mixBlendMode: "overlay" }}
            initial={{ strokeDashoffset: c, opacity: 0 }}
            animate={{ strokeDashoffset: offset, opacity: [0, 0.5, 0] }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold leading-none tabular-nums text-fg"
          style={{ fontSize: Math.round(size * 0.24) }}
        >
          {display.toFixed(2)}
        </span>
        {size >= 96 && (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
