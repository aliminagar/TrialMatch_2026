/**
 * Pure, unit-tested view logic for the results dashboard: verdict distribution,
 * sorting, filtering, top candidates, and cross-trial criterion flattening.
 * Kept side-effect-free so the ResultsView components stay thin.
 */

import type {
  AggregateVerdict,
  CriterionCategory,
  CriterionVerdict,
  TrialDetail,
  TrialVerdict,
} from "./types";

export type TrialSort = "score" | "verdict" | "phase";
export type VerdictFilter = "ALL" | AggregateVerdict;

export type DetailMap = Record<string, TrialDetail>;

const VERDICT_RANK: Record<AggregateVerdict, number> = {
  LIKELY_MATCH: 0,
  NEEDS_REVIEW: 1,
  LIKELY_NO_MATCH: 2,
};

const PHASE_RANK: Record<string, number> = {
  EARLY_PHASE1: 0,
  PHASE1: 1,
  PHASE1_PHASE2: 2,
  PHASE2: 3,
  PHASE2_PHASE3: 4,
  PHASE3: 5,
  PHASE4: 6,
  NA: 7,
};

/** Aggregate-verdict order used consistently across the dashboard. */
export const AGGREGATE_ORDER: AggregateVerdict[] = [
  "LIKELY_MATCH",
  "NEEDS_REVIEW",
  "LIKELY_NO_MATCH",
];

export interface AggregateCount {
  verdict: AggregateVerdict;
  count: number;
}

/** Count trials per aggregate verdict, in canonical order (only non-zero). */
export function aggregateDistribution(trials: TrialVerdict[]): AggregateCount[] {
  const counts = new Map<AggregateVerdict, number>();
  for (const t of trials) {
    counts.set(t.aggregate_verdict, (counts.get(t.aggregate_verdict) ?? 0) + 1);
  }
  return AGGREGATE_ORDER.filter((v) => counts.has(v)).map((v) => ({
    verdict: v,
    count: counts.get(v) ?? 0,
  }));
}

/** Highest-scoring trials first (report order is already score-desc, but be safe). */
export function topCandidates(trials: TrialVerdict[], n = 3): TrialVerdict[] {
  return [...trials].sort((a, b) => b.score - a.score).slice(0, n);
}

/** Distinct phases present across the loaded trial details, phase-ordered. */
export function availablePhases(trials: TrialVerdict[], details: DetailMap): string[] {
  const set = new Set<string>();
  for (const t of trials) {
    const p = details[t.nct_id]?.phase;
    if (p) set.add(p);
  }
  return [...set].sort((a, b) => (PHASE_RANK[a] ?? 99) - (PHASE_RANK[b] ?? 99));
}

export interface TrialFilterOpts {
  verdict: VerdictFilter;
  phase: string; // "ALL" or a phase code
  query: string;
}

export function filterTrials(
  trials: TrialVerdict[],
  opts: TrialFilterOpts,
  details: DetailMap,
): TrialVerdict[] {
  const q = opts.query.trim().toLowerCase();
  return trials.filter((t) => {
    if (opts.verdict !== "ALL" && t.aggregate_verdict !== opts.verdict) return false;
    if (opts.phase !== "ALL" && (details[t.nct_id]?.phase ?? "") !== opts.phase) {
      return false;
    }
    if (q && !t.title.toLowerCase().includes(q) && !t.nct_id.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

export function sortTrials(
  trials: TrialVerdict[],
  sort: TrialSort,
  details: DetailMap,
): TrialVerdict[] {
  const arr = [...trials];
  switch (sort) {
    case "score":
      arr.sort((a, b) => b.score - a.score);
      break;
    case "verdict":
      arr.sort(
        (a, b) =>
          VERDICT_RANK[a.aggregate_verdict] - VERDICT_RANK[b.aggregate_verdict] ||
          b.score - a.score,
      );
      break;
    case "phase":
      arr.sort(
        (a, b) =>
          (PHASE_RANK[details[a.nct_id]?.phase ?? "NA"] ?? 99) -
            (PHASE_RANK[details[b.nct_id]?.phase ?? "NA"] ?? 99) || b.score - a.score,
      );
      break;
  }
  return arr;
}

export interface FlatCriterion {
  cv: CriterionVerdict;
  nctId: string;
  title: string;
}

/** Flatten every criterion across all trials, tagged with its trial. */
export function flattenCriteria(trials: TrialVerdict[]): FlatCriterion[] {
  return trials.flatMap((t) =>
    t.criteria_verdicts.map((cv) => ({ cv, nctId: t.nct_id, title: t.title })),
  );
}

export interface CategoryCount {
  category: CriterionCategory;
  count: number;
}

/** Count criteria by category across all trials (surfaces the data model). */
export function categoryDistribution(trials: TrialVerdict[]): CategoryCount[] {
  const counts = new Map<CriterionCategory, number>();
  for (const t of trials) {
    for (const cv of t.criteria_verdicts) {
      const cat = cv.criterion.category;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export interface ScoreRankItem {
  nctId: string;
  score: number;
  verdict: AggregateVerdict;
}

/** Trials ranked by score (desc), capped at `n`, for the ranking bar chart. */
export function scoreRanking(trials: TrialVerdict[], n = 8): ScoreRankItem[] {
  return [...trials]
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((t) => ({ nctId: t.nct_id, score: t.score, verdict: t.aggregate_verdict }));
}
