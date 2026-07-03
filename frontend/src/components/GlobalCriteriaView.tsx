"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, Quote, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { VerdictBadge } from "@/components/VerdictBadge";
import { trialUrl } from "@/lib/api";
import { flattenCriteria } from "@/lib/trialViews";
import type { TrialVerdict, Verdict } from "@/lib/types";
import { cn, verdictTone } from "@/lib/utils";

type FilterKey = "ALL" | Verdict;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PASS", label: "Pass" },
  { key: "FAIL", label: "Fail" },
  { key: "INSUFFICIENT_INFO", label: "Insufficient" },
];

export function GlobalCriteriaView({ trials }: { trials: TrialVerdict[] }) {
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const flat = useMemo(() => flattenCriteria(trials), [trials]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      ALL: flat.length,
      PASS: 0,
      FAIL: 0,
      INSUFFICIENT_INFO: 0,
    };
    for (const f of flat) c[f.cv.verdict] += 1;
    return c;
  }, [flat]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flat.filter((f) => {
      if (filter !== "ALL" && f.cv.verdict !== filter) return false;
      if (!q) return true;
      return (
        f.cv.criterion.source_text.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        f.nctId.toLowerCase().includes(q)
      );
    });
  }, [flat, filter, query]);

  return (
    <section
      aria-label="All criteria across trials"
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
    >
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter criteria by verdict" className="flex flex-wrap gap-1">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                filter === key
                  ? "bg-accent-subtle text-accent"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {label}
              <span className="ml-1.5 tabular-nums text-fg-subtle">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search criteria or trials…"
            aria-label="Search criteria across trials"
            className="w-full rounded-xl border border-border bg-surface py-1.5 pl-9 pr-3 text-sm text-fg outline-none focus:border-accent-strong sm:w-64"
          />
        </div>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((f, i) => {
          const key = `${f.nctId}-${i}`;
          const open = openKey === key;
          return (
            <li key={key}>
              <motion.button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenKey(open ? null : key)}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduce ? 0 : Math.min(i * 0.015, 0.3) }}
                className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-surface-2/50"
              >
                <VerdictBadge verdict={f.cv.verdict} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm text-fg", !open && "line-clamp-2")}>
                    {f.cv.criterion.source_text}
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-accent">
                    {f.nctId}
                  </span>
                </div>
                <div className="shrink-0 pt-0.5">
                  <ConfidenceBar value={f.cv.confidence} tone={verdictTone(f.cv.verdict)} />
                </div>
              </motion.button>
              {open && (
                <div className="flex flex-col gap-3 px-3 pb-3">
                  <p className="text-sm text-fg-muted">{f.cv.reasoning}</p>
                  <figure className="rounded-lg border-l-2 border-accent-strong bg-surface-2 px-3.5 py-2.5">
                    <figcaption className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                      <Quote size={12} aria-hidden />
                      Grounded quote
                    </figcaption>
                    <blockquote className="font-mono text-xs leading-relaxed text-fg">
                      {f.cv.source_citation}
                    </blockquote>
                  </figure>
                  <a
                    href={trialUrl(f.nctId)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:opacity-80"
                  >
                    Open {f.nctId} on ClinicalTrials.gov
                    <ExternalLink size={11} aria-hidden />
                  </a>
                </div>
              )}
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">
            No criteria match this filter.
          </li>
        )}
      </ul>
    </section>
  );
}
