import { describe, expect, it } from "vitest";

import {
  aggregateDistribution,
  availablePhases,
  categoryDistribution,
  filterTrials,
  flattenCriteria,
  scoreRanking,
  sortTrials,
  topCandidates,
  type DetailMap,
} from "@/lib/trialViews";
import type { TrialVerdict } from "@/lib/types";

function trial(
  nct: string,
  aggregate: TrialVerdict["aggregate_verdict"],
  score: number,
  nCriteria = 1,
): TrialVerdict {
  return {
    nct_id: nct,
    title: `Trial ${nct}`,
    aggregate_verdict: aggregate,
    score,
    criteria_verdicts: Array.from({ length: nCriteria }, (_, i) => ({
      criterion: {
        criterion_type: "inclusion",
        category: "other",
        operator: "has",
        source_text: `criterion ${i} of ${nct}`,
        threshold: null,
        field: null,
      },
      verdict: "PASS",
      reasoning: "r",
      confidence: 0.5,
      source_citation: `criterion ${i} of ${nct}`,
    })),
  };
}

const trials: TrialVerdict[] = [
  trial("NCT01", "NEEDS_REVIEW", 0.47, 2),
  trial("NCT02", "LIKELY_NO_MATCH", 0.35, 3),
  trial("NCT03", "NEEDS_REVIEW", 0.5, 1),
  trial("NCT04", "LIKELY_MATCH", 0.82, 1),
];

const details: DetailMap = {
  NCT01: { nct_id: "NCT01", brief_title: "t", phase: "PHASE3" },
  NCT02: { nct_id: "NCT02", brief_title: "t", phase: "PHASE1" },
  NCT03: { nct_id: "NCT03", brief_title: "t", phase: "PHASE2" },
  // NCT04 detail not loaded yet
};

describe("aggregateDistribution", () => {
  it("counts trials per aggregate verdict in canonical order", () => {
    expect(aggregateDistribution(trials)).toEqual([
      { verdict: "LIKELY_MATCH", count: 1 },
      { verdict: "NEEDS_REVIEW", count: 2 },
      { verdict: "LIKELY_NO_MATCH", count: 1 },
    ]);
  });
});

describe("topCandidates", () => {
  it("returns the highest-scoring trials first", () => {
    expect(topCandidates(trials, 2).map((t) => t.nct_id)).toEqual(["NCT04", "NCT03"]);
  });
});

describe("sortTrials", () => {
  it("sorts by score desc", () => {
    expect(sortTrials(trials, "score", details).map((t) => t.nct_id)).toEqual([
      "NCT04",
      "NCT03",
      "NCT01",
      "NCT02",
    ]);
  });

  it("sorts by verdict rank (match → review → no-match), score-breaking ties", () => {
    expect(sortTrials(trials, "verdict", details).map((t) => t.nct_id)).toEqual([
      "NCT04", // LIKELY_MATCH
      "NCT03", // NEEDS_REVIEW 0.5
      "NCT01", // NEEDS_REVIEW 0.47
      "NCT02", // LIKELY_NO_MATCH
    ]);
  });

  it("sorts by phase, with missing details treated as latest", () => {
    const order = sortTrials(trials, "phase", details).map((t) => t.nct_id);
    expect(order[0]).toBe("NCT02"); // PHASE1 first
    expect(order[1]).toBe("NCT03"); // PHASE2
    expect(order[2]).toBe("NCT01"); // PHASE3
    expect(order[3]).toBe("NCT04"); // unknown phase -> last
  });
});

describe("filterTrials", () => {
  it("filters by aggregate verdict", () => {
    const out = filterTrials(trials, { verdict: "NEEDS_REVIEW", phase: "ALL", query: "" }, details);
    expect(out.map((t) => t.nct_id).sort()).toEqual(["NCT01", "NCT03"]);
  });

  it("filters by phase", () => {
    const out = filterTrials(trials, { verdict: "ALL", phase: "PHASE1", query: "" }, details);
    expect(out.map((t) => t.nct_id)).toEqual(["NCT02"]);
  });

  it("searches title and NCT id", () => {
    expect(
      filterTrials(trials, { verdict: "ALL", phase: "ALL", query: "nct04" }, details).map(
        (t) => t.nct_id,
      ),
    ).toEqual(["NCT04"]);
  });
});

describe("availablePhases", () => {
  it("returns distinct loaded phases in phase order", () => {
    expect(availablePhases(trials, details)).toEqual(["PHASE1", "PHASE2", "PHASE3"]);
  });
});

describe("flattenCriteria", () => {
  it("flattens every criterion tagged with its trial", () => {
    const flat = flattenCriteria(trials);
    expect(flat).toHaveLength(2 + 3 + 1 + 1);
    expect(flat[0]).toMatchObject({ nctId: "NCT01" });
  });
});

describe("categoryDistribution", () => {
  it("counts criteria by category across all trials", () => {
    expect(categoryDistribution(trials)).toEqual([{ category: "other", count: 7 }]);
  });
});

describe("scoreRanking", () => {
  it("returns trials ranked by score with verdict, capped at n", () => {
    const ranked = scoreRanking(trials, 3);
    expect(ranked.map((r) => r.nctId)).toEqual(["NCT04", "NCT03", "NCT01"]);
    expect(ranked[0]).toEqual({ nctId: "NCT04", score: 0.82, verdict: "LIKELY_MATCH" });
  });
});
