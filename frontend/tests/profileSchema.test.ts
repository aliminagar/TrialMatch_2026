import { describe, expect, it } from "vitest";

import {
  extrasOf,
  patientToFormValues,
  profileSchema,
  SAMPLE_FORM_VALUES,
  toPatientProfile,
} from "@/lib/profileSchema";
import { SAMPLE_PROFILES } from "@/lib/sample";

describe("profileSchema", () => {
  it("accepts the sample patient", () => {
    const parsed = profileSchema.safeParse(SAMPLE_FORM_VALUES);
    expect(parsed.success).toBe(true);
  });

  it("coerces a string age to a number", () => {
    const parsed = profileSchema.safeParse({ ...SAMPLE_FORM_VALUES, age: "58" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.age).toBe(58);
  });

  it("rejects an out-of-range age", () => {
    const parsed = profileSchema.safeParse({ ...SAMPLE_FORM_VALUES, age: 200 });
    expect(parsed.success).toBe(false);
  });

  it("rejects a malformed ICD-10 code", () => {
    const parsed = profileSchema.safeParse({ ...SAMPLE_FORM_VALUES, icd10: "banana" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === "icd10")).toBe(true);
    }
  });

  it("rejects a non-2-letter country code", () => {
    const parsed = profileSchema.safeParse({ ...SAMPLE_FORM_VALUES, country: "USA" });
    expect(parsed.success).toBe(false);
  });
});

describe("toPatientProfile", () => {
  it("maps the sample form onto the backend PatientProfile shape", () => {
    const patient = toPatientProfile(SAMPLE_FORM_VALUES);
    expect(patient.age).toBe(58);
    expect(patient.sex).toBe("female");
    expect(patient.primary_diagnosis.icd10).toBe("C50.911");
    expect(patient.ecog_performance_status).toBe(1); // "1" -> 1
    expect(patient.current_medications).toEqual(["metformin", "lisinopril"]);
    expect(patient.geographic_constraint).toEqual({
      country: "US",
      state: "CA",
      city: "Los Angeles",
    });
    // fields the form doesn't collect default to empty, matching the backend
    expect(patient.comorbidities).toEqual([]);
    expect(patient.prior_treatments).toEqual([]);
    expect(patient.lab_values).toEqual({});
  });

  it("uppercases the ICD-10 code and omits geo when no country", () => {
    const patient = toPatientProfile({
      ...SAMPLE_FORM_VALUES,
      icd10: "c50.911",
      country: "",
    });
    expect(patient.primary_diagnosis.icd10).toBe("C50.911");
    expect(patient.geographic_constraint).toBeNull();
  });

  it("maps a null ECOG to null", () => {
    const patient = toPatientProfile({ ...SAMPLE_FORM_VALUES, ecog: null });
    expect(patient.ecog_performance_status).toBeNull();
  });
});

describe("sample profile loading", () => {
  const rich = SAMPLE_PROFILES.find((p) => p.id === "breast-rich")!.patient;

  it("every sample profile's form values pass validation", () => {
    for (const p of SAMPLE_PROFILES) {
      expect(profileSchema.safeParse(patientToFormValues(p.patient)).success).toBe(true);
    }
  });

  it("maps a rich profile to editable form values (labs stay as extras)", () => {
    const fv = patientToFormValues(rich);
    expect(fv.diagnosis).toMatch(/HR-positive/i);
    expect(fv.icd10).toBe("C50.911");
    expect(fv.ecog).toBe("1");
    expect(fv.priorTreatments).toHaveLength(2);
    expect((fv as Record<string, unknown>).lab_values).toBeUndefined();
  });

  it("carries labs + comorbidities as extras and merges them on submit", () => {
    const extras = extrasOf(rich);
    expect(Object.keys(extras.lab_values).length).toBeGreaterThan(0);

    const patient = toPatientProfile(patientToFormValues(rich), extras);
    expect(Object.keys(patient.lab_values)).toContain("ANC");
    expect(patient.prior_treatments).toHaveLength(2);
    expect(patient.comorbidities).toHaveLength(2);
    expect(patient.primary_diagnosis.description).toMatch(/HER2-negative/i);
  });

  it("defaults (no extras) produce empty labs/comorbidities", () => {
    const patient = toPatientProfile(SAMPLE_FORM_VALUES);
    expect(patient.lab_values).toEqual({});
    expect(patient.comorbidities).toEqual([]);
  });
});
