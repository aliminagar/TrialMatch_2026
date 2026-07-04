# TrialMatch AI — Web App (frontend deep-dive)

The Next.js frontend for TrialMatch AI: enter a patient profile, watch the LangGraph
pipeline run live over SSE, and explore a data-rich, grounded results dashboard.

> For the **product overview, architecture, screenshots, and full getting-started**, see the
> [**root README**](../README.md). This document is a frontend engineering deep-dive — the
> streaming model, the pure/tested core, the component/lib inventory, and the design system —
> and deliberately avoids duplicating the product walkthrough.

> ⚕️ Research and educational decision-support only. Not a medical device; every verdict
> requires clinician review.

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · framer-motion · **recharts**
(data-viz) · next-themes · react-hook-form · zod · **jsPDF** (client-side PDF) · lucide-react ·
Vitest + Testing Library.

## How results stream in

`POST /api/v1/match` is a **Server-Sent Events** stream, so it can't use `EventSource` (GET-only).
Instead the browser calls the backend directly (CORS; base URL from `NEXT_PUBLIC_API_URL`) with
`fetch` and reads the body as a `ReadableStream`:

- **`src/lib/api.ts`** — `streamMatch(patient, maxResults, signal)` is an async generator: it
  POSTs the request, decodes the stream, and yields typed `StreamEvent`s. `buildMatchRequest`
  wires the **Trials to evaluate** choice (3 / 5 / 10 / All) to the API's `options.max_results`.
  It also exposes `fetchTrialDetail` (phase/status for the results header) and `describeError`.
- **`src/lib/sse.ts`** — a pure SSE **frame parser**: splits on blank-line boundaries, joins
  multi-line `data:` fields, skips keepalives/comments, tolerates CRLF, and carries a partial
  trailing frame into the next chunk. `decodeStreamEvent` validates each frame into the typed union.
- **`src/lib/matchReducer.ts`** — a **pure reducer**: `(state, action) → state`, mapping stream
  events to `{ status, nodeStates, activityLog, result, error }`. It's clock-injected (timestamps
  are passed in) so tests are deterministic, and it derives the stepper's "active" cursor from the
  backend's per-node `completed` frames — it never fabricates progress the backend didn't send.
- **`src/hooks/useMatchRun.ts`** — the only side-effectful layer: owns the reducer, the `fetch`
  `AbortController` (the CTA becomes **Cancel** mid-run), and the consumption loop.

`src/lib/types.ts` mirrors the backend Pydantic contracts exactly, including the optional
`MatchReport.llm_stats` (model / tokens / cost / latency).

## Component inventory

| Area | Components |
|---|---|
| Input | `ProfileForm` (react-hook-form + zod), `ui/SegmentedControl`, `ui/TagInput` |
| Pipeline | `PipelineStepper`, `ActivityFeed` |
| Results — overview | `ResultsView`, `ResultsOverview`, `ResultsCharts` (recharts donut / score bar / category bar), `TrialControls`, `ExportButtons`, `LlmStatsBar`, `MatchConfidenceBar` |
| Results — per trial | `TrialAccordion`, `CriteriaTable`, `CriterionRow`, `GlobalCriteriaView` (by-verdict), `VerdictBadge`, `ScoreRing`, `ui/ConfidenceBar` |
| Chrome / primitives | `Header` (hero), `Footer`, `ThemeToggle`, `theme-provider`, `ui/EmptyState`, `ui/CountUp` |

Pure, testable view logic lives in **`src/lib/trialViews.ts`** (verdict distribution, sort,
filter, top candidates, criteria-by-category, score ranking, cross-trial flatten) and
**`src/lib/profileSchema.ts`** (zod schema, form↔`PatientProfile` mapping, the 3 sample
profiles' form values, and the labs/comorbidities "extras" carried alongside the form).

## Patient form & sample profiles

`ProfileForm` validates inline (ICD-10 pattern, age range, 2-letter country) and exposes a
**3-profile dropdown** (minimal breast / full-workup breast / NSCLC male). Loading a profile
resets the editable fields and carries its **labs + comorbidities** as "extras" (there is no lab
UI) that are merged back into the `PatientProfile` on submit — with an indicator confirming what
will be sent. Medications and **prior treatments** are tag inputs.

## Export

`src/lib/exportReport.ts` holds pure builders — `serializeReportJson`, `reportFileBase`, and
`buildReportLines` (an ordered, styled line model) — plus thin download helpers. `ExportButtons`
renders **Download report** (a formatted PDF via jsPDF, imported dynamically) and **JSON**.

## Design system

CSS-variable design tokens in `src/styles/globals.css`, mapped to Tailwind utilities in
`tailwind.config.ts`: a warm-neutral base, **teal primary + indigo secondary**, and green /
amber / rose **verdict semantics** with gradient variants for badges, rings, and bars — all
chosen for **WCAG 2.1 AA** contrast in **light and dark** (`next-themes`). Motion
(`framer-motion`) is purposeful — sequenced page-load reveals, count-ups, a score-ring fill
sheen, hover elevations, a drifting gradient-mesh hero — and every animation respects
**`prefers-reduced-motion`**. Accordions and controls are keyboard-operable with correct
`aria-expanded` / `aria-controls`.

## Testing

**60 tests** (Vitest + Testing Library, jsdom):

- `sse.test.ts` — frame parser (multi-line data, keepalives, CRLF, partial-chunk carry, decode)
- `matchReducer.test.ts` — state transitions incl. error / interrupt / failed-node
- `trialViews.test.ts` — distribution, sort, filter, top candidates, category, score ranking
- `profileSchema.test.ts` — validation, form↔profile mapping, sample loading, extras merge
- `api.test.ts` — `buildMatchRequest` / `max_results` mapping
- `exportReport.test.ts` — JSON + PDF-line serialization
- render tests — `CriteriaTable`, `TrialAccordion` (collapse/expand), `ResultsOverview`
  (a recharts render smoke test)

## Scripts

```bash
npm run dev        # dev server (http://localhost:3000)
npm run build      # production build
npm run test       # vitest
npm run lint       # eslint (next/core-web-vitals)
npx tsc --noEmit   # typecheck
```

## Run against the backend

```bash
cp .env.local.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

Start the backend separately (see the [root README](../README.md)). Without
`TRIALMATCH_USE_LLM=1` the backend uses the deterministic rule evaluator (instant, no API cost);
the UI works either way.

> **Cost note:** with the Claude evaluator on, each evaluated trial is one concurrent call. The
> **Trials to evaluate** selector defaults to **5** (≈$0.18, ~1 min); 3 is ≈$0.07 and 10 is
> ≈$0.40. Use rules mode or a lower cap for a cheaper demo.
