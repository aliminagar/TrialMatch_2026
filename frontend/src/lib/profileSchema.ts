import { z } from "zod";

import type { PatientProfile } from "./types";

// Case-insensitive on input; the backend stores/validates uppercase ICD-10.
const ICD10 = /^[A-Za-z]\d{2}(\.[A-Za-z0-9]{1,4})?$/;

export const profileSchema = z.object({
  age: z.coerce
    .number({ error: "Enter an age" })
    .int("Whole number")
    .min(0, "Min 0")
    .max(120, "Max 120"),
  sex: z.enum(["male", "female", "other"], { error: "Select a sex" }),
  diagnosis: z.string().trim().min(2, "Enter a primary diagnosis"),
  icd10: z.string().trim().regex(ICD10, "Format like C50.911"),
  ecog: z.enum(["0", "1", "2", "3", "4"]).nullable(),
  medications: z.array(z.string()),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  country: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || v.length === 2, "Use a 2-letter code, e.g. US"),
});

// `age` is coerced, so the form's input type (unknown age) differs from the
// validated output type (number). Both are exported for the RHF generics.
export type ProfileFormInput = z.input<typeof profileSchema>;
export type ProfileFormValues = z.output<typeof profileSchema>;

/** Map validated form values onto the backend PatientProfile shape. */
export function toPatientProfile(v: ProfileFormValues): PatientProfile {
  const country = v.country?.trim().toUpperCase() || "";
  return {
    age: v.age,
    sex: v.sex,
    primary_diagnosis: {
      icd10: v.icd10.trim().toUpperCase(),
      description: v.diagnosis.trim() || null,
    },
    comorbidities: [],
    current_medications: v.medications,
    ecog_performance_status: v.ecog !== null ? Number(v.ecog) : null,
    lab_values: {},
    prior_treatments: [],
    geographic_constraint: country
      ? {
          country,
          state: v.state?.trim() || null,
          city: v.city?.trim() || null,
        }
      : null,
  };
}

/** The one-click demo patient (58F breast cancer, ECOG 1, LA/US). */
export const SAMPLE_FORM_VALUES: ProfileFormValues = {
  age: 58,
  sex: "female",
  diagnosis: "Malignant neoplasm of breast",
  icd10: "C50.911",
  ecog: "1",
  medications: ["metformin", "lisinopril"],
  city: "Los Angeles",
  state: "CA",
  country: "US",
};

export const EMPTY_FORM_VALUES: ProfileFormValues = {
  age: 0,
  sex: "female",
  diagnosis: "",
  icd10: "",
  ecog: null,
  medications: [],
  city: "",
  state: "",
  country: "US",
};

export const ECOG_DESCRIPTIONS: Record<string, string> = {
  "0": "Fully active, no restrictions",
  "1": "Restricted in strenuous activity, ambulatory",
  "2": "Ambulatory, up >50% of waking hours, no work",
  "3": "Limited self-care, confined >50% of waking hours",
  "4": "Completely disabled, fully confined",
};
