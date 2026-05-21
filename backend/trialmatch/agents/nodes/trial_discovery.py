"""trial_discovery node — candidate trial search.

Implements PROJECT_PLAN.docx Section 4.4.2. Queries ClinicalTrials.gov v2 by
the patient's primary diagnosis, optionally filtered by geography and
recruitment status. ICD-10 → MeSH translation is deferred to Week 2; for now
we send the human-readable diagnosis description (or the ICD-10 code as a
fallback) directly as the condition query — ClinicalTrials.gov accepts free
text on ``query.cond``.

Exposed as a factory (``make_trial_discovery``) so that graph assembly and
unit tests can inject a ClinicalTrialsClient (or a MockTransport-backed
client) without monkeypatching.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from trialmatch.agents.state import AgentState
from trialmatch.models import GeoConstraint, PatientProfile
from trialmatch.tools.clinicaltrials import (
    ClinicalTrialsClient,
    ClinicalTrialsError,
)

DEFAULT_STATUS_FILTER = "RECRUITING"
DEFAULT_PAGE_SIZE = 25

NodeFn = Callable[[AgentState], Awaitable[dict[str, Any]]]


def make_trial_discovery(
    client: ClinicalTrialsClient | None = None,
    *,
    status_filter: str | None = DEFAULT_STATUS_FILTER,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> NodeFn:
    """Return a LangGraph node bound to a specific ClinicalTrialsClient.

    Passing ``client=None`` constructs and tears down a fresh client per call
    — fine for the CLI demo, not ideal for the FastAPI server. The /match
    handler in Week 5 will own a single long-lived client and inject it here.
    """

    async def trial_discovery(state: AgentState) -> dict[str, Any]:
        patient = state.get("patient")
        if not isinstance(patient, PatientProfile):
            return {"errors": ["trial_discovery: no PatientProfile in state."]}

        condition = _condition_query(patient)
        location = _location_query(patient.geographic_constraint)

        try:
            trials = await _search(
                client=client,
                condition=condition,
                location=location,
                status=status_filter,
                page_size=page_size,
            )
        except ClinicalTrialsError as exc:
            return {
                "candidate_trials": [],
                "errors": [f"trial_discovery: ClinicalTrials.gov error — {exc}"],
            }
        except Exception as exc:  # transport-level after tenacity exhaustion
            return {
                "candidate_trials": [],
                "errors": [f"trial_discovery: search failed — {exc}"],
            }

        return {"candidate_trials": trials}

    return trial_discovery


async def _search(
    *,
    client: ClinicalTrialsClient | None,
    condition: str,
    location: str | None,
    status: str | None,
    page_size: int,
) -> list[Any]:
    if client is not None:
        return await client.search_trials(
            condition=condition,
            location=location,
            status=status,  # type: ignore[arg-type]
            page_size=page_size,
        )
    async with ClinicalTrialsClient() as owned:
        return await owned.search_trials(
            condition=condition,
            location=location,
            status=status,  # type: ignore[arg-type]
            page_size=page_size,
        )


def _condition_query(patient: PatientProfile) -> str:
    diag = patient.primary_diagnosis
    return diag.description or diag.icd10


def _location_query(geo: GeoConstraint | None) -> str | None:
    if geo is None:
        return None
    parts = [p for p in (geo.city, geo.state, geo.country) if p]
    return ", ".join(parts) if parts else None
