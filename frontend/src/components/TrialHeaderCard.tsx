"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchTrialDetail, trialUrl } from "@/lib/api";
import type { TrialDetail, TrialVerdict } from "@/lib/types";

function titleCase(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-fg-muted">
      {children}
    </span>
  );
}

export function TrialHeaderCard({ trial }: { trial: TrialVerdict }) {
  const [detail, setDetail] = useState<TrialDetail | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchTrialDetail(trial.nct_id, ctrl.signal).then(setDetail);
    return () => ctrl.abort();
  }, [trial.nct_id]);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={trialUrl(trial.nct_id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg bg-accent-subtle px-2 py-0.5 font-mono text-sm font-medium text-accent transition-opacity hover:opacity-80"
        >
          {trial.nct_id}
          <ExternalLink size={12} aria-hidden />
        </a>
        {detail?.phase && <Pill>{titleCase(detail.phase)}</Pill>}
        {detail?.overall_status && <Pill>{titleCase(detail.overall_status)}</Pill>}
      </div>
      <h2 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-fg">
        {trial.title}
      </h2>
      {detail?.sponsor && (
        <p className="mt-1 text-sm text-fg-muted">Sponsor · {detail.sponsor}</p>
      )}
    </div>
  );
}
