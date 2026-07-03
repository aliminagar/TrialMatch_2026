"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
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

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

export default function HomePage() {
  const { state, run, cancel, reset, running } = useMatchRun();
  const reduce = useReducedMotion();
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
    <motion.div
      variants={container}
      initial={reduce ? false : "hidden"}
      animate="show"
      className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8"
    >
      <motion.div variants={item}>
        <Header />
      </motion.div>

      <main className="mt-10 grid flex-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <motion.div variants={item} className="lg:sticky lg:top-8 lg:self-start">
          <ProfileForm onSubmit={handleSubmit} onCancel={cancel} running={running} />
        </motion.div>

        <motion.div variants={item} className="flex flex-col gap-6">
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
        </motion.div>
      </main>

      <motion.div variants={item}>
        <Footer />
      </motion.div>
    </motion.div>
  );
}
