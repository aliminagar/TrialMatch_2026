import type { PatientProfile } from "./types";

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
