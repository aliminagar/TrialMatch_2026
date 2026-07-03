"""report_generator node — assemble the final MatchReport.

Implements PROJECT_PLAN.docx Section 4.4.6. Collects the per-trial
``TrialVerdict`` objects produced by match_evaluator (held in
``AgentState.verdicts``), orders them into a ranked ``MatchReport`` (the model's
validator sorts by score), and writes a short, framing-compliant summary.

Framing (Section 10.1): the summary describes findings as "criteria appear to
be met" and never asserts that a patient "qualifies" or "is eligible" — every
verdict is decision-support pending clinician review.
"""

from __future__ import annotations

from typing import Any

from trialmatch.agents.state import AgentState
from trialmatch.models import MatchReport, PatientProfile, TrialVerdict


def _summarize(verdicts: list[TrialVerdict]) -> str:
    if not verdicts:
        return (
            "No candidate trials were discovered for this patient. Adjust the search "
            "criteria and retry."
        )
    n = len(verdicts)
    likely = sum(1 for v in verdicts if v.aggregate_verdict == "LIKELY_MATCH")
    review = sum(1 for v in verdicts if v.aggregate_verdict == "NEEDS_REVIEW")
    no_match = sum(1 for v in verdicts if v.aggregate_verdict == "LIKELY_NO_MATCH")

    clauses: list[str] = []
    if likely:
        clauses.append(f"{likely} where the key criteria appear to be met")
    if review:
        clauses.append(f"{review} needing clinician review (missing or unconfirmable data)")
    if no_match:
        clauses.append(f"{no_match} where a criterion appears unmet")
    body = "; ".join(clauses) if clauses else "no trials could be scored"
    return (
        f"Evaluated {n} candidate trial(s): {body}. Verdicts reflect available profile "
        "data only and require clinician confirmation."
    )


async def report_generator(state: AgentState) -> dict[str, Any]:
    patient = state.get("patient")
    if not isinstance(patient, PatientProfile):
        return {"errors": ["report_generator: no PatientProfile in state."]}

    trials = state.get("candidate_trials") or []
    verdicts = state.get("verdicts") or {}

    trial_verdicts: list[TrialVerdict] = []
    for trial in trials:
        verdict = verdicts.get(trial.nct_id)
        if verdict is None:
            # match_evaluator produced nothing for this trial — surface it as
            # unreviewed rather than dropping it from the report.
            verdict = TrialVerdict(
                nct_id=trial.nct_id,
                title=trial.brief_title,
                aggregate_verdict="NEEDS_REVIEW",
                score=0.0,
                criteria_verdicts=[],
            )
        trial_verdicts.append(verdict)

    report = MatchReport(
        patient=patient,
        trial_verdicts=trial_verdicts,
        summary=_summarize(trial_verdicts),
        llm_stats=state.get("llm_stats"),
    )
    return {"final_report": report}
