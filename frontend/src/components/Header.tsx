import { Activity, Github } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";

const STACK = ["LangGraph", "FastAPI", "Claude", "Next.js"];

export function Header() {
  return (
    <header className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
            <Activity className="h-6 w-6" strokeWidth={2.25} aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">TrialMatch AI</h1>
            <p className="max-w-xl text-sm text-fg-muted">
              Agentic clinical trial eligibility matching, grounded in the trial&apos;s own
              words.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/alirezaminagar/trialmatch-ai"
            target="_blank"
            rel="noreferrer"
            aria-label="View source on GitHub"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
          >
            <Github className="h-[18px] w-[18px]" aria-hidden />
          </a>
          <ThemeToggle />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {STACK.map((s) => (
          <span
            key={s}
            className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-muted"
          >
            {s}
          </span>
        ))}
      </div>
    </header>
  );
}
