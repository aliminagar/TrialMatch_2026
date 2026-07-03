import { describe, expect, it } from "vitest";

import {
  buildReportLines,
  reportFileBase,
  serializeReportJson,
} from "@/lib/exportReport";
import type { MatchReport } from "@/lib/types";

import { sampleReport } from "./fixtures";

describe("serializeReportJson", () => {
  it("round-trips to an object with the full report shape", () => {
    const parsed = JSON.parse(serializeReportJson(sampleReport)) as MatchReport;
    expect(parsed.patient.primary_diagnosis.icd10).toBe("C50.911");
    expect(parsed.trial_verdicts[0].nct_id).toBe("NCT07174336");
    expect(parsed.trial_verdicts[0].criteria_verdicts[0].source_citation).toBeTruthy();
    expect(parsed.llm_stats?.model).toBe("claude-sonnet-4-6");
  });
});

describe("reportFileBase", () => {
  it("derives a dated file base from generated_at", () => {
    expect(reportFileBase(sampleReport)).toBe("trialmatch-report-2026-07-03");
  });
});

describe("buildReportLines", () => {
  const lines = buildReportLines(sampleReport);
  const text = lines.map((l) => l.text).join("\n");

  it("includes the title, patient profile, and disclaimer", () => {
    expect(lines[0]).toEqual({ kind: "title", text: "TrialMatch AI — Match Report" });
    expect(lines.some((l) => l.kind === "section" && l.text === "Patient profile")).toBe(true);
    expect(text).toContain(sampleReport.disclaimer);
  });

  it("includes every trial with verdict, reasoning, and grounded citation", () => {
    const trial = sampleReport.trial_verdicts[0];
    expect(lines.some((l) => l.kind === "trial" && l.text.includes(trial.nct_id))).toBe(true);
    // each criterion contributes a label, a body (reasoning), and a quote (citation)
    const quotes = lines.filter((l) => l.kind === "quote");
    expect(quotes.length).toBe(trial.criteria_verdicts.length);
    expect(text).toContain(trial.criteria_verdicts[0].source_citation);
  });

  it("includes the Claude usage stats when present", () => {
    expect(lines.some((l) => l.kind === "section" && /Claude evaluation/i.test(l.text))).toBe(
      true,
    );
    expect(text).toContain("$0.0421");
  });
});
