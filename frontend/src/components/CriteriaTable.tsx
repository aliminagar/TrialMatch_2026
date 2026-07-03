"use client";

import { ArrowUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { CriterionRow } from "@/components/CriterionRow";
import type { CriterionVerdict, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

type FilterKey = "ALL" | Verdict;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PASS", label: "Pass" },
  { key: "FAIL", label: "Fail" },
  { key: "INSUFFICIENT_INFO", label: "Insufficient" },
];

export function CriteriaTable({ criteria }: { criteria: CriterionVerdict[] }) {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [query, setQuery] = useState("");
  const [sortDesc, setSortDesc] = useState<boolean | null>(null);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      ALL: criteria.length,
      PASS: 0,
      FAIL: 0,
      INSUFFICIENT_INFO: 0,
    };
    for (const cv of criteria) c[cv.verdict] += 1;
    return c;
  }, [criteria]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = criteria.filter((cv) => {
      if (filter !== "ALL" && cv.verdict !== filter) return false;
      if (!q) return true;
      return (
        cv.criterion.source_text.toLowerCase().includes(q) ||
        cv.reasoning.toLowerCase().includes(q)
      );
    });
    if (sortDesc !== null) {
      list = [...list].sort((a, b) =>
        sortDesc ? b.confidence - a.confidence : a.confidence - b.confidence,
      );
    }
    return list;
  }, [criteria, filter, query, sortDesc]);

  return (
    <section
      aria-label="Criteria evaluation"
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
            placeholder="Search criteria…"
            aria-label="Search criteria"
            className="w-full rounded-xl border border-border bg-surface py-1.5 pl-9 pr-3 text-sm text-fg outline-none focus:border-accent-strong sm:w-56"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Per-criterion eligibility verdicts with reasoning, confidence, and the grounded
            source citation.
          </caption>
          <thead>
            <tr className="text-xs uppercase tracking-wider text-fg-subtle">
              <th scope="col" className="w-8 py-2.5 pl-4" />
              <th scope="col" className="py-2.5 pr-3 font-medium">
                Verdict
              </th>
              <th scope="col" className="py-2.5 pr-3 font-medium">
                Criterion
              </th>
              <th scope="col" className="hidden py-2.5 pr-3 font-medium md:table-cell">
                Reasoning
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                <button
                  type="button"
                  onClick={() => setSortDesc((v) => (v === null ? true : !v))}
                  className="inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-fg"
                  aria-label="Sort by confidence"
                >
                  Confidence
                  <ArrowUpDown size={12} aria-hidden />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cv, i) => (
              <CriterionRow key={`${cv.criterion.source_text}-${i}`} cv={cv} index={i} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">
            No criteria match this filter.
          </p>
        )}
      </div>
    </section>
  );
}
