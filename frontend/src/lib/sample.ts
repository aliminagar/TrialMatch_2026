import type { PatientProfile, TrialVerdict } from "./types";

/** The one-click demo patient: 58F breast cancer, ECOG 1, LA/US. */
export const SAMPLE_PATIENT: PatientProfile = {
  age: 58,
  sex: "female",
  primary_diagnosis: { icd10: "C50.911", description: "Malignant neoplasm of breast" },
  comorbidities: [],
  current_medications: ["metformin", "lisinopril"],
  ecog_performance_status: 1,
  lab_values: {},
  prior_treatments: [],
  geographic_constraint: { country: "US", state: "CA", city: "Los Angeles" },
};

/** A representative verdict (NCT07174336 shape) used for the design preview. */
export const SAMPLE_TRIAL_VERDICT: TrialVerdict = {
  nct_id: "NCT07174336",
  title:
    "A Study of Tersolisib (LY4064809/STX-478) With Other Anti-Cancer Therapies in Advanced Breast Cancer",
  aggregate_verdict: "NEEDS_REVIEW",
  score: 0.32,
  criteria_verdicts: [
    {
      criterion: {
        criterion_type: "inclusion",
        category: "diagnosis",
        operator: "has",
        source_text:
          "Have histologically or cytologically confirmed HR+/HER2- breast cancer.",
        threshold: null,
        field: null,
      },
      verdict: "INSUFFICIENT_INFO",
      reasoning:
        "Patient's diagnosis is consistent with the trial's disease site, but the HR/HER2 subtype is not captured in the structured profile.",
      confidence: 0.3,
      source_citation:
        "Have histologically or cytologically confirmed HR+/HER2- breast cancer.",
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
      reasoning:
        "Cannot confirm absence of inflammatory or metaplastic breast cancer from the available profile.",
      confidence: 0.5,
      source_citation: "Have inflammatory or metaplastic breast cancer.",
    },
  ],
};
