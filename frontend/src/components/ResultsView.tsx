"use client";

import { motion } from "framer-motion";

import { CriteriaTable } from "@/components/CriteriaTable";
import { LlmStatsBar } from "@/components/LlmStatsBar";
import { TrialHeaderCard } from "@/components/TrialHeaderCard";
import { VerdictSummary } from "@/components/VerdictSummary";
import type { MatchReport } from "@/lib/types";

export function ResultsView({ report }: { report: MatchReport }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-6"
    >
      <p className="text-sm text-fg-muted">{report.summary}</p>

      {report.trial_verdicts.map((trial) => (
        <div key={trial.nct_id} className="flex flex-col gap-4">
          <TrialHeaderCard trial={trial} />
          <VerdictSummary trial={trial} />
          <CriteriaTable criteria={trial.criteria_verdicts} />
        </div>
      ))}

      <LlmStatsBar stats={report.llm_stats} />
    </motion.div>
  );
}
