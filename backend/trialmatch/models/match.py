"""Match-result data contracts.

Implements CriterionVerdict, TrialVerdict, and MatchReport per
PROJECT_PLAN.docx Section 8.2. These are the agent's output types — what the
report_generator node produces and what the API streams back to the frontend.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from trialmatch.models.patient import PatientProfile
from trialmatch.models.trial import Criterion

Verdict = Literal["PASS", "FAIL", "INSUFFICIENT_INFO"]
AggregateVerdict = Literal["LIKELY_MATCH", "LIKELY_NO_MATCH", "NEEDS_REVIEW"]

DEFAULT_DISCLAIMER = (
    "TrialMatch AI is a research and educational decision-support tool. "
    "It is not a medical device and must not be used for clinical decisions. "
    "All match verdicts reflect available data only and require clinician review."
)


class CriterionVerdict(BaseModel):
    """Per-criterion evaluation result. Every claim must cite source_text."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    criterion: Criterion
    verdict: Verdict
    reasoning: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)
    source_citation: str = Field(
        default="",
        description="Verbatim span from the trial's eligibility text supporting this verdict. "
        "Enforced by the grounding check (Section 10.3).",
    )


class TrialVerdict(BaseModel):
    """Aggregated verdict for a single trial."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    nct_id: str
    title: str
    aggregate_verdict: AggregateVerdict
    score: float = Field(ge=0.0, le=1.0)
    criteria_verdicts: list[CriterionVerdict] = Field(default_factory=list)

    @property
    def insufficient_info_count(self) -> int:
        return sum(1 for v in self.criteria_verdicts if v.verdict == "INSUFFICIENT_INFO")

    @property
    def fail_count(self) -> int:
        return sum(1 for v in self.criteria_verdicts if v.verdict == "FAIL")


class MatchReport(BaseModel):
    """Final agent output: ranked list of TrialVerdict + run metadata.

    Streamed as the `final_result` SSE event (Section 4 API reference) and
    persisted as the canonical record of a match run.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    patient: PatientProfile
    trial_verdicts: list[TrialVerdict] = Field(default_factory=list)
    summary: str = Field(
        default="",
        description="Short human-readable summary, framed per Section 10.1 — "
        "never 'the patient qualifies', always 'criteria appear to be met'.",
    )
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    run_id: str | None = Field(
        default=None,
        description="LangSmith run_id for trace correlation (Section 16.1).",
    )
    disclaimer: str = DEFAULT_DISCLAIMER

    @field_validator("trial_verdicts")
    @classmethod
    def _enforce_ranking(cls, v: list[TrialVerdict]) -> list[TrialVerdict]:
        # The report is presented as ranked; sort descending by score so consumers
        # don't have to re-sort. Stable sort preserves agent-supplied tie order.
        return sorted(v, key=lambda tv: tv.score, reverse=True)
