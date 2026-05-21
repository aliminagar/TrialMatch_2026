"""report_generator node — Week 1 stub.

Implements PROJECT_PLAN.docx Section 4.4.6 as a placeholder. Builds a
MatchReport directly from the patient profile and discovered trials,
emitting one NEEDS_REVIEW verdict per trial. The real LLM-driven version
arrives in Week 2 alongside match_evaluator and the report_generation.txt
prompt — at that point this stub will be replaced.
"""

from __future__ import annotations

from typing import Any

from trialmatch.agents.state import AgentState
from trialmatch.models import MatchReport, PatientProfile, TrialVerdict


async def report_generator(state: AgentState) -> dict[str, Any]:
    patient = state.get("patient")
    if not isinstance(patient, PatientProfile):
        return {"errors": ["report_generator: no PatientProfile in state."]}

    trials = state.get("candidate_trials") or []
    trial_verdicts = [
        TrialVerdict(
            nct_id=t.nct_id,
            title=t.brief_title,
            aggregate_verdict="NEEDS_REVIEW",
            score=0.0,
            criteria_verdicts=[],
        )
        for t in trials
    ]

    summary = (
        f"Discovered {len(trial_verdicts)} candidate trial(s). "
        "Per-criterion evaluation is stubbed in v0.1 — all trials are marked "
        "NEEDS_REVIEW pending the Week 2 match_evaluator implementation."
    )

    report = MatchReport(
        patient=patient,
        trial_verdicts=trial_verdicts,
        summary=summary,
    )
    return {"final_report": report}
