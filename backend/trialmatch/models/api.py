"""API request/response data contracts.

Implements the wire types for the FastAPI service layer per PROJECT_PLAN.docx
Section 4 (API reference) and Section 8.2. Covers:

- POST /api/v1/match — MatchRequest in, SSE stream of StreamEvent out
- GET  /api/v1/trials/{nct_id} — Trial out (re-exported via models.trial)
- GET  /healthz, /readyz — HealthStatus, ReadinessStatus

The SSE event types use a discriminated union on `event` so the frontend can
type-narrow against `StreamEvent` without manual checks.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from trialmatch.models.match import MatchReport
from trialmatch.models.patient import ClinicalNote, PatientProfile

InputMode = Literal["structured", "note"]


class MatchOptions(BaseModel):
    """Per-request tuning for the /match endpoint."""

    model_config = ConfigDict(extra="forbid")

    max_results: int = Field(default=10, ge=1, le=50)
    enable_clarification: bool = Field(
        default=True,
        description="If False, skips clarification_router interrupts and returns "
        "best-effort verdicts even when fields are missing.",
    )


class MatchRequest(BaseModel):
    """Input payload for POST /api/v1/match.

    Exactly one of `patient` (structured) or `clinical_note` (note) must be set,
    matching `input_mode`. Enforced by the model validator.
    """

    model_config = ConfigDict(extra="forbid")

    input_mode: InputMode
    patient: PatientProfile | None = None
    clinical_note: ClinicalNote | None = None
    options: MatchOptions = Field(default_factory=MatchOptions)

    @model_validator(mode="after")
    def _validate_input_payload(self) -> MatchRequest:
        if self.input_mode == "structured":
            if self.patient is None:
                raise ValueError("input_mode='structured' requires a 'patient' payload.")
            if self.clinical_note is not None:
                raise ValueError("input_mode='structured' must not include 'clinical_note'.")
        else:  # "note"
            if self.clinical_note is None:
                raise ValueError("input_mode='note' requires a 'clinical_note' payload.")
            if self.patient is not None:
                raise ValueError("input_mode='note' must not include 'patient'.")
        return self


class ClarificationQuestion(BaseModel):
    """A single question surfaced to the user by clarification_router."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    criterion_id: str = Field(description="Stable id for the unresolved criterion.")
    source_text: str = Field(description="Verbatim criterion text from the protocol.")
    question: str = Field(description="Natural-language question shown to the user.")


class ClarificationResponse(BaseModel):
    """Sent by the client to resume a paused LangGraph run after HITL interrupt."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    run_id: str
    answers: dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of criterion_id -> user-provided answer.",
    )


# ---- SSE stream envelope -----------------------------------------------------
# Each variant carries an `event` literal for client-side discrimination.
# The wire format is standard SSE: `event: <name>\ndata: <json>\n\n`.

class StateUpdateEvent(BaseModel):
    """Incremental agent progress — emitted by every node entry/exit."""

    model_config = ConfigDict(extra="forbid")

    event: Literal["state_update"] = "state_update"
    node: str = Field(description="LangGraph node name, e.g. 'trial_discovery'.")
    status: Literal["started", "completed", "failed"]
    message: str | None = None


class ClarificationRequiredEvent(BaseModel):
    """Agent has paused on a HITL interrupt and needs user input to resume."""

    model_config = ConfigDict(extra="forbid")

    event: Literal["clarification_required"] = "clarification_required"
    run_id: str
    questions: list[ClarificationQuestion]


class FinalResultEvent(BaseModel):
    """Terminal event carrying the full MatchReport."""

    model_config = ConfigDict(extra="forbid")

    event: Literal["final_result"] = "final_result"
    report: MatchReport


class ErrorEvent(BaseModel):
    """Terminal error event — emitted when a node fails irrecoverably."""

    model_config = ConfigDict(extra="forbid")

    event: Literal["error"] = "error"
    code: str
    message: str


StreamEvent = Annotated[
    StateUpdateEvent | ClarificationRequiredEvent | FinalResultEvent | ErrorEvent,
    Field(discriminator="event"),
]


# ---- Health endpoints --------------------------------------------------------

class HealthStatus(BaseModel):
    """GET /healthz — liveness probe."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
    version: str


class DependencyCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    ok: bool
    detail: str | None = None


class ReadinessStatus(BaseModel):
    """GET /readyz — verifies LLM and external API connectivity."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["ready", "degraded", "not_ready"]
    checks: list[DependencyCheck] = Field(default_factory=list)


# ---- Error envelope ----------------------------------------------------------

class ErrorResponse(BaseModel):
    """Standard non-streaming error response."""

    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    detail: str | None = None
