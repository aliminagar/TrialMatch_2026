"""Unit tests for the profile_extractor node.

Section 4.4.1 + Section 15.1. Covers the structured happy path, validation
failure paths, and the note-mode Week 1 stub.
"""

from __future__ import annotations

from trialmatch.agents.nodes.profile_extractor import (
    _STUB_NOTE_PROFILE,
    profile_extractor,
)
from trialmatch.agents.state import init_state
from trialmatch.models import PatientProfile


def _valid_patient_dict() -> dict[str, object]:
    return {
        "age": 58,
        "sex": "female",
        "primary_diagnosis": {
            "icd10": "C50.911",
            "description": "Breast cancer",
        },
        "current_medications": ["metformin"],
        "ecog_performance_status": 1,
    }


async def test_structured_happy_path() -> None:
    state = init_state(raw_input=_valid_patient_dict(), input_mode="structured")
    out = await profile_extractor(state)

    assert "patient" in out
    patient = out["patient"]
    assert isinstance(patient, PatientProfile)
    assert patient.age == 58
    assert patient.primary_diagnosis.icd10 == "C50.911"
    assert "errors" not in out


async def test_structured_rejects_non_dict_input() -> None:
    state = init_state(raw_input="not a dict", input_mode="structured")
    out = await profile_extractor(state)

    assert out.get("patient") is None or "patient" not in out
    assert "errors" in out
    assert any("requires a dict" in e for e in out["errors"])


async def test_structured_rejects_invalid_payload() -> None:
    # Age out of range — Pydantic should reject and the node should surface it.
    bad = _valid_patient_dict()
    bad["age"] = 999
    state = init_state(raw_input=bad, input_mode="structured")
    out = await profile_extractor(state)

    assert "patient" not in out
    assert "errors" in out
    assert any("invalid PatientProfile" in e for e in out["errors"])


async def test_structured_rejects_missing_required_field() -> None:
    bad = _valid_patient_dict()
    del bad["primary_diagnosis"]
    state = init_state(raw_input=bad, input_mode="structured")
    out = await profile_extractor(state)

    assert "patient" not in out
    assert "errors" in out


async def test_note_mode_returns_stub_profile_with_warning() -> None:
    state = init_state(raw_input="58F with breast mass found on screening", input_mode="note")
    out = await profile_extractor(state)

    assert out["patient"] == _STUB_NOTE_PROFILE
    assert "errors" in out
    assert any("stubbed in v0.1" in e for e in out["errors"])


async def test_unknown_input_mode_records_error() -> None:
    # Bypass the AgentState helper to inject an invalid mode.
    state = {"raw_input": {}, "input_mode": "telepathy"}  # type: ignore[typeddict-item]
    out = await profile_extractor(state)  # type: ignore[arg-type]

    assert "errors" in out
    assert any("unknown input_mode" in e for e in out["errors"])
