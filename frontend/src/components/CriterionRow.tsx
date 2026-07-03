"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Quote } from "lucide-react";
import { useState } from "react";

import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { VerdictBadge } from "@/components/VerdictBadge";
import type { CriterionVerdict } from "@/lib/types";
import { cn, verdictTone } from "@/lib/utils";

export function CriterionRow({
  cv,
  index,
}: {
  cv: CriterionVerdict;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const tone = verdictTone(cv.verdict);
  const detailId = `criterion-detail-${index}`;

  return (
    <>
      <motion.tr
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(index * 0.03, 0.4) }}
        onClick={() => setOpen((v) => !v)}
        className="group cursor-pointer border-t border-border align-top transition-colors hover:bg-surface-2"
      >
        <td className="py-3 pl-4 pr-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={open ? "Collapse criterion detail" : "Expand criterion detail"}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="mt-0.5 text-fg-subtle transition-transform group-hover:text-fg-muted"
          >
            <ChevronRight
              size={16}
              className={cn("transition-transform", open && "rotate-90")}
              aria-hidden
            />
          </button>
        </td>
        <td className="py-3 pr-3">
          <VerdictBadge verdict={cv.verdict} size="sm" />
        </td>
        <td className="py-3 pr-3">
          <p
            className={cn(
              "text-sm text-fg",
              !open && "line-clamp-2",
            )}
          >
            {cv.criterion.source_text}
          </p>
          <p className="mt-1 text-xs capitalize text-fg-subtle">
            {cv.criterion.criterion_type} · {cv.criterion.category.replace(/_/g, " ")}
          </p>
        </td>
        <td className="hidden py-3 pr-3 md:table-cell">
          <p className={cn("text-sm text-fg-muted", !open && "line-clamp-2")}>
            {cv.reasoning}
          </p>
        </td>
        <td className="py-3 pr-4">
          <ConfidenceBar value={cv.confidence} tone={tone} />
        </td>
      </motion.tr>

      {open && (
        <tr id={detailId} className="border-t border-border/60 bg-surface-2/40">
          <td />
          <td colSpan={4} className="py-3 pr-4">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-fg-muted md:hidden">{cv.reasoning}</p>
              <figure className="rounded-lg border-l-2 border-accent-strong bg-surface px-3.5 py-2.5">
                <figcaption className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                  <Quote size={12} aria-hidden />
                  Grounded in the trial&apos;s own words
                </figcaption>
                <blockquote className="font-mono text-xs leading-relaxed text-fg">
                  {cv.source_citation}
                </blockquote>
              </figure>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
