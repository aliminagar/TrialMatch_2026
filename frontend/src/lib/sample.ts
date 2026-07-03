import type { PatientProfile } from "./types";

export interface SampleProfile {
  id: string;
  label: string;
  summary: string;
  patient: PatientProfile;
}

/**
 * Demo patients. All fields map to the real backend PatientProfile schema —
 * receptor status and stage live in the diagnosis description (the only
 * free-text field), while labs, prior treatments, and comorbidities use their
 * dedicated fields. The richer profiles let the Claude evaluator resolve many
 * criteria to real PASS/FAIL instead of INSUFFICIENT_INFO.
 */
export const SAMPLE_PROFILES: SampleProfile[] = [
  {
    id: "breast-basic",
    label: "Breast cancer · 58F (minimal)",
    summary: "58F breast cancer, ECOG 1 — no labs or staging (mostly insufficient)",
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
  },
  {
    id: "breast-rich",
    label: "Breast cancer · 58F (full workup)",
    summary: "HR+/HER2− receptor status, labs + prior endocrine/chemo therapy",
    patient: {
      age: 58,
      sex: "female",
      primary_diagnosis: {
        icd10: "C50.911",
        // Kept searchable for ClinicalTrials.gov (long / punctuated conditions
        // return no results) while still stating receptor status for the LLM.
        description: "HR-positive, HER2-negative breast cancer",
      },
      comorbidities: [
        { icd10: "E11.9", description: "Type 2 diabetes mellitus" },
        { icd10: "I10", description: "Essential hypertension" },
      ],
      current_medications: ["metformin", "lisinopril"],
      ecog_performance_status: 1,
      lab_values: {
        ANC: { value: 3.2, unit: "10^9/L", reference_range: "1.5–8.0", measured_on: "2026-06-20" },
        Platelets: { value: 245, unit: "10^9/L", reference_range: "150–400", measured_on: "2026-06-20" },
        Hemoglobin: { value: 12.6, unit: "g/dL", reference_range: "12.0–16.0", measured_on: "2026-06-20" },
        "Total bilirubin": { value: 0.6, unit: "mg/dL", reference_range: "0.1–1.2", measured_on: "2026-06-20" },
        Creatinine: { value: 0.9, unit: "mg/dL", reference_range: "0.6–1.1", measured_on: "2026-06-20" },
      },
      prior_treatments: [
        "Adjuvant AC chemotherapy (doxorubicin + cyclophosphamide)",
        "Tamoxifen",
      ],
      geographic_constraint: { country: "US", state: "CA", city: "Los Angeles" },
    },
  },
  {
    id: "nsclc-male",
    label: "Lung cancer · 45M (NSCLC)",
    summary: "45M NSCLC adenocarcinoma, ECOG 0, treatment-naive, labs within range",
    patient: {
      age: 45,
      sex: "male",
      primary_diagnosis: {
        icd10: "C34.90",
        description: "Non-small cell lung cancer, adenocarcinoma",
      },
      comorbidities: [],
      current_medications: [],
      ecog_performance_status: 0,
      lab_values: {
        ANC: { value: 4.1, unit: "10^9/L", reference_range: "1.5–8.0", measured_on: "2026-06-18" },
        Platelets: { value: 260, unit: "10^9/L", reference_range: "150–400", measured_on: "2026-06-18" },
        Hemoglobin: { value: 14.2, unit: "g/dL", reference_range: "13.5–17.5", measured_on: "2026-06-18" },
        "Total bilirubin": { value: 0.5, unit: "mg/dL", reference_range: "0.1–1.2", measured_on: "2026-06-18" },
        Creatinine: { value: 0.95, unit: "mg/dL", reference_range: "0.7–1.3", measured_on: "2026-06-18" },
        AST: { value: 24, unit: "U/L", reference_range: "10–40", measured_on: "2026-06-18" },
      },
      prior_treatments: [],
      geographic_constraint: { country: "US", state: "NY", city: "New York" },
    },
  },
];

/** Back-compatible default patient (the minimal breast-cancer profile). */
export const SAMPLE_PATIENT: PatientProfile = SAMPLE_PROFILES[0].patient;
