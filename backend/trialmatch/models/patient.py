"""Patient-side data contracts.

Implements PatientProfile and its supporting types (Diagnosis, LabValue,
GeoConstraint, ClinicalNote) per PROJECT_PLAN.docx Section 8.2. These models
are the canonical structured representation of a patient inside the agent
graph — every node consumes or produces them.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Sex = Literal["male", "female", "other"]

# WHO ICD-10: one letter, two digits, optional dot + up to 4 alphanumerics.
# Examples: I10, E11.9, C50.911, S72.001A.
_ICD10_PATTERN = re.compile(r"^[A-Z]\d{2}(\.[A-Z0-9]{1,4})?$")


class Diagnosis(BaseModel):
    """A single coded diagnosis. Used for primary diagnosis and comorbidities."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    icd10: str = Field(description="ICD-10 code, e.g. 'C50.911'.")
    description: str | None = Field(
        default=None,
        description="Human-readable diagnosis name. Optional — agents may fill this in.",
    )

    @field_validator("icd10")
    @classmethod
    def _validate_icd10(cls, v: str) -> str:
        normalized = v.upper().strip()
        if not _ICD10_PATTERN.match(normalized):
            raise ValueError(
                f"Invalid ICD-10 code: {v!r}. Expected format like 'C50.911' or 'I10'."
            )
        return normalized


class LabValue(BaseModel):
    """A single lab measurement keyed in PatientProfile.lab_values by analyte name."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    value: float
    unit: str
    reference_range: str | None = Field(
        default=None,
        description="Free-text reference range, e.g. '4.5-11.0' or '<200'.",
    )
    measured_on: date | None = None


class GeoConstraint(BaseModel):
    """Geographic filter applied during trial discovery."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    country: str = Field(description="ISO 3166-1 alpha-2 country code, e.g. 'US'.")
    state: str | None = Field(default=None, description="State/region code, e.g. 'LA'.")
    city: str | None = None
    max_distance_km: float | None = Field(default=None, ge=0)

    @field_validator("country")
    @classmethod
    def _normalize_country(cls, v: str) -> str:
        normalized = v.upper().strip()
        if len(normalized) != 2:
            raise ValueError(f"country must be a 2-letter code, got {v!r}.")
        return normalized

    @field_validator("state")
    @classmethod
    def _normalize_state(cls, v: str | None) -> str | None:
        return v.upper().strip() if v else v


class PatientProfile(BaseModel):
    """Canonical structured patient representation consumed by the agent graph.

    Spec: PROJECT_PLAN.docx Section 8.2. Note: no name/MRN fields by design —
    the PII filter relies on this absence (Section 10.2).
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    age: int = Field(ge=0, le=120)
    sex: Sex
    primary_diagnosis: Diagnosis
    comorbidities: list[Diagnosis] = Field(default_factory=list)
    current_medications: list[str] = Field(default_factory=list)
    ecog_performance_status: int | None = Field(default=None, ge=0, le=4)
    lab_values: dict[str, LabValue] = Field(default_factory=dict)
    prior_treatments: list[str] = Field(default_factory=list)
    geographic_constraint: GeoConstraint | None = None


class ClinicalNote(BaseModel):
    """Unstructured patient input — a free-text clinical note awaiting extraction."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    text: str = Field(min_length=1)
    note_type: Literal["progress", "consult", "discharge", "other"] = "other"
