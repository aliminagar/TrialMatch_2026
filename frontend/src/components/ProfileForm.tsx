"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FlaskConical, Loader2, Search, Sparkles, X } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { useState, type ReactNode } from "react";

import { ALL_TRIALS } from "@/lib/api";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TagInput } from "@/components/ui/TagInput";
import {
  ECOG_DESCRIPTIONS,
  extrasOf,
  patientToFormValues,
  profileSchema,
  SAMPLE_FORM_VALUES,
  toPatientProfile,
  type ProfileExtras,
  type ProfileFormInput,
  type ProfileFormValues,
} from "@/lib/profileSchema";
import { SAMPLE_PROFILES } from "@/lib/sample";
import type { PatientProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

const ECOG_OPTIONS = (["0", "1", "2", "3", "4"] as const).map((v) => ({
  value: v,
  label: v,
  title: `ECOG ${v} — ${ECOG_DESCRIPTIONS[v]}`,
}));

const SEX_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
] as const;

type TrialsChoice = "3" | "5" | "10" | "all";

const TRIALS_OPTIONS = [
  { value: "3", label: "3" },
  { value: "5", label: "5" },
  { value: "10", label: "10" },
  { value: "all", label: "All" },
] as const;

function trialsChoiceToCount(choice: TrialsChoice): number {
  return choice === "all" ? ALL_TRIALS : Number(choice);
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-fail-fg" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent-strong";

export interface ProfileFormProps {
  onSubmit: (patient: PatientProfile, maxResults: number) => void;
  onCancel: () => void;
  running: boolean;
}

export function ProfileForm({ onSubmit, onCancel, running }: ProfileFormProps) {
  const [trials, setTrials] = useState<TrialsChoice>("5");
  const [profileId, setProfileId] = useState(SAMPLE_PROFILES[0].id);
  const [extras, setExtras] = useState<ProfileExtras>(
    extrasOf(SAMPLE_PROFILES[0].patient),
  );
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: SAMPLE_FORM_VALUES,
    mode: "onTouched",
  });

  function loadSample(id: string) {
    const profile = SAMPLE_PROFILES.find((p) => p.id === id);
    if (!profile) return;
    setProfileId(id);
    reset(patientToFormValues(profile.patient));
    setExtras(extrasOf(profile.patient));
  }

  const labKeys = Object.keys(extras.lab_values);

  return (
    <form
      onSubmit={handleSubmit((values: ProfileFormValues) =>
        onSubmit(toPatientProfile(values, extras), trialsChoiceToCount(trials)),
      )}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-card"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-fg">Patient profile</h2>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 pl-2">
            <Sparkles size={13} className="text-accent" aria-hidden />
            <select
              aria-label="Load a sample patient"
              value={profileId}
              onChange={(e) => loadSample(e.target.value)}
              className="rounded-lg bg-transparent py-1.5 pr-2 text-xs font-medium text-fg outline-none"
            >
              {SAMPLE_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {(labKeys.length > 0 || extras.comorbidities.length > 0) && (
          <p className="flex items-start gap-1.5 text-xs text-fg-subtle">
            <FlaskConical size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span>
              Carrying {labKeys.length > 0 && `${labKeys.length} lab values (${labKeys.join(", ")})`}
              {labKeys.length > 0 && extras.comorbidities.length > 0 && " and "}
              {extras.comorbidities.length > 0 &&
                `${extras.comorbidities.length} comorbiditie${extras.comorbidities.length === 1 ? "y" : "s"}`}{" "}
              — sent to the evaluator with this profile.
            </span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Age" htmlFor="age" error={errors.age?.message}>
          <input
            id="age"
            type="number"
            inputMode="numeric"
            min={0}
            max={120}
            className={cn(inputClass, "tabular-nums")}
            {...register("age")}
          />
        </Field>

        <Field label="Sex" error={errors.sex?.message}>
          <Controller
            control={control}
            name="sex"
            render={({ field }) => (
              <SegmentedControl
                ariaLabel="Sex"
                options={SEX_OPTIONS.map((o) => ({ ...o }))}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </div>

      <Field label="Primary diagnosis" htmlFor="diagnosis" error={errors.diagnosis?.message}>
        <input
          id="diagnosis"
          type="text"
          placeholder="e.g. HR-positive, HER2-negative breast cancer, stage IIB"
          className={inputClass}
          {...register("diagnosis")}
        />
      </Field>

      <Field
        label="ICD-10 code"
        htmlFor="icd10"
        hint="Format like C50.911 or I10"
        error={errors.icd10?.message}
      >
        <input
          id="icd10"
          type="text"
          autoCapitalize="characters"
          placeholder="C50.911"
          className={cn(inputClass, "font-mono uppercase")}
          {...register("icd10")}
        />
      </Field>

      <Field
        label="ECOG performance status"
        hint="Hover a grade for its description"
        error={errors.ecog?.message}
      >
        <Controller
          control={control}
          name="ecog"
          render={({ field }) => (
            <SegmentedControl
              ariaLabel="ECOG performance status"
              options={ECOG_OPTIONS.map((o) => ({ ...o }))}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </Field>

      <Field label="Current medications" hint="Type and press Enter to add">
        <Controller
          control={control}
          name="medications"
          render={({ field }) => (
            <TagInput
              ariaLabel="Current medications"
              value={field.value}
              onChange={field.onChange}
              placeholder="e.g. metformin"
            />
          )}
        />
      </Field>

      <Field label="Prior treatments" hint="Type and press Enter to add">
        <Controller
          control={control}
          name="priorTreatments"
          render={({ field }) => (
            <TagInput
              ariaLabel="Prior treatments"
              value={field.value}
              onChange={field.onChange}
              placeholder="e.g. tamoxifen"
            />
          )}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="City" htmlFor="city">
          <input id="city" type="text" className={inputClass} {...register("city")} />
        </Field>
        <Field label="State" htmlFor="state">
          <input id="state" type="text" className={inputClass} {...register("state")} />
        </Field>
        <Field label="Country" htmlFor="country" error={errors.country?.message}>
          <input
            id="country"
            type="text"
            placeholder="US"
            className={cn(inputClass, "uppercase")}
            {...register("country")}
          />
        </Field>
      </div>

      <Field label="Trials to evaluate" hint="Top matches by relevance — each is one Claude call">
        <SegmentedControl
          ariaLabel="Number of trials to evaluate"
          options={TRIALS_OPTIONS.map((o) => ({ ...o }))}
          value={trials}
          onChange={setTrials}
        />
      </Field>

      {running ? (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-border-strong"
        >
          <X size={16} aria-hidden />
          Cancel run
        </button>
      ) : (
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent-strong to-secondary-strong px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Search size={16} aria-hidden />
          Find matching trials
        </button>
      )}

      {running && (
        <p className="flex items-center justify-center gap-2 text-xs text-fg-muted">
          <Loader2 size={13} className="animate-spin" aria-hidden />
          Running the agentic pipeline…
        </p>
      )}
    </form>
  );
}
