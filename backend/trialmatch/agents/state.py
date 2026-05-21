"""LangGraph agent state schema.

Implements AgentState per PROJECT_PLAN.docx Section 8.1. This is the typed
dictionary that flows through every node in the LangGraph workflow. Fields
annotated with `Annotated[..., reducer]` use the LangGraph reducer pattern:
when multiple nodes write to the same key, the reducer combines the values
instead of the default "last write wins" behavior.
"""

from __future__ import annotations

from operator import add
from typing import Annotated, Any, Literal, TypedDict

from trialmatch.models import (
    ClarificationQuestion,
    Criterion,
    MatchReport,
    PatientProfile,
    Trial,
    TrialVerdict,
)

InputMode = Literal["structured", "note"]


class AgentState(TypedDict, total=False):
    """State carried across every node in the LangGraph workflow.

    `total=False` so partial updates from individual nodes type-check —
    each node returns only the keys it modifies, and LangGraph merges them
    into the running state.
    """

    # ---- Input ----------------------------------------------------------
    raw_input: str | dict[str, Any]
    input_mode: InputMode

    # ---- Resolved entities (populated as the graph runs) ----------------
    patient: PatientProfile | None
    candidate_trials: list[Trial]
    parsed_criteria: dict[str, list[Criterion]]   # nct_id -> criteria
    verdicts: dict[str, TrialVerdict]             # nct_id -> verdict

    # ---- Control flow ---------------------------------------------------
    clarification_needed: bool
    clarification_questions: list[ClarificationQuestion]
    user_clarifications: dict[str, str]           # criterion_id -> user answer
    retry_count: int

    # ---- Output ---------------------------------------------------------
    final_report: MatchReport | None

    # Errors fan in from any node — reducer concatenates instead of overwriting.
    errors: Annotated[list[str], add]


def init_state(raw_input: str | dict[str, Any], input_mode: InputMode) -> AgentState:
    """Build a fresh AgentState with empty collections for a new run."""
    return AgentState(
        raw_input=raw_input,
        input_mode=input_mode,
        patient=None,
        candidate_trials=[],
        parsed_criteria={},
        verdicts={},
        clarification_needed=False,
        clarification_questions=[],
        user_clarifications={},
        retry_count=0,
        final_report=None,
        errors=[],
    )
