"""profile_extractor node — input parsing and patient validation.

Implements PROJECT_PLAN.docx Section 4.4.1. Two input paths:

- ``input_mode='structured'``: validates the raw dict against PatientProfile
  (real implementation; no LLM needed).
- ``input_mode='note'``: STUB in v0.1 — returns a placeholder profile and
  records that LLM-based note extraction is not yet wired. Week 2 replaces
  this with a real Claude Opus call against ``profile_extraction.txt``.

Nodes follow the LangGraph convention of returning a partial-state dict that
LangGraph merges into the running AgentState.
"""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from trialmatch.agents.state import AgentState
from trialmatch.models import Diagnosis, PatientProfile

# Demo profile used while note-mode extraction is stubbed. Roughly the README
# example patient (breast-cancer screening case) so the demo CLI produces
# realistic-looking trial matches.
_STUB_NOTE_PROFILE = PatientProfile(
    age=58,
    sex="female",
    primary_diagnosis=Diagnosis(
        icd10="C50.911",
        description="Malignant neoplasm of breast (right, unspecified site)",
    ),
)


async def profile_extractor(state: AgentState) -> dict[str, Any]:
    raw = state.get("raw_input")
    input_mode = state.get("input_mode")

    if input_mode == "structured":
        if not isinstance(raw, dict):
            return {
                "errors": [
                    "profile_extractor: structured input requires a dict payload, "
                    f"got {type(raw).__name__}."
                ]
            }
        try:
            patient = PatientProfile.model_validate(raw)
        except ValidationError as exc:
            return {"errors": [f"profile_extractor: invalid PatientProfile — {exc}"]}
        return {"patient": patient}

    if input_mode == "note":
        # Week 1 stub. The real implementation (Week 2) will call Claude Opus
        # with the profile_extraction.txt prompt and validate the structured
        # output against PatientProfile.
        return {
            "patient": _STUB_NOTE_PROFILE,
            "errors": [
                "profile_extractor: note-mode LLM extraction is stubbed in v0.1; "
                "using demo PatientProfile."
            ],
        }

    return {"errors": [f"profile_extractor: unknown input_mode {input_mode!r}."]}
