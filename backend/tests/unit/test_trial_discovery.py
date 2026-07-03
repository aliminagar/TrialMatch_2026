"""Unit tests for the trial_discovery node.

Uses a spy ClinicalTrialsClient that records search arguments and returns
configured trials. Verifies query construction from PatientProfile and
error propagation from the tool layer.
"""

from __future__ import annotations

from typing import Any

from trialmatch.agents.nodes.trial_discovery import make_trial_discovery
from trialmatch.agents.state import init_state
from trialmatch.models import Diagnosis, GeoConstraint, PatientProfile, Trial
from trialmatch.tools.clinicaltrials import ClinicalTrialsError


class _SpyClient:
    """Stand-in for ClinicalTrialsClient that records calls.

    Duck-typed — only needs search_trials. Trial discovery never inspects
    the type at runtime so this is safe.
    """

    def __init__(
        self, *, trials: list[Trial] | None = None, raises: Exception | None = None
    ) -> None:
        self._trials = trials or []
        self._raises = raises
        self.calls: list[dict[str, Any]] = []

    async def search_trials(
        self,
        *,
        condition: str,
        location: str | None = None,
        status: str | None = None,
        page_size: int = 25,
    ) -> list[Trial]:
        self.calls.append(
            {
                "condition": condition,
                "location": location,
                "status": status,
                "page_size": page_size,
            }
        )
        if self._raises is not None:
            raise self._raises
        return self._trials


def _patient(
    *, with_geo: bool = False, description: str | None = "Breast cancer"
) -> PatientProfile:
    return PatientProfile(
        age=58,
        sex="female",
        primary_diagnosis=Diagnosis(icd10="C50.911", description=description),
        geographic_constraint=GeoConstraint(country="US", state="LA", city="Shreveport")
        if with_geo
        else None,
    )


def _trial(nct: str = "NCT00000001") -> Trial:
    return Trial(nct_id=nct, brief_title="Stub trial")


async def test_discovery_uses_description_as_condition() -> None:
    spy = _SpyClient(trials=[_trial()])
    node = make_trial_discovery(spy)  # type: ignore[arg-type]
    state = init_state(raw_input={}, input_mode="structured")
    state["patient"] = _patient()

    out = await node(state)

    assert spy.calls[0]["condition"] == "Breast cancer"
    assert spy.calls[0]["status"] == "RECRUITING"
    assert spy.calls[0]["location"] is None
    assert len(out["candidate_trials"]) == 1


async def test_discovery_falls_back_to_icd10_when_no_description() -> None:
    spy = _SpyClient(trials=[])
    node = make_trial_discovery(spy)  # type: ignore[arg-type]
    state = init_state(raw_input={}, input_mode="structured")
    state["patient"] = _patient(description=None)

    await node(state)

    assert spy.calls[0]["condition"] == "C50.911"


async def test_discovery_builds_location_from_geo_constraint() -> None:
    spy = _SpyClient(trials=[])
    node = make_trial_discovery(spy)  # type: ignore[arg-type]
    state = init_state(raw_input={}, input_mode="structured")
    state["patient"] = _patient(with_geo=True)

    await node(state)

    assert spy.calls[0]["location"] == "Shreveport, LA, US"


async def test_discovery_respects_custom_status_and_page_size() -> None:
    spy = _SpyClient(trials=[])
    node = make_trial_discovery(spy, status_filter="COMPLETED", page_size=5)  # type: ignore[arg-type]
    state = init_state(raw_input={}, input_mode="structured")
    state["patient"] = _patient()

    await node(state)

    assert spy.calls[0]["status"] == "COMPLETED"
    assert spy.calls[0]["page_size"] == 5


async def test_discovery_returns_error_on_clinicaltrials_error() -> None:
    spy = _SpyClient(raises=ClinicalTrialsError("API said no"))
    node = make_trial_discovery(spy)  # type: ignore[arg-type]
    state = init_state(raw_input={}, input_mode="structured")
    state["patient"] = _patient()

    out = await node(state)

    assert out["candidate_trials"] == []
    assert any("API said no" in e for e in out["errors"])


async def test_discovery_returns_error_on_transport_failure() -> None:
    import httpx

    spy = _SpyClient(raises=httpx.ConnectError("dns failure"))
    node = make_trial_discovery(spy)  # type: ignore[arg-type]
    state = init_state(raw_input={}, input_mode="structured")
    state["patient"] = _patient()

    out = await node(state)

    assert out["candidate_trials"] == []
    assert any("search failed" in e for e in out["errors"])


async def test_discovery_short_circuits_when_no_patient() -> None:
    spy = _SpyClient()
    node = make_trial_discovery(spy)  # type: ignore[arg-type]
    state = init_state(raw_input={}, input_mode="structured")
    # leave state["patient"] as None

    out = await node(state)

    assert spy.calls == []  # tool was never called
    assert any("no PatientProfile" in e for e in out["errors"])
