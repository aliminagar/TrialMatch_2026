"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "neutral" | "error";
  action?: { label: string; onClick: () => void };
  className?: string;
}

/** Designed empty/error state — used for no-trials, backend-down, interrupted. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-card",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex h-12 w-12 items-center justify-center rounded-2xl",
          tone === "error" ? "bg-fail-bg text-fail-fg" : "bg-surface-2 text-fg-muted",
        )}
      >
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-border-strong"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
