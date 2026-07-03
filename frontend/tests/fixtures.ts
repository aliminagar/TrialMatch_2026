import type { MatchReport, TrialVerdict } from "@/lib/types";

/** A realistic NCT07174336-shaped verdict fixture used across tests. */
export const sampleTrialVerdict: TrialVerdict = {
  nct_id: "NCT07174336",
  title: "A Study of Tersolisib With Other Anti-Cancer Therapies in Breast Cancer",
  aggregate_verdict: "NEEDS_REVIEW",
  score: 0.32,
  criteria_verdicts: [
    {
      criterion: {
        criterion_type: "inclusion",
        category: "diagnosis",
        operator: "has",
        source_text: "Have histologically confirmed HR+/HER2- breast cancer.",
        threshold: null,
        field: null,
      },
      verdict: "INSUFFICIENT_INFO",
      reasoning:
        "Diagnosis is consistent with the disease site, but HR/HER2 subtype is not captured in the profile.",
      confidence: 0.3,
      source_citation: "Have histologically confirmed HR+/HER2- breast cancer.",
    },
    {
      criterion: {
        criterion_type: "inclusion",
        category: "performance",
        operator: "lte",
        source_text: "ECOG performance status 0 to 1.",
        threshold: null,
        field: "ecog_performance_status",
      },
      verdict: "PASS",
      reasoning: "Patient ECOG 1 is within the required range 0-1.",
      confidence: 0.95,
      source_citation: "ECOG performance status 0 to 1.",
    },
    {
      criterion: {
        criterion_type: "exclusion",
        category: "diagnosis",
        operator: "lacks",
        source_text: "Have inflammatory or metaplastic breast cancer.",
        threshold: null,
        field: null,
      },
      verdict: "INSUFFICIENT_INFO",
      reasoning: "Cannot confirm absence of inflammatory breast cancer from the profile.",
      confidence: 0.5,
      source_citation: "Have inflammatory or metaplastic breast cancer.",
    },
  ],
};

export const sampleReport: MatchReport = {
  patient: {
    age: 58,
    sex: "female",
    primary_diagnosis: { icd10: "C50.911", description: "Malignant neoplasm of breast" },
    comorbidities: [],
    current_medications: ["metformin", "lisinopril"],
    ecog_performance_status: 1,
    lab_values: {},
    prior_treatments: [],
    geographic_constraint: { country: "US", state: "CA", city: "Los Angeles" },
  },
  trial_verdicts: [sampleTrialVerdict],
  summary: "1 trial evaluated; criteria appear to require clinician review.",
  generated_at: "2026-07-03T00:00:00Z",
  run_id: null,
  disclaimer: "TrialMatch AI is a research and educational decision-support tool.",
  llm_stats: {
    model: "claude-sonnet-4-6",
    api_calls: 1,
    input_tokens: 2622,
    output_tokens: 2283,
    cost_usd: 0.042111,
    latency_s: 35.31,
  },
};
