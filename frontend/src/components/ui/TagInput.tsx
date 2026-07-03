"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel: string;
  id?: string;
}

/** Chip/tag entry: type + Enter (or comma) to add, Backspace to remove last. */
export function TagInput({ value, onChange, placeholder, ariaLabel, id }: TagInputProps) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (!value.some((v) => v.toLowerCase() === tag.toLowerCase())) {
      onChange([...value, tag]);
    }
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-2",
        "focus-within:border-accent-strong",
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-lg bg-accent-subtle px-2 py-0.5 text-sm text-accent"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="rounded transition-opacity hover:opacity-70"
          >
            <X size={13} aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        aria-label={ariaLabel}
        value={draft}
        placeholder={value.length === 0 ? placeholder : ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        className="min-w-[8ch] flex-1 bg-transparent py-0.5 text-sm text-fg outline-none placeholder:text-fg-subtle"
      />
    </div>
  );
}
