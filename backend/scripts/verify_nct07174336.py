"""Live verification harness for the Claude match evaluator on NCT07174336.

Fetches the real trial from ClinicalTrials.gov via the production
``ClinicalTrialsClient``, parses it with the real ``eligibility_parser`` node,
then runs the real ``match_evaluator`` node twice over the *same* patient and
criteria — once on the deterministic rules (TRIALMATCH_USE_LLM off) and once on
the Claude evaluator (TRIALMATCH_USE_LLM on) — and prints:

  1. Explicit proof Claude was called: the per-trial call log (model, tokens),
     a per-criterion listing of which model judged each criterion, and run
     totals (API calls, input/output tokens, approximate cost).
  2. The rules TrialVerdict (before) vs the LLM TrialVerdict (after).
  3. A side-by-side per-criterion diff table for every changed verdict.
  4. End-to-end latency for the LLM run.

This is a verification/diagnostic harness — it drives the real node code paths
and does not modify them. Run from the backend/ directory:

    ./.venv/Scripts/python.exe scripts/verify_nct07174336.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from trialmatch.agents.nodes.eligibility_parser import eligibility_parser
from trialmatch.agents.nodes.match_evaluator import match_evaluator
from trialmatch.models import Diagnosis, PatientProfile
from trialmatch.models.match import TrialVerdict
from trialmatch.models.trial import Trial
from trialmatch.tools.clinicaltrials import ClinicalTrialsClient

NCT_ID = "NCT07174336"
_EVAL_LOGGER = "trialmatch.agents.nodes.match_evaluator"


# --- patient under test (per request: 58F breast cancer, ECOG 1, LA/US) ------
def build_patient() -> PatientProfile:
    return PatientProfile(
        age=58,
        sex="female",
        primary_diagnosis=Diagnosis(icd10="C50.911", description="Malignant neoplasm of breast"),
        ecog_performance_status=1,
        current_medications=["metformin", "lisinopril"],
        geographic_constraint=None,
    )


class _RecordCollector(logging.Handler):
    """Captures the evaluator's structured log records for the report."""

    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def _fmt_verdict(v: str) -> str:
    return {"PASS": "PASS", "FAIL": "FAIL", "INSUFFICIENT_INFO": "INSUFF"}.get(v, v)


def _short(text: str, width: int = 62) -> str:
    text = " ".join(text.split())
    return text if len(text) <= width else text[: width - 1] + "…"


async def _fetch_trial() -> Trial:
    async with ClinicalTrialsClient() as client:
        return await client.get_trial(NCT_ID)


async def _run_node(patient: PatientProfile, trial: Trial, parsed: dict[str, Any],
                    *, use_llm: bool) -> tuple[TrialVerdict, float]:
    """Run the real match_evaluator node with the LLM flag toggled."""
    if use_llm:
        os.environ["TRIALMATCH_USE_LLM"] = "1"
    else:
        os.environ.pop("TRIALMATCH_USE_LLM", None)
    started = time.perf_counter()
    state = await match_evaluator(
        {"patient": patient, "candidate_trials": [trial], "parsed_criteria": parsed}
    )
    elapsed = time.perf_counter() - started
    return state["verdicts"][trial.nct_id], elapsed


def _print_header(trial: Trial) -> None:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    key_state = "present" if key and "replace" not in key else "MISSING/placeholder"
    print("=" * 78)
    print(" NCT07174336 live match verification")
    print("=" * 78)
    print(f" trial title : {_short(trial.brief_title, 60)}")
    print(f" status      : {trial.overall_status}   phase: {trial.phase}")
    print(" router flag : TRIALMATCH_USE_LLM (the config switch)")
    print(f" model       : {os.environ.get('MODEL_NAME', 'claude-sonnet-5 (default)')}")
    print(f" api key     : {key_state}")
    print()


def _print_proof(records: list[logging.LogRecord], llm_verdict: TrialVerdict,
                 rules_verdict: TrialVerdict) -> bool:
    call_records = [r for r in records if getattr(r, "llm_model", None)]
    warnings = [r for r in records if r.levelno >= logging.WARNING]

    print("-" * 78)
    print(" 1. PROOF CLAUDE WAS CALLED")
    print("-" * 78)
    if not call_records:
        print(" NO LLM call recorded — the evaluator fell back to deterministic rules.")
        for w in warnings:
            print(f"   WARNING: {w.getMessage()}")
        return False

    total_in = total_out = total_calls = 0
    total_cost = 0.0
    model = ""
    for r in call_records:
        model = r.llm_model
        total_calls += r.api_calls
        total_in += r.input_tokens
        total_out += r.output_tokens
        total_cost += r.cost_usd
        print(f"   [call log] {r.getMessage()}")

    print()
    print("   Per-criterion attribution (all judged in the single batched call above):")
    for i, cv in enumerate(llm_verdict.criteria_verdicts):
        print(f"     [{i:>2}] model={model}  verdict={_fmt_verdict(cv.verdict):<6}"
              f"  {_short(cv.criterion.source_text, 46)}")

    print()
    print(f"   TOTALS  api_calls={total_calls}  input_tokens={total_in}"
          f"  output_tokens={total_out}  approx_cost=${total_cost:.6f}")
    for w in warnings:
        print(f"   WARNING: {w.getMessage()}")
    print()
    return True


def _print_verdicts(rules_verdict: TrialVerdict, llm_verdict: TrialVerdict) -> None:
    print("-" * 78)
    print(" 2. TRIALVERDICT — before (rules) vs after (LLM)")
    print("-" * 78)
    rf, lf = rules_verdict, llm_verdict
    print(f"   rules : {rf.aggregate_verdict:<16} score={rf.score:.2f}"
          f"  (FAIL={rf.fail_count}, INSUFF={rf.insufficient_info_count})")
    print(f"   LLM   : {lf.aggregate_verdict:<16} score={lf.score:.2f}"
          f"  (FAIL={lf.fail_count}, INSUFF={lf.insufficient_info_count})")
    print()


def _print_diff(rules_verdict: TrialVerdict, llm_verdict: TrialVerdict) -> None:
    print("-" * 78)
    print(" 3. PER-CRITERION DIFF (rows where the verdict changed)")
    print("-" * 78)
    rules_cvs = rules_verdict.criteria_verdicts
    llm_cvs = llm_verdict.criteria_verdicts
    changed = [
        (i, r, m)
        for i, (r, m) in enumerate(zip(rules_cvs, llm_cvs, strict=False))
        if r.verdict != m.verdict
    ]
    if not changed:
        print("   (no per-criterion verdicts changed)")
        print()
        return

    print(f"   {'#':>2}  {'rules':<7} {'LLM':<7}  criterion")
    print(f"   {'-'*2}  {'-'*7} {'-'*7}  {'-'*50}")
    false_fails_fixed = 0
    for i, r, m in changed:
        flag = ""
        if r.verdict == "FAIL" and m.verdict != "FAIL":
            flag = "  <-- false FAIL cleared"
            false_fails_fixed += 1
        print(f"   {i:>2}  {_fmt_verdict(r.verdict):<7} {_fmt_verdict(m.verdict):<7}"
              f"  {_short(m.criterion.source_text, 48)}{flag}")
    print()
    print(f"   false FAILs cleared by the LLM path: {false_fails_fixed}")
    print()


async def main() -> None:
    # Load repo-root .env (ANTHROPIC_API_KEY, MODEL_NAME, ...). Backend runs from
    # backend/; the .env lives one level up at the repo root.
    repo_root = Path(__file__).resolve().parents[2]
    load_dotenv(repo_root / ".env")

    logging.basicConfig(level=logging.WARNING)
    collector = _RecordCollector()
    eval_logger = logging.getLogger(_EVAL_LOGGER)
    eval_logger.setLevel(logging.INFO)
    eval_logger.addHandler(collector)

    patient = build_patient()
    print("Fetching NCT07174336 from ClinicalTrials.gov ...")
    trial = await _fetch_trial()
    parsed_state = await eligibility_parser({"candidate_trials": [trial]})
    parsed = parsed_state["parsed_criteria"]
    n_crit = len(parsed.get(trial.nct_id, []))
    print(f"Fetched + parsed {n_crit} criteria.\n")

    _print_header(trial)

    # Rules run (no LLM records emitted).
    rules_verdict, _ = await _run_node(patient, trial, parsed, use_llm=False)

    # LLM run — clear collector so proof reflects only this run, time end-to-end.
    collector.records.clear()
    e2e_start = time.perf_counter()
    llm_verdict, node_latency = await _run_node(patient, trial, parsed, use_llm=True)
    e2e_latency = time.perf_counter() - e2e_start

    called = _print_proof(collector.records, llm_verdict, rules_verdict)
    _print_verdicts(rules_verdict, llm_verdict)
    _print_diff(rules_verdict, llm_verdict)

    print("-" * 78)
    print(" 4. END-TO-END LATENCY (LLM run)")
    print("-" * 78)
    print(f"   match_evaluator node call: {node_latency:.2f}s")
    print(f"   end-to-end (node invoke) : {e2e_latency:.2f}s")
    if not called:
        print("\n   NOTE: LLM path did not execute — see WARNING(s) above.")
    print()


if __name__ == "__main__":
    asyncio.run(main())
