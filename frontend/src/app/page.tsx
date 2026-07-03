"use client";

import { AlertTriangle, PlugZap, SearchX, Stethoscope } from "lucide-react";
import { useRef } from "react";

import { ActivityFeed } from "@/components/ActivityFeed";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PipelineStepper } from "@/components/PipelineStepper";
import { ProfileForm } from "@/components/ProfileForm";
import { ResultsView } from "@/components/ResultsView";
import { EmptyState } from "@/components/ui/EmptyState";
import { useMatchRun } from "@/hooks/useMatchRun";
import type { PatientProfile } from "@/lib/types";

export default function HomePage() {
  const { state, run, cancel, reset, running } = useMatchRun();
  const lastReq = useRef<{ patient: PatientProfile; maxResults: number } | null>(null);

  function handleSubmit(patient: PatientProfile, maxResults: number) {
    lastReq.current = { patient, maxResults };
    void run(patient, maxResults);
  }

  function retry() {
    if (lastReq.current) void run(lastReq.current.patient, lastReq.current.maxResults);
    else reset();
  }

  const result = state.result;
  const hasTrials = (result?.trial_verdicts.length ?? 0) > 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8">
      <Header />

      <main className="mt-10 grid flex-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <ProfileForm onSubmit={handleSubmit} onCancel={cancel} running={running} />
        </div>

        <div className="flex flex-col gap-6">
          <PipelineStepper state={state} />

          {state.activityLog.length > 0 && state.status !== "done" && (
            <ActivityFeed lines={state.activityLog} />
          )}

          {state.status === "idle" && (
            <EmptyState
              icon={Stethoscope}
              title="Ready to match"
              description="Enter a patient profile — or load the sample patient — and run a match to see the agentic pipeline evaluate each eligibility criterion in real time."
            />
          )}

          {state.status === "error" && (
            <EmptyState
              icon={state.error?.code === "stream_interrupted" ? PlugZap : AlertTriangle}
              tone="error"
              title={
                state.error?.code === "stream_interrupted"
                  ? "Run interrupted"
                  : "Something went wrong"
              }
              description={
                state.error?.message ?? "The match run failed before producing a report."
              }
              action={{ label: "Try again", onClick: retry }}
            />
          )}

          {state.status === "done" && result && hasTrials && (
            <ResultsView report={result} />
          )}

          {state.status === "done" && result && !hasTrials && (
            <EmptyState
              icon={SearchX}
              title="No matching trials found"
              description="No candidate trials were discovered for this profile. Try broadening the diagnosis or removing the location filter."
              action={{ label: "Adjust profile", onClick: reset }}
            />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
