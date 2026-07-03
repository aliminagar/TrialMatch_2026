"use client";

import { CircleHelp, CircleCheck, CircleX } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import type { AggregateVerdict, Verdict } from "@/lib/types";
import { cn, verdictLabel, verdictTone, type VerdictTone } from "@/lib/utils";

const TONE_CLASS: Record<VerdictTone, string> = {
  pass: "bg-pass-bg text-pass-fg border-pass-border",
  review: "bg-review-bg text-review-fg border-review-border",
  fail: "bg-fail-bg text-fail-fg border-fail-border",
};

const TONE_ICON: Record<VerdictTone, typeof CircleCheck> = {
  pass: CircleCheck,
  review: CircleHelp,
  fail: CircleX,
};

const SIZE_CLASS = {
  sm: "px-2 py-0.5 text-xs gap-1",
  md: "px-2.5 py-1 text-sm gap-1.5",
  lg: "px-4 py-1.5 text-base gap-2 font-semibold",
} as const;

const ICON_SIZE = { sm: 12, md: 14, lg: 18 } as const;

export interface VerdictBadgeProps {
  verdict: Verdict | AggregateVerdict;
  size?: keyof typeof SIZE_CLASS;
  animate?: boolean;
  className?: string;
}

export function VerdictBadge({
  verdict,
  size = "md",
  animate = false,
  className,
}: VerdictBadgeProps) {
  const tone = verdictTone(verdict);
  const Icon = TONE_ICON[tone];
  const reduce = useReducedMotion();

  const content = (
    <>
      <Icon size={ICON_SIZE[size]} aria-hidden strokeWidth={2.25} />
      <span>{verdictLabel(verdict)}</span>
    </>
  );

  const classes = cn(
    "inline-flex items-center rounded-full border font-medium tabular-nums",
    TONE_CLASS[tone],
    SIZE_CLASS[size],
    className,
  );

  if (!animate || reduce) {
    return <span className={classes}>{content}</span>;
  }

  return (
    <motion.span
      className={classes}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 22 }}
    >
      {content}
    </motion.span>
  );
}
