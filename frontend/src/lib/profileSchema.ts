import { z } from "zod";

import { SAMPLE_PROFILES } from "./sample";
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
  priorTreatments: z.array(z.string()),
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

/**
 * Fields the backend PatientProfile has but the form does not edit
 * (labs and comorbidities). Carried alongside the form and merged on submit so
 * a loaded sample's richer data still reaches the evaluator.
 */
export interface ProfileExtras {
  lab_values: PatientProfile["lab_values"];
  comorbidities: PatientProfile["comorbidities"];
}

/** Map validated form values (+ carried extras) onto the backend shape. */
export function toPatientProfile(
  v: ProfileFormValues,
  extras: ProfileExtras = { lab_values: {}, comorbidities: [] },
): PatientProfile {
  const country = v.country?.trim().toUpperCase() || "";
  return {
    age: v.age,
    sex: v.sex,
    primary_diagnosis: {
      icd10: v.icd10.trim().toUpperCase(),
      description: v.diagnosis.trim() || null,
    },
    comorbidities: extras.comorbidities,
    current_medications: v.medications,
    ecog_performance_status: v.ecog !== null ? Number(v.ecog) : null,
    lab_values: extras.lab_values,
    prior_treatments: v.priorTreatments,
    geographic_constraint: country
      ? { country, state: v.state?.trim() || null, city: v.city?.trim() || null }
      : null,
  };
}

/** Reverse map: a full PatientProfile → the editable form fields. */
export function patientToFormValues(p: PatientProfile): ProfileFormValues {
  return {
    age: p.age,
    sex: p.sex,
    diagnosis: p.primary_diagnosis.description ?? "",
    icd10: p.primary_diagnosis.icd10,
    ecog:
      p.ecog_performance_status !== null && p.ecog_performance_status !== undefined
        ? (String(p.ecog_performance_status) as ProfileFormValues["ecog"])
        : null,
    medications: p.current_medications,
    priorTreatments: p.prior_treatments,
    city: p.geographic_constraint?.city ?? "",
    state: p.geographic_constraint?.state ?? "",
    country: p.geographic_constraint?.country ?? "US",
  };
}

/** The non-form extras carried by a PatientProfile (labs, comorbidities). */
export function extrasOf(p: PatientProfile): ProfileExtras {
  return { lab_values: p.lab_values, comorbidities: p.comorbidities };
}

/** Default form = the first sample profile (minimal breast-cancer patient). */
export const SAMPLE_FORM_VALUES: ProfileFormValues = patientToFormValues(
  SAMPLE_PROFILES[0].patient,
);

export const ECOG_DESCRIPTIONS: Record<string, string> = {
  "0": "Fully active, no restrictions",
  "1": "Restricted in strenuous activity, ambulatory",
  "2": "Ambulatory, up >50% of waking hours, no work",
  "3": "Limited self-care, confined >50% of waking hours",
  "4": "Completely disabled, fully confined",
};
