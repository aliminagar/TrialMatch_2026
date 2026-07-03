import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

import type { AggregateVerdict, Verdict } from "./types";

export type VerdictTone = "pass" | "review" | "fail";

/** Map any verdict/aggregate enum to its semantic color tone. */
export function verdictTone(v: Verdict | AggregateVerdict): VerdictTone {
  switch (v) {
    case "PASS":
    case "LIKELY_MATCH":
      return "pass";
    case "FAIL":
    case "LIKELY_NO_MATCH":
      return "fail";
    default:
      return "review"; // INSUFFICIENT_INFO, NEEDS_REVIEW
  }
}

/** Human-readable label for a verdict/aggregate enum. */
export function verdictLabel(v: Verdict | AggregateVerdict): string {
  return v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
