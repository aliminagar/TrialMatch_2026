# TrialMatch AI

> **Agentic clinical-trial eligibility matching, grounded in the trial's own words.**
> Enter a patient profile → discover live trials from ClinicalTrials.gov → parse each trial's eligibility prose into structured criteria → evaluate every criterion with Claude → get a ranked report where **each verdict cites the verbatim trial text it was based on**.

![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1.x-1C3C3C)
![Anthropic Claude](https://img.shields.io/badge/Anthropic-Claude-D97757?logo=anthropic&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Tests](https://img.shields.io/badge/tests-155%20backend%20%2B%2060%20frontend-brightgreen)

<p align="center">
  <img src="docs/images/01-hero-dark.png" width="49%" alt="TrialMatch AI hero — dark mode" />
  <img src="docs/images/02-hero-light.png" width="49%" alt="TrialMatch AI hero — light mode" />
</p>

**Hero — dark and light.** The landing header: gradient wordmark, tagline, and a technology-stack chip row. The whole app is fully designed in both themes.

---

## Overview

**TrialMatch AI** is an agentic clinical-trial eligibility matcher. Given a structured patient profile, it queries the **ClinicalTrials.gov v2** registry for candidate trials, splits each trial's free-text inclusion/exclusion criteria into discrete, structured rules, and judges every rule against the patient — producing a ranked report of `PASS` / `FAIL` / `INSUFFICIENT_INFO` verdicts with reasoning and a confidence score.

The differentiator is **grounding**: every criterion verdict carries the **verbatim criterion text** it was evaluated against, so a clinician can audit each decision against the trial's own words rather than trusting an opaque score. Orchestration is a **LangGraph** state machine; the criterion evaluator can run as a fully-deterministic rule engine (offline, no API cost) or delegate to **Claude** — and the pipeline streams its progress to a **Next.js** dashboard node-by-node over Server-Sent Events.

> ⚕️ **This is a research and educational decision-support tool — not a medical device.** Every verdict requires clinician review.

---

## Table of Contents

- [Key Features](#key-features)
- [How a Match Works (walkthrough)](#how-a-match-works)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Engineering Highlights](#engineering-highlights)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Limitations & Roadmap](#limitations--roadmap)
- [Frontend Details](#frontend-details)
- [Author](#author)
- [Screenshot Capture Guide](#screenshot-capture-guide)

---

## Key Features

### 🧬 Agentic pipeline (LangGraph, 5 nodes)

A linear LangGraph state machine threads a typed `AgentState` through five nodes: **profile intake → trial discovery → eligibility parsing → criterion evaluation → verdict aggregation**. Each node is a pure `async` function returning a partial-state update that LangGraph merges into the run.

### 📡 Live streaming (SSE)

`POST /api/v1/match` is **content-negotiated**: send `Accept: text/event-stream` and it returns a Server-Sent Events stream — one `state_update` frame per node as it completes, then a terminal `final_result` (or an `error` frame). The frontend consumes this over **`fetch` + a `ReadableStream` reader** (not `EventSource`, which is GET-only) and drives a node-by-node stepper and a live activity feed. Without the SSE header, the same endpoint returns the full report as a single JSON response.

<p align="center"><img src="docs/images/08-pipeline-running.png" width="80%" alt="Pipeline stepper mid-run" /></p>

**Live pipeline.** The stepper advances as each LangGraph node completes; the active node pulses.

<p align="center"><img src="docs/images/09-pipeline-complete.png" width="80%" alt="Pipeline stepper complete" /></p>

**Pipeline complete.** All five nodes resolved — the run then emits the final report.

### 🎯 Grounded evaluation

Every criterion becomes a `CriterionVerdict`: a `verdict` (`PASS` / `FAIL` / `INSUFFICIENT_INFO`), plain-language `reasoning`, a `confidence` score, and a **`source_citation` holding the verbatim criterion text**. Verdict semantics are uniform across inclusion and exclusion rules — `PASS` always means "good for eligibility," `FAIL` always means "bad for eligibility" — so the aggregate score treats every rule consistently. The verbatim citation is a **required field** on the model, so grounding is enforced by construction rather than left to chance.

<p align="center"><img src="docs/images/18-grounded-citation.png" width="85%" alt="A criterion expanded to show the grounded verbatim quote" /></p>

**Grounding — the differentiator.** Expand any criterion to see the exact trial text the verdict was based on, rendered as a monospace quote.

### 🔀 Dual evaluator (rules + optional Claude)

The evaluator runs one of two ways, chosen by an environment flag:

- **Deterministic rule engine (default):** bounded, reproducible, fully offline per-category routing (demographics, performance status, diagnosis, prior treatment, labs, reproductive, …). This is what the entire test suite exercises — zero network, zero API cost.
- **Claude path (`TRIALMATCH_USE_LLM=1`):** each trial's criteria are sent to Claude in a **single batched structured-output call**, validated back into the `CriterionVerdict` schema. If a call fails, that trial **gracefully falls back** to the deterministic evaluator (logged as a warning, so a silent downgrade can't happen); if the model skips an index, that individual criterion falls back too.

### 📊 Results dashboard (recharts)

The results overview turns a multi-trial run into something scannable: a headline count, a verdict-distribution bar, and three **recharts** visualizations.

<p align="center"><img src="docs/images/10-overview-dark.png" width="90%" alt="Full results overview with charts" /></p>

**Results overview.** Headline, verdict-distribution bar, data-viz row, and top-candidate callout — the "forest," above the per-trial detail.

<p align="center">
  <img src="docs/images/11-verdict-donut.png" width="32%" alt="Verdict-mix donut" />
  <img src="docs/images/12-trials-by-score.png" width="32%" alt="Trials-by-score bar" />
  <img src="docs/images/13-criteria-by-category.png" width="32%" alt="Criteria-by-category bar" />
</p>

**Data-viz row.** Verdict-mix **donut**, trials-ranked-**by-score** bar, and criteria-**by-category** bar (the last one surfaces the underlying criterion data model — diagnosis, lab, performance, prior-treatment, reproductive, …).

<p align="center"><img src="docs/images/14-top-candidates.png" width="90%" alt="Top-candidates callout row" /></p>

**Top candidates.** The highest-scoring trials float to the top, each with a score chip, NCT link, aggregate badge, and a gradient Pass/Insufficient/Fail confidence bar.

Below the overview, each trial is a **keyboard-accessible collapsible accordion** — a compact always-visible header (NCT link, title, phase/status, verdict badge, small score ring, P/F/I counts) with the full criteria table collapsed by default; only the top-ranked trial auto-expands.

<p align="center"><img src="docs/images/16-trial-accordion.png" width="90%" alt="Collapsed trial accordion header" /></p>

**Collapsible trial card.** The always-visible header; click to expand the criteria table.

<p align="center"><img src="docs/images/17-criteria-table.png" width="90%" alt="Expanded criteria table" /></p>

**Criteria table.** Per-criterion verdict, reasoning, and confidence — filter by verdict, full-text search, sort by confidence.

Trials can be **sorted** (score / verdict / phase), **filtered** (by verdict and phase), and **searched** (title / NCT). A **By trial ↔ By verdict** toggle flips to a flattened cross-trial view so you can, for example, read every `FAIL` across all trials at once.

<p align="center"><img src="docs/images/19-by-verdict-view.png" width="90%" alt="By-verdict global cross-trial view" /></p>

**By-verdict view.** Every criterion across all trials in one list — filter to a single verdict to scan the whole match at that altitude.

### 💰 Cost observability

When the Claude path runs, the per-run **model, API-call count, input/output token counts, approximate USD cost, and latency** are captured (from the model's `usage_metadata`) and ride along on the `final_result` event — surfaced in-app in a "Powered by Claude" stats bar and printed to the backend logs.

<p align="center"><img src="docs/images/15-llm-stats.png" width="80%" alt="Powered by Claude stats bar" /></p>

**Cost transparency.** Model, calls, tokens, cost, and latency for the run — no hidden spend.

### 📄 Export (PDF + JSON)

One click exports the full report — patient profile, every trial's verdicts with reasoning and grounded citations, and the Claude usage stats — as a formatted **PDF** (generated client-side with jsPDF) or as **JSON** for programmatic use. This is the "clinical coordinator needs to save and share findings" workflow.

<p align="center"><img src="docs/images/20-export-and-light.png" width="90%" alt="Export buttons and light-mode results" /></p>

**Export & light mode.** The Download report / JSON controls, shown here in light theme.

### 🧑‍⚕️ Sample profiles

The form ships with a **three-profile dropdown** so a first-time visitor can demo variety in one click:

- **Breast cancer · 58F (minimal)** — sparse data; most criteria resolve to `INSUFFICIENT_INFO` (the honest "not enough data" case).
- **Breast cancer · 58F (full workup)** — HR+/HER2− receptor status, five labs, prior endocrine/chemo therapy, comorbidities.
- **Lung cancer · 45M (NSCLC)** — a different sex, cancer type, ECOG 0, treatment-naive.

The richer profile measurably improves resolution: on a live run, the same trials went from **7 → 18 `PASS` verdicts** simply by supplying receptor status, labs, and prior treatments — concrete evidence that structured patient data drives better matching.

<p align="center">
  <img src="docs/images/04-sample-dropdown.png" width="49%" alt="Sample-patient dropdown open" />
  <img src="docs/images/06-form-filled-rich.png" width="49%" alt="Form filled with the full-workup profile" />
</p>

**Sample profiles.** The dropdown (left) and the full-workup profile loaded (right) — note the labs indicator confirming the extra data will be sent to the evaluator.

### 🎛️ Patient form & run controls

A `react-hook-form` + `zod` form with inline validation (ICD-10 pattern, age range, 2-letter country), a segmented ECOG control with grade descriptions, tag inputs for medications and prior treatments, and a **Trials to evaluate** selector (3 / 5 / 10 / All) wired end-to-end to the API's `max_results` cap — because each evaluated trial is one Claude call, this directly bounds run cost and time.

<p align="center">
  <img src="docs/images/03-empty-form.png" width="32%" alt="Empty patient form, ready-to-match state" />
  <img src="docs/images/05-form-filled-basic.png" width="32%" alt="Form filled with the minimal profile" />
  <img src="docs/images/07-trials-selector.png" width="32%" alt="Trials to evaluate selector" />
</p>

**Form states.** Empty (left), filled with the minimal profile (center), and the trials-to-evaluate selector (right).

### 🌗 Theming & accessibility

Fully-designed **light and dark** themes (`next-themes`) built on CSS-variable design tokens — a warm-neutral base with a teal primary and indigo secondary, and green/amber/rose verdict semantics chosen for **WCAG 2.1 AA** contrast in both themes. Motion (`framer-motion`) is purposeful — staggered reveals, count-ups, a score-ring fill sheen — and every animation respects **`prefers-reduced-motion`**. Accordions are keyboard-operable with correct `aria-expanded` / `aria-controls`.

---

## How a Match Works

An end-to-end trace of a single run:

1. **Enter a patient** — fill the structured form (or load a sample profile) and pick how many trials to evaluate.
   <br><img src="docs/images/03-empty-form.png" width="70%" alt="Empty form" />
2. **Run streams live** — the request opens an SSE stream; the pipeline stepper advances node-by-node as each LangGraph stage completes.
   <br><img src="docs/images/09-pipeline-complete.png" width="70%" alt="Pipeline complete" />
3. **Read the overview** — the `final_result` lands and the dashboard renders: distribution, charts, top candidates, and the Claude cost bar.
   <br><img src="docs/images/10-overview-dark.png" width="80%" alt="Results overview" />
4. **Drill into a trial** — expand a trial to read every criterion's verdict, reasoning, and confidence.
   <br><img src="docs/images/17-criteria-table.png" width="80%" alt="Criteria table" />
5. **Audit the grounding** — expand a criterion to see the verbatim trial text the verdict was based on. Export the whole thing to PDF or JSON.
   <br><img src="docs/images/18-grounded-citation.png" width="80%" alt="Grounded citation" />

---

## Architecture

The backend is a **LangGraph** state machine exposed through a thin **FastAPI** layer. A single typed `AgentState` (a `TypedDict` with LangGraph reducers) flows through five nodes; the graph builder accepts a **dependency-injected `ClinicalTrialsClient`** so the FastAPI server can share one long-lived HTTP client and tests can inject a `MockTransport`-backed one (no network). The `/api/v1/match` endpoint is content-negotiated — the same graph run is either streamed as SSE or returned as a single JSON `MatchReport`.

```mermaid
flowchart LR
  subgraph Client
    FE["Next.js dashboard<br/>fetch + ReadableStream (SSE)"]
  end
  subgraph API["FastAPI service"]
    EP_API["POST /api/v1/match<br/>(SSE or JSON, content-negotiated)"]
    TR_API["GET /api/v1/trials/{nct_id}"]
  end
  subgraph Graph["LangGraph state machine"]
    N1["profile_extractor<br/>validate PatientProfile"]
    N2["trial_discovery<br/>ClinicalTrials.gov v2"]
    N3["eligibility_parser<br/>prose → structured criteria"]
    N4["match_evaluator<br/>rules OR Claude (batched, concurrent)"]
    N5["report_generator<br/>ranked MatchReport"]
  end
  CT["ClinicalTrials.gov v2 API"]
  LLM["Claude (langchain-anthropic)<br/>structured output"]

  FE -->|patient profile| EP_API
  EP_API --> N1 --> N2 --> N3 --> N4 --> N5
  N2 <-->|search / fetch| CT
  N4 <-->|batched structured call| LLM
  N5 -->|state_update* → final_result| EP_API
  EP_API -->|SSE frames| FE
  FE -.->|phase/status| TR_API --> CT
```

**Node responsibilities:**

| Node | What it does |
|---|---|
| `profile_extractor` | Validates the structured input against the `PatientProfile` Pydantic model. |
| `trial_discovery` | Queries ClinicalTrials.gov v2 by diagnosis, filtered by locality and recruiting status; caps candidates to `max_results`. |
| `eligibility_parser` | Splits each trial's inclusion/exclusion prose into individual `Criterion` objects, routed to a category by keyword. |
| `match_evaluator` | Judges each criterion — deterministic rules or Claude (one batched structured-output call **per trial, run concurrently** with `asyncio.gather`); aggregates into a scored `TrialVerdict`. |
| `report_generator` | Assembles the ranked `MatchReport` with a framing-compliant summary ("criteria appear to be met," never "the patient qualifies"). |

The evaluator's HTTP resilience (retry/backoff on transient ClinicalTrials.gov failures) is handled with **tenacity**; SSE is served via **sse-starlette**.

---

## Tech Stack

**Backend**
- Python 3.11+ · **FastAPI** (async service layer)
- **LangGraph** (stateful multi-agent orchestration) · **langchain-anthropic** (Claude structured output)
- **Pydantic v2** (typed data contracts) · **httpx** + **tenacity** (resilient ClinicalTrials.gov client) · **sse-starlette** (SSE)
- **pytest** / pytest-asyncio · **ruff** · **mypy** (strict)

**Frontend**
- **Next.js 14** (App Router) · **TypeScript** (strict)
- **Tailwind CSS** (CSS-variable design tokens) · **framer-motion** (motion) · **recharts** (data-viz)
- **react-hook-form** + **zod** (form + validation) · **next-themes** (theming) · **jsPDF** (client-side PDF)
- **Vitest** + Testing Library

**Infrastructure**
- **Docker** (per-service Dockerfiles) · **docker-compose** (one-command local stack) · Make targets

---

## Engineering Highlights

- **Test rigor.** **155 backend tests** (unit + integration) and **60 frontend tests** (Vitest + Testing Library). The backend suite is **fully offline** — the LLM is mocked and the ClinicalTrials.gov client is backed by an httpx `MockTransport`, so the whole suite runs with **zero network in ~2 seconds**.
- **Clean gates.** `ruff` + `mypy --strict` on the backend; `tsc --noEmit` + ESLint on the frontend — all clean.
- **Grounding by construction.** `CriterionVerdict.source_citation` is a required field, and the evaluator populates it with the verbatim criterion text for every verdict — the audit trail can't be omitted.
- **Concurrent evaluation.** On the Claude path, per-trial evaluations run concurrently (`asyncio.gather`); a 10-trial run dropped from minutes (sequential) to ~60 s.
- **Cost transparency, measured live.** Real runs cost roughly **$0.04–$0.40** depending on the trial cap (≈$0.07 for 3 trials, ≈$0.18 for 5, ≈$0.40 for 10) — surfaced in-app, never hidden.
- **Structured data improves matching — with evidence.** Swapping the minimal sample for the full-workup profile (receptor status + labs + prior treatments) more than doubled resolved criteria on a live run (**7 → 18 `PASS`**).
- **Graceful degradation.** Any Claude failure falls back to the deterministic evaluator and is logged as a warning — the run always completes, and a silent downgrade is impossible.

---

## Getting Started

### Prerequisites
- **Python 3.11+** (developed on 3.12)
- **Node.js 20+**
- An **Anthropic API key** (only needed to enable the Claude evaluator; the deterministic path and all tests run without one)

### Quickest path — Docker

```bash
cp .env.example .env         # add your ANTHROPIC_API_KEY (see .env.example)
docker compose up --build
# Backend → http://localhost:8000   Frontend → http://localhost:3000
```

### Manual — backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate               # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

cp ../.env.example ../.env               # add ANTHROPIC_API_KEY and MODEL_NAME
# Deterministic rules (offline, no key needed):
uvicorn trialmatch.main:app --port 8000
# …or enable the Claude evaluator:
TRIALMATCH_USE_LLM=1 uvicorn trialmatch.main:app --port 8000
```

### Manual — frontend

```bash
cd frontend
cp .env.local.example .env.local         # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                              # http://localhost:3000
```

Open http://localhost:3000, click **Load sample patient**, choose a profile, and hit **Find matching trials**.

### Running the tests

```bash
# Backend — fully offline, ~2s
cd backend && pytest

# Frontend
cd frontend && npm run test        # vitest
npm run lint                       # eslint
npx tsc --noEmit                   # typecheck
```

> 🔐 Secrets live only in `.env` / `.env.local`, which are git-ignored. Only the `*.example` templates (with placeholder values) are tracked — never commit a real key.

---

## Project Structure

```
trialmatch-ai/
├── backend/
│   └── trialmatch/
│       ├── agents/
│       │   ├── graph.py                 # LangGraph assembly (5-node linear pipeline)
│       │   ├── state.py                 # AgentState (TypedDict + reducers)
│       │   └── nodes/
│       │       ├── profile_extractor.py
│       │       ├── trial_discovery.py
│       │       ├── eligibility_parser.py
│       │       ├── match_evaluator.py   # rules + Claude path, concurrent, usage stats
│       │       └── report_generator.py
│       ├── main.py                      # FastAPI app factory + CORS
│       ├── api/routes/                  # health, match (SSE/JSON), trials
│       ├── models/                      # patient, trial, match, api (Pydantic contracts)
│       └── tools/clinicaltrials.py      # ClinicalTrials.gov v2 client (httpx + tenacity)
│   └── tests/                           # unit + integration (155, offline)
├── frontend/
│   └── src/
│       ├── app/                         # Next.js App Router (page.tsx, layout.tsx)
│       ├── components/                  # ProfileForm, PipelineStepper, ResultsOverview,
│       │                                #   TrialAccordion, CriteriaTable, ResultsCharts, …
│       ├── hooks/useMatchRun.ts         # SSE consumption → reducer
│       └── lib/                         # types, sse, matchReducer, trialViews,
│                                        #   profileSchema, exportReport, api
│   └── tests/                           # vitest (60)
├── docs/                                # PROJECT_PLAN.docx, images/
├── docker-compose.yml
└── README.md
```

---

## Limitations & Roadmap

**This is a research and educational decision-support tool — not a medical device.** It does not diagnose, treat, or determine eligibility; every verdict is provisional and requires clinician confirmation. Discovery and verdicts depend on the completeness of the patient profile and the trial text.

Honest current limitations and where they go next:

- **Search-term / LLM-context coupling.** The patient's diagnosis description feeds *both* the ClinicalTrials.gov condition search *and* the LLM's context. Long, highly-specific descriptions (e.g. "…stage IIB (T2N1M0)") return **zero** results from the registry's `query.cond`, so descriptions are kept searchable — which means fine-grained staging/biomarker detail can't currently ride in the discovery query. **Roadmap:** decouple the search term from the evaluation context so full staging can reach the LLM without breaking discovery.
- **Structured input only (today).** The API models a free-text clinical-note mode, but note→profile extraction is currently stubbed; the structured form is the supported path. **Roadmap:** LLM-based note extraction.
- **Grounding *check* guardrail.** Grounding is enforced *by construction* (the verbatim citation is a required field), but the standalone runtime guardrail that would reject any non-verbatim citation is planned, not yet built.
- **Deferred by design (scaffolded, not active):** LangSmith tracing, a curated evaluation harness with recall/precision metrics, PII-filtering and output-framing guardrails, human-in-the-loop clarification, and PubMed/ICD-10 enrichment. **Roadmap:** land these in priority order, starting with the eval harness.
- **Other roadmap ideas:** per-criterion streaming progress (the backend currently emits one event per node, not per criterion), authentication, and a larger built-in sample-patient library.

---

## Frontend Details

The web app has its own focused README covering the SSE consumption model, the pure/tested reducer + frame parser, the design-token system, and the component inventory: **[`frontend/README.md`](frontend/README.md)**.

---

## Author

**Alireza Minagar, MD, MBA, MS (Bioinformatics), MS (Software Engineering)**
AI/ML Software Engineer • AWS Certified Machine Learning Engineer • Neurologist & Neuroimmunologist

Alireza Minagar is a physician-engineer working at the intersection of clinical medicine, bioinformatics, and software engineering. A neurologist and neuroimmunologist by training, he builds production AI/ML systems for healthcare — pairing first-hand clinical domain knowledge with full-stack engineering. TrialMatch AI is a flagship portfolio artifact of that intersection: a clinically-grounded, engineering-rigorous take on a real trial-enrollment problem.

- **Physician + engineer** — an MD and clinician with 290+ peer-reviewed publications who also designs, builds, and ships production software.
- **AI/ML depth** — AWS Certified Machine Learning Engineer, with graduate training in both Bioinformatics and Software Engineering.
- **Clinical-AI focus** — decision-support tools grounded in real clinical workflows and source-of-truth data, not black-box scores.

🔗 **LinkedIn:** https://www.linkedin.com/in/alireza-minagar-ai
🔗 **GitHub:** https://github.com/aliminagar/TrialMatch_2026

---

## Screenshot Capture Guide

Drop screenshots into `docs/images/` using these **exact filenames** — they match the `<img>` references above. Capture at a consistent width (≈1440px desktop is ideal); a few close-ups (11–13, 15, 18) can be tighter crops. GitHub shows a broken-image icon for any not-yet-added file, which is expected.

1. **`01-hero-dark.png`** — Hero/header in **dark mode**: gradient "TrialMatch AI" wordmark, tagline, and the stack chip row.
2. **`02-hero-light.png`** — The **same hero in light mode** (toggle the theme, top-right).
3. **`03-empty-form.png`** — The patient-profile form empty, with the "Ready to match" empty state in the results column.
4. **`04-sample-dropdown.png`** — The **"Load sample patient" dropdown open**, showing all three profiles.
5. **`05-form-filled-basic.png`** — The form filled with the **minimal 58F breast** profile.
6. **`06-form-filled-rich.png`** — The form filled with the **full-workup** profile — make sure the **labs indicator line** ("Carrying N lab values …") is visible.
7. **`07-trials-selector.png`** — The **"Trials to evaluate"** 3 / 5 / 10 / All segmented control.
8. **`08-pipeline-running.png`** — The pipeline stepper **mid-run**, with a node pulsing/active.
9. **`09-pipeline-complete.png`** — The pipeline stepper with **all 5 nodes checked complete**.
10. **`10-overview-dark.png`** — The **full results overview**: headline, verdict-distribution bar, and the charts row.
11. **`11-verdict-donut.png`** — A **close-up of the verdict-mix donut** chart.
12. **`12-trials-by-score.png`** — A **close-up of the trials-by-score** bar chart.
13. **`13-criteria-by-category.png`** — A **close-up of the criteria-by-category** chart.
14. **`14-top-candidates.png`** — The **"Top candidates" callout row** (the three cards).
15. **`15-llm-stats.png`** — The **"Powered by Claude" stats bar** (calls / tokens / cost / latency).
16. **`16-trial-accordion.png`** — A **collapsed trial accordion** header row.
17. **`17-criteria-table.png`** — An **expanded criteria table** showing PASS / FAIL / INSUFFICIENT rows.
18. **`18-grounded-citation.png`** — A criterion **expanded to show the grounded verbatim quote**.
19. **`19-by-verdict-view.png`** — The **"By verdict" global cross-trial** view.
20. **`20-export-and-light.png`** — The **Download report / JSON** buttons (and/or the full results in **light mode**).

---

*Created by Alireza Minagar © 2026. All rights reserved.* · [GitHub](https://github.com/aliminagar/TrialMatch_2026)
