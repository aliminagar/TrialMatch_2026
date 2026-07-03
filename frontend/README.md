# TrialMatch AI — Web App

A polished Next.js frontend for TrialMatch AI: enter a patient profile, watch the
LangGraph agentic pipeline run in real time, and read per-criterion eligibility
verdicts **grounded in each trial's own words** — evaluated by Claude.

> Research and educational decision-support only. Not a medical device; every
> verdict requires clinician review.

## Features

- **Live agentic pipeline view** — a 5-node stepper (profile intake → trial
  discovery → eligibility parsing → criterion evaluation → verdict aggregation)
  and an activity feed, driven by the backend's Server-Sent Events stream over
  `POST /api/v1/match` (consumed with `fetch` + a `ReadableStream` reader).
- **Grounded criteria table** — per-criterion verdict, reasoning, a confidence
  meter, and an expandable **verbatim source citation** (the product's
  differentiator). Filter by verdict, full-text search, sort by confidence.
- **Verdict summary** — animated radial score ring with count-up, a colour-coded
  aggregate badge, and PASS / FAIL / INSUFFICIENT stat chips.
- **Claude usage panel** — model, API calls, input/output tokens, approximate
  cost, and latency for the run (from the backend `MatchReport.llm_stats`).
- **Patient profile form** — `react-hook-form` + `zod` validation (ICD-10
  pattern, age range, 2-letter country), segmented controls for sex and ECOG
  (with grade descriptions), a tag input for medications, and a one-click
  **Load sample patient** button (58F breast cancer, C50.911, ECOG 1,
  metformin + lisinopril, Los Angeles / US).
- **Designed states** — idle, no-trials, backend-unreachable, and
  stream-interrupted, each with an icon, explanation, and retry.
- **Light + dark themes** (`next-themes`), warm-neutral base + medical-teal
  accent, verdict semantics (green / amber / rose) chosen for **WCAG 2.1 AA**
  contrast in both themes.
- **Purposeful motion** (`framer-motion`) — staggered rows, stepper transitions,
  count-up, spring badge reveal — all gated by `prefers-reduced-motion`.

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · framer-motion ·
next-themes · react-hook-form · zod · lucide-react · Vitest + Testing Library.

## Architecture notes

- `src/lib/types.ts` mirrors the backend Pydantic contracts exactly.
- `src/lib/sse.ts` (frame parser) and `src/lib/matchReducer.ts` (pure reducer:
  events → `{nodeStates, activityLog, result, error}`) are side-effect-free and
  unit-tested. `src/hooks/useMatchRun.ts` is the only place with I/O (fetch,
  clock, abort).
- The browser calls the FastAPI backend directly (CORS enabled); base URL from
  `NEXT_PUBLIC_API_URL`.

## Run it

Two servers. From the repo root:

```bash
# 1) Backend (FastAPI) with the Claude evaluator enabled
cd backend
# ensure ../.env has ANTHROPIC_API_KEY and MODEL_NAME (claude-sonnet-4-6)
TRIALMATCH_USE_LLM=1 ./.venv/Scripts/python -m uvicorn trialmatch.main:app --port 8000

# 2) Frontend (Next.js)
cd frontend
cp .env.local.example .env.local        # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                              # http://localhost:3000
```

Open http://localhost:3000, click **Load sample patient**, then **Find matching
trials**. Without `TRIALMATCH_USE_LLM=1` the backend uses the deterministic rule
evaluator (instant, no API cost); the UI works either way.

> **Cost note:** with the LLM evaluator on, every candidate trial is one Claude
> call (run concurrently). The sample patient discovers ~10 trials, so a run is
> roughly 30k in / 22k out tokens (~$0.40) and ~60s. Use rules mode, or cap
> candidate trials, for a cheaper demo.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run test       # vitest (SSE parser, reducer, form schema, CriteriaTable)
npm run lint       # eslint (next/core-web-vitals)
npx tsc --noEmit   # typecheck
```

## Screenshots

_Add screenshots here:_

- `docs/screenshot-light.png` — results view, light theme
- `docs/screenshot-dark.png` — live pipeline, dark theme
- `docs/screenshot-grounding.png` — expanded criterion with source citation
