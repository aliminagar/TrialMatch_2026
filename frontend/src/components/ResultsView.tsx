"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import { GlobalCriteriaView } from "@/components/GlobalCriteriaView";
import { ResultsOverview } from "@/components/ResultsOverview";
import { TrialAccordion } from "@/components/TrialAccordion";
import { TrialControls } from "@/components/TrialControls";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { fetchTrialDetail } from "@/lib/api";
import {
  availablePhases,
  filterTrials,
  sortTrials,
  topCandidates,
  type DetailMap,
  type TrialSort,
  type VerdictFilter,
} from "@/lib/trialViews";
import type { AggregateVerdict, MatchReport, TrialDetail } from "@/lib/types";

const VIEW_OPTIONS = [
  { value: "trial", label: "By trial" },
  { value: "verdict", label: "By verdict" },
] as const;

export function ResultsView({ report }: { report: MatchReport }) {
  const reduce = useReducedMotion();
  const trials = report.trial_verdicts;

  const [details, setDetails] = useState<DetailMap>({});
  const [sort, setSort] = useState<TrialSort>("score");
  const [verdict, setVerdict] = useState<VerdictFilter>("ALL");
  const [phase, setPhase] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"trial" | "verdict">("trial");

  // Fetch phase/status for every trial once, so the header chips, phase sort,
  // and phase filter all work without per-card fetching.
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all(
      trials.map((t) =>
        fetchTrialDetail(t.nct_id, ctrl.signal).then(
          (d) => [t.nct_id, d] as const,
        ),
      ),
    ).then((entries) => {
      const map: DetailMap = {};
      for (const [nct, d] of entries) if (d) map[nct] = d as TrialDetail;
      setDetails(map);
    });
    return () => ctrl.abort();
  }, [trials]);

  const topNctId = topCandidates(trials, 1)[0]?.nct_id;

  const presentVerdicts = useMemo(
    () => [...new Set(trials.map((t) => t.aggregate_verdict))] as AggregateVerdict[],
    [trials],
  );
  const phases = useMemo(() => availablePhases(trials, details), [trials, details]);

  const visibleTrials = useMemo(
    () =>
      sortTrials(filterTrials(trials, { verdict, phase, query }, details), sort, details),
    [trials, verdict, phase, query, sort, details],
  );

  return (
    <div className="flex flex-col gap-6">
      <ResultsOverview report={report} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          ariaLabel="Results view"
          options={VIEW_OPTIONS.map((o) => ({ ...o }))}
          value={view}
          onChange={setView}
        />
        {view === "trial" && (
          <p className="text-sm text-fg-subtle" aria-live="polite">
            Showing <span className="tabular-nums text-fg-muted">{visibleTrials.length}</span>{" "}
            of {trials.length}
          </p>
        )}
      </div>

      {view === "verdict" ? (
        <GlobalCriteriaView trials={trials} />
      ) : (
        <>
          <TrialControls
            sort={sort}
            onSort={setSort}
            verdict={verdict}
            onVerdict={setVerdict}
            phase={phase}
            onPhase={setPhase}
            query={query}
            onQuery={setQuery}
            phases={phases}
            presentVerdicts={presentVerdicts}
          />

          {visibleTrials.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted shadow-card">
              No trials match these filters.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {visibleTrials.map((trial, i) => (
                <motion.div
                  key={trial.nct_id}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(i * 0.05, 0.4) }}
                >
                  <TrialAccordion
                    trial={trial}
                    detail={details[trial.nct_id]}
                    defaultOpen={trial.nct_id === topNctId}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
