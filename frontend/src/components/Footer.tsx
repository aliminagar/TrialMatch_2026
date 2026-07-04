import { CheckCircle, FileText, Search } from "lucide-react";

const STEPS = [
  { icon: Search, title: "Discover", body: "Query ClinicalTrials.gov for candidate trials." },
  { icon: FileText, title: "Parse", body: "Break eligibility prose into structured criteria." },
  {
    icon: CheckCircle,
    title: "Evaluate",
    body: "Judge each criterion, grounded in its verbatim text.",
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border pt-10">
      <div className="grid gap-4 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent">
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-fg">{title}</h3>
              <p className="mt-0.5 text-sm text-fg-muted">{body}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-10 text-xs text-fg-subtle">
        TrialMatch AI is a research and educational decision-support tool — not a medical
        device. All verdicts require clinician review.{" "}
        <a
          href="https://github.com/aliminagar/TrialMatch_2026"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          Source on GitHub
        </a>
        .
      </p>
      <p className="mt-4 text-center text-xs text-fg-subtle">
        Created by Alireza Minagar © 2026. All rights reserved.
      </p>
    </footer>
  );
}
