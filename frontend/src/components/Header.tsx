import { Activity, Github } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";

const STACK = ["LangGraph", "FastAPI", "Claude", "Next.js"];

export function Header() {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
      {/* GPU-cheap gradient mesh — blurred, slowly drifting blobs. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-16 -top-24 h-64 w-64 rounded-full blur-3xl animate-float-a"
          style={{ background: "radial-gradient(circle, var(--mesh-1), transparent 70%)" }}
        />
        <div
          className="absolute right-0 top-0 h-72 w-72 rounded-full blur-3xl animate-float-b"
          style={{ background: "radial-gradient(circle, var(--mesh-2), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full blur-3xl animate-float-a"
          style={{ background: "radial-gradient(circle, var(--mesh-1), transparent 70%)" }}
        />
      </div>

      <div className="relative flex flex-col gap-6 p-7 sm:p-9">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-strong to-secondary-strong text-white shadow-card-lg">
              <Activity className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gradient sm:text-4xl">
                TrialMatch AI
              </h1>
              <p className="mt-1 max-w-xl text-sm text-fg-muted sm:text-base">
                Agentic clinical trial eligibility matching, grounded in the trial&apos;s own
                words.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/aliminagar/TrialMatch_2026"
              target="_blank"
              rel="noreferrer"
              aria-label="View source on GitHub"
              className="glass inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
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
              className="glass inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-fg-muted"
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-accent-strong to-secondary-strong"
                aria-hidden
              />
              {s}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
