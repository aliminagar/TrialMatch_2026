"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

import type { ActivityLine } from "@/lib/matchReducer";
import { cn } from "@/lib/utils";

const TONE_DOT = {
  info: "bg-fg-subtle",
  success: "bg-pass-fg",
  error: "bg-fail-fg",
} as const;

function clockLabel(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function ActivityFeed({ lines }: { lines: ActivityLine[] }) {
  const reduce = useReducedMotion();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [lines.length, reduce]);

  if (lines.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
          Activity
        </h3>
      </div>
      <div
        className="max-h-56 overflow-y-auto px-4 py-3"
        role="log"
        aria-live="polite"
        aria-label="Match run activity"
      >
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {lines.map((line) => (
              <motion.li
                key={line.id}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2.5 text-sm"
              >
                <span className="mt-1 font-mono text-[11px] tabular-nums text-fg-subtle">
                  {clockLabel(line.ts)}
                </span>
                <span
                  className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[line.tone])}
                  aria-hidden
                />
                <span
                  className={cn(
                    line.tone === "error" ? "text-fail-fg" : "text-fg-muted",
                  )}
                >
                  {line.text}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </ul>
      </div>
    </div>
  );
}
