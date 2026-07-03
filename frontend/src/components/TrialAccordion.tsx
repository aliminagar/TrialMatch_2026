"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useId, useState } from "react";

import { CriteriaTable } from "@/components/CriteriaTable";
import { MatchConfidenceBar } from "@/components/MatchConfidenceBar";
import { ScoreRing } from "@/components/ScoreRing";
import { VerdictBadge } from "@/components/VerdictBadge";
import { trialUrl } from "@/lib/api";
import { verdictCounts, type TrialDetail, type TrialVerdict } from "@/lib/types";
import { cn, verdictTone } from "@/lib/utils";

function titleCase(raw: string): string {
  return raw.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted">
      {children}
    </span>
  );
}

const COUNT_META = [
  { key: "PASS", label: "P", dot: "bg-pass-fg" },
  { key: "FAIL", label: "F", dot: "bg-fail-fg" },
  { key: "INSUFFICIENT_INFO", label: "I", dot: "bg-review-fg" },
] as const;

export function TrialAccordion({
  trial,
  detail,
  defaultOpen = false,
}: {
  trial: TrialVerdict;
  detail?: TrialDetail | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const bodyId = useId();
  const tone = verdictTone(trial.aggregate_verdict);
  const counts = verdictCounts(trial);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-shadow hover:shadow-card-lg">
      <div className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-4 p-4 pr-28 text-left transition-colors hover:bg-surface-2/50"
        >
          <ChevronRight
            size={18}
            className={cn(
              "shrink-0 text-fg-subtle transition-transform",
              open && "rotate-90",
            )}
            aria-hidden
          />
          <ScoreRing value={trial.score} tone={tone} size={52} strokeWidth={5} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-fg">{trial.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={trial.aggregate_verdict} size="sm" />
              {detail?.phase && <Pill>{titleCase(detail.phase)}</Pill>}
              {detail?.overall_status && <Pill>{titleCase(detail.overall_status)}</Pill>}
              <span className="inline-flex items-center gap-2">
                {COUNT_META.map(({ key, label, dot }) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 text-xs text-fg-muted"
                    title={key.replace(/_/g, " ").toLowerCase()}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
                    <span className="font-medium tabular-nums text-fg">{counts[key]}</span>
                    <span className="text-fg-subtle">{label}</span>
                  </span>
                ))}
              </span>
            </div>
            <MatchConfidenceBar trial={trial} className="mt-2.5 max-w-sm" />
          </div>
        </button>

        <a
          href={trialUrl(trial.nct_id)}
          target="_blank"
          rel="noreferrer"
          className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-lg bg-accent-subtle px-2 py-0.5 font-mono text-xs font-medium text-accent transition-opacity hover:opacity-80"
        >
          {trial.nct_id}
          <ExternalLink size={11} aria-hidden />
        </a>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            role="region"
            aria-label={`Criteria for ${trial.nct_id}`}
            key="body"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-4">
              <CriteriaTable criteria={trial.criteria_verdicts} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
