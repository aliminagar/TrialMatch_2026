"""Trial-side data contracts.

Implements Trial, Criterion, and supporting types per PROJECT_PLAN.docx
Section 8.2. A Trial holds the raw protocol record fetched from
ClinicalTrials.gov v2 — including unparsed eligibility text. Criterion is the
structured form produced by the eligibility_parser node.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CriterionType = Literal["inclusion", "exclusion"]
CriterionCategory = Literal[
    "demographic",
    "diagnosis",
    "lab",
    "medication",
    "prior_treatment",
    "performance",
    "other",
]
CriterionOperator = Literal[
    "eq", "ne", "gt", "lt", "gte", "lte", "in", "not_in", "has", "lacks"
]

TrialPhase = Literal[
    "EARLY_PHASE1", "PHASE1", "PHASE1_PHASE2", "PHASE2", "PHASE2_PHASE3", "PHASE3", "PHASE4", "NA"
]
RecruitmentStatus = Literal[
    "RECRUITING",
    "NOT_YET_RECRUITING",
    "ACTIVE_NOT_RECRUITING",
    "ENROLLING_BY_INVITATION",
    "COMPLETED",
    "SUSPENDED",
    "TERMINATED",
    "WITHDRAWN",
    "UNKNOWN",
]

# ClinicalTrials.gov NCT ID: "NCT" + 8 digits.
_NCT_PATTERN = re.compile(r"^NCT\d{8}$")


class Criterion(BaseModel):
    """A single inclusion or exclusion rule, parsed from a trial's eligibility text."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    criterion_type: CriterionType
    category: CriterionCategory
    operator: CriterionOperator
    threshold: str | float | None = Field(
        default=None,
        description="Value/threshold being compared against (e.g. 18, 'metformin', 200.0).",
    )
    source_text: str = Field(
        min_length=1,
        description="Verbatim criterion text from the protocol. Required for citation grounding.",
    )
    field: str | None = Field(
        default=None,
        description="Patient field this criterion targets (e.g. 'age', 'ecog_performance_status').",
    )


class TrialLocation(BaseModel):
    """A site participating in a trial. Used by trial_discovery for geographic filtering."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    facility: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    status: RecruitmentStatus | None = None


class Trial(BaseModel):
    """A clinical trial record fetched from ClinicalTrials.gov v2.

    Eligibility criteria are stored as raw text here; structured Criterion
    objects are produced separately by the eligibility_parser node and held in
    AgentState.parsed_criteria, keyed by nct_id.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    nct_id: str
    brief_title: str
    official_title: str | None = None
    phase: TrialPhase | None = None
    overall_status: RecruitmentStatus | None = None
    conditions: list[str] = Field(default_factory=list)
    sponsor: str | None = None
    enrollment: int | None = Field(default=None, ge=0)
    eligibility_text: str = Field(
        default="",
        description="Full raw eligibility section, used as the source for criterion citations.",
    )
    inclusion_text: str = ""
    exclusion_text: str = ""
    locations: list[TrialLocation] = Field(default_factory=list)
    minimum_age: str | None = Field(default=None, description="As reported, e.g. '18 Years'.")
    maximum_age: str | None = None
    eligible_sex: Literal["ALL", "MALE", "FEMALE"] | None = None

    @field_validator("nct_id")
    @classmethod
    def _validate_nct(cls, v: str) -> str:
        normalized = v.upper().strip()
        if not _NCT_PATTERN.match(normalized):
            raise ValueError(f"Invalid NCT ID: {v!r}. Expected format 'NCT' + 8 digits.")
        return normalized

    @property
    def url(self) -> str:
        return f"https://clinicaltrials.gov/study/{self.nct_id}"
