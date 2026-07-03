"""Pydantic data contracts for TrialMatch AI.

Public surface for the models package. Importers should pull from
`trialmatch.models` (not the submodules) so that internal reorganization
stays transparent.
"""

from trialmatch.models.api import (
    ClarificationQuestion,
    ClarificationRequiredEvent,
    ClarificationResponse,
    DependencyCheck,
    ErrorEvent,
    ErrorResponse,
    FinalResultEvent,
    HealthStatus,
    InputMode,
    MatchOptions,
    MatchRequest,
    ReadinessStatus,
    StateUpdateEvent,
    StreamEvent,
)
from trialmatch.models.match import (
    DEFAULT_DISCLAIMER,
    AggregateVerdict,
    CriterionVerdict,
    LlmStats,
    MatchReport,
    TrialVerdict,
    Verdict,
)
from trialmatch.models.patient import (
    ClinicalNote,
    Diagnosis,
    GeoConstraint,
    LabValue,
    PatientProfile,
    Sex,
)
from trialmatch.models.trial import (
    Criterion,
    CriterionCategory,
    CriterionOperator,
    CriterionType,
    RecruitmentStatus,
    Trial,
    TrialLocation,
    TrialPhase,
)

__all__ = [
    # patient
    "PatientProfile",
    "ClinicalNote",
    "Diagnosis",
    "LabValue",
    "GeoConstraint",
    "Sex",
    # trial
    "Trial",
    "TrialLocation",
    "Criterion",
    "CriterionType",
    "CriterionCategory",
    "CriterionOperator",
    "TrialPhase",
    "RecruitmentStatus",
    # match
    "MatchReport",
    "TrialVerdict",
    "CriterionVerdict",
    "LlmStats",
    "Verdict",
    "AggregateVerdict",
    "DEFAULT_DISCLAIMER",
    # api — request/response
    "MatchRequest",
    "MatchOptions",
    "InputMode",
    "ClarificationQuestion",
    "ClarificationResponse",
    "HealthStatus",
    "ReadinessStatus",
    "DependencyCheck",
    "ErrorResponse",
    # api — SSE stream events
    "StreamEvent",
    "StateUpdateEvent",
    "ClarificationRequiredEvent",
    "FinalResultEvent",
    "ErrorEvent",
]
