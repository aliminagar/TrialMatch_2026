"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, Trophy } from "lucide-react";

import { ExportButtons } from "@/components/ExportButtons";
import { LlmStatsBar } from "@/components/LlmStatsBar";
import { MatchConfidenceBar } from "@/components/MatchConfidenceBar";
import { ResultsCharts } from "@/components/ResultsCharts";
import { VerdictBadge } from "@/components/VerdictBadge";
import { CountUp } from "@/components/ui/CountUp";
import { trialUrl } from "@/lib/api";
import type { MatchReport, TrialVerdict } from "@/lib/types";
import { aggregateDistribution, topCandidates } from "@/lib/trialViews";
import { cn, verdictTone, type VerdictTone } from "@/lib/utils";

const SEGMENT_BG: Record<VerdictTone, string> = {
  pass: "bg-pass-fg",
  review: "bg-review-fg",
  fail: "bg-fail-fg",
};

function toneGradient(tone: VerdictTone): string {
  return `linear-gradient(135deg, var(--${tone}-ring-from), var(--${tone}-ring-to))`;
}

function VerdictDistribution({ trials }: { trials: TrialVerdict[] }) {
  const dist = aggregateDistribution(trials);
  const total = trials.length || 1;
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label="Verdict distribution across trials"
      >
        {dist.map(({ verdict, count }) => (
          <motion.div
            key={verdict}
            style={{ backgroundImage: toneGradient(verdictTone(verdict)) }}
            initial={{ width: 0 }}
            animate={{ width: `${(count / total) * 100}%` }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {dist.map(({ verdict, count }) => (
          <span key={verdict} className="inline-flex items-center gap-1.5 text-xs">
            <span
              className={cn("h-2 w-2 rounded-full", SEGMENT_BG[verdictTone(verdict)])}
              aria-hidden
            />
            <CountUp value={count} className="font-semibold tabular-nums text-fg" />
            <span className="text-fg-muted">{verdict.replace(/_/g, " ").toLowerCase()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TopCandidate({ trial, primary }: { trial: TrialVerdict; primary: boolean }) {
  const tone = verdictTone(trial.aggregate_verdict);
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border p-3 transition-shadow hover:shadow-card",
        primary ? "border-accent-strong/40 bg-accent-subtle" : "border-border bg-surface-2",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums text-white shadow-card"
          style={{ backgroundImage: toneGradient(tone) }}
          title={`Score ${trial.score.toFixed(2)}`}
        >
          {trial.score.toFixed(2)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href={trialUrl(trial.nct_id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-medium text-accent hover:opacity-80"
            >
              {trial.nct_id}
              <ExternalLink size={11} aria-hidden />
            </a>
            <VerdictBadge
              verdict={trial.aggregate_verdict}
              size="sm"
              className="shrink-0"
            />
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-fg">{trial.title}</p>
        </div>
      </div>
      <MatchConfidenceBar trial={trial} />
    </div>
  );
}

export function ResultsOverview({ report }: { report: MatchReport }) {
  const reduce = useReducedMotion();
  const trials = report.trial_verdicts;
  const top = topCandidates(trials, 3);

  return (
    <motion.section
      aria-label="Results overview"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-card"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fg">
            <CountUp value={trials.length} className="tabular-nums" />{" "}
            {trials.length === 1 ? "trial" : "trials"} evaluated
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{report.summary}</p>
        </div>
        <ExportButtons report={report} />
      </div>

      {trials.length > 0 && <VerdictDistribution trials={trials} />}

      {trials.length > 0 && <ResultsCharts trials={trials} />}

      {top.length > 0 && (
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: reduce ? 0 : 0.15, type: "spring", stiffness: 260, damping: 26 }}
          className="flex flex-col gap-2"
        >
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-subtle">
            <Trophy size={13} className="text-accent" aria-hidden />
            Top candidates
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {top.map((trial, i) => (
              <TopCandidate key={trial.nct_id} trial={trial} primary={i === 0} />
            ))}
          </div>
        </motion.div>
      )}

      <LlmStatsBar stats={report.llm_stats} />
    </motion.section>
  );
}
