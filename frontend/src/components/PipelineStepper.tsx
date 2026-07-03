"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, X } from "lucide-react";

import type { MatchState, StepStatus } from "@/lib/matchReducer";
import { NODE_LABELS, PIPELINE_NODES } from "@/lib/types";
import { cn } from "@/lib/utils";

function StepMarker({ status, index }: { status: StepStatus; index: number }) {
  const reduce = useReducedMotion();
  const base =
    "relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold tabular-nums transition-colors";

  if (status === "complete") {
    return (
      <span className={cn(base, "border-accent-strong bg-accent-strong text-accent-contrast")}>
        <motion.span
          initial={reduce ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 24 }}
        >
          <Check size={16} strokeWidth={3} aria-hidden />
        </motion.span>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className={cn(base, "border-fail-border bg-fail-bg text-fail-fg")}>
        <X size={16} strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className={cn(base, "border-accent-strong text-accent")}>
        {!reduce && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-accent-strong"
            animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            aria-hidden
          />
        )}
        {index + 1}
      </span>
    );
  }
  return <span className={cn(base, "border-border text-fg-subtle")}>{index + 1}</span>;
}

export function PipelineStepper({ state }: { state: MatchState }) {
  const active = state.status !== "idle";

  return (
    <AnimatePresence>
      {active && (
        <motion.section
          aria-label="Pipeline progress"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="rounded-2xl border border-border bg-surface p-6 shadow-card"
        >
          <ol className="flex items-start justify-between gap-1">
            {PIPELINE_NODES.map((node, i) => {
              const status = state.nodeStates[node];
              const isLast = i === PIPELINE_NODES.length - 1;
              return (
                <li key={node} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full items-center">
                    <div className="flex flex-1 justify-center">
                      <StepMarker status={status} index={i} />
                    </div>
                    {!isLast && (
                      <div className="relative h-0.5 flex-1 overflow-hidden rounded bg-border">
                        <motion.div
                          className="absolute inset-0 origin-left bg-accent-strong"
                          initial={false}
                          animate={{ scaleX: status === "complete" ? 1 : 0 }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-center text-xs font-medium leading-tight",
                      status === "pending" ? "text-fg-subtle" : "text-fg",
                    )}
                  >
                    {NODE_LABELS[node]}
                  </span>
                </li>
              );
            })}
          </ol>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
