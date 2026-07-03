import { Activity, Github } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { VerdictBadge } from "@/components/VerdictBadge";
import { VerdictSummary } from "@/components/VerdictSummary";
import { SAMPLE_TRIAL_VERDICT } from "@/lib/sample";

const STACK = ["LangGraph", "FastAPI", "Claude", "Next.js"];

/**
 * Stage 3 design preview. Shows the design language (tokens, fonts, theme) and
 * the representative VerdictSummary + ScoreRing so the look can be reviewed in
 * both light and dark mode before the full component layer is built.
 */
export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-subtle text-accent">
            <Activity className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-fg">TrialMatch AI</h1>
            <p className="text-sm text-fg-muted">
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
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {STACK.map((s) => (
          <span
            key={s}
            className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-muted"
          >
            {s}
          </span>
        ))}
      </div>

      <main className="mt-10 flex flex-1 flex-col gap-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
            Design preview · Stage 3
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-fg">
            Verdict summary
          </h2>
        </div>

        <VerdictSummary trial={SAMPLE_TRIAL_VERDICT} />

        <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-fg-subtle">
            Verdict palette (WCAG AA, both themes)
          </p>
          <div className="flex flex-wrap gap-3">
            <VerdictBadge verdict="LIKELY_MATCH" size="md" />
            <VerdictBadge verdict="NEEDS_REVIEW" size="md" />
            <VerdictBadge verdict="LIKELY_NO_MATCH" size="md" />
            <VerdictBadge verdict="PASS" size="sm" />
            <VerdictBadge verdict="INSUFFICIENT_INFO" size="sm" />
            <VerdictBadge verdict="FAIL" size="sm" />
          </div>
        </section>
      </main>
    </div>
  );
}
