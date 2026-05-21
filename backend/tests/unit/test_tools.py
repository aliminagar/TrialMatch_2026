"""Unit tests for the ClinicalTrials.gov v2 wrapper.

Uses httpx.MockTransport to stub the network. The `fast_retry` fixture from
conftest.py turns tenacity's backoff into a no-op so retry tests run in
milliseconds. Covers happy path, retries on 429 and 5xx, non-retryable 4xx,
and the eligibility-text splitter.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from trialmatch.tools.clinicaltrials import (
    ClinicalTrialsClient,
    ClinicalTrialsError,
    _split_eligibility,
)


def _study_payload(nct_id: str = "NCT12345678") -> dict[str, Any]:
    return {
        "protocolSection": {
            "identificationModule": {
                "nctId": nct_id,
                "briefTitle": "Test Trial",
                "officialTitle": "An Official Title",
            },
            "statusModule": {"overallStatus": "RECRUITING"},
            "designModule": {"phases": ["PHASE2"], "enrollmentInfo": {"count": 100}},
            "conditionsModule": {"conditions": ["Breast Cancer"]},
            "eligibilityModule": {
                "eligibilityCriteria": (
                    "Inclusion Criteria:\n- Age >= 18\n"
                    "Exclusion Criteria:\n- Prior chemotherapy"
                ),
                "minimumAge": "18 Years",
                "sex": "FEMALE",
            },
            "sponsorCollaboratorsModule": {"leadSponsor": {"name": "Acme Pharma"}},
            "contactsLocationsModule": {
                "locations": [
                    {
                        "facility": "Memorial Hospital",
                        "city": "Boston",
                        "state": "MA",
                        "country": "United States",
                        "status": "RECRUITING",
                    }
                ]
            },
        }
    }


def _client_with(handler: Any) -> ClinicalTrialsClient:
    transport = httpx.MockTransport(handler)
    return ClinicalTrialsClient(client=httpx.AsyncClient(transport=transport))


# ---- Happy path -------------------------------------------------------------

async def test_search_trials_happy_path() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/studies")
        assert request.url.params["query.cond"] == "Breast Cancer"
        return httpx.Response(200, json={"studies": [_study_payload()]})

    async with _client_with(handler) as client:
        trials = await client.search_trials(condition="Breast Cancer")

    assert len(trials) == 1
    t = trials[0]
    assert t.nct_id == "NCT12345678"
    assert t.brief_title == "Test Trial"
    assert t.phase == "PHASE2"
    assert t.overall_status == "RECRUITING"
    assert t.sponsor == "Acme Pharma"
    assert t.enrollment == 100
    assert "Age >= 18" in t.inclusion_text
    assert "Prior chemotherapy" in t.exclusion_text
    assert t.locations[0].city == "Boston"


async def test_get_trial_happy_path() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/studies/NCT12345678")
        return httpx.Response(200, json=_study_payload())

    async with _client_with(handler) as client:
        trial = await client.get_trial("nct12345678")
    assert trial.nct_id == "NCT12345678"


async def test_search_passes_location_and_status() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["query.locn"] = request.url.params.get("query.locn", "")
        seen["filter.overallStatus"] = request.url.params.get("filter.overallStatus", "")
        return httpx.Response(200, json={"studies": []})

    async with _client_with(handler) as client:
        await client.search_trials(
            condition="Breast Cancer", location="Boston, MA, US", status="RECRUITING"
        )

    assert seen["query.locn"] == "Boston, MA, US"
    assert seen["filter.overallStatus"] == "RECRUITING"


# ---- Retry behavior ---------------------------------------------------------

async def test_429_retries_then_succeeds(fast_retry: None) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(429, text="rate limited")
        return httpx.Response(200, json={"studies": [_study_payload()]})

    async with _client_with(handler) as client:
        trials = await client.search_trials(condition="x")

    assert calls["n"] == 3
    assert len(trials) == 1


async def test_5xx_retries_then_succeeds(fast_retry: None) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 2:
            return httpx.Response(503, text="upstream down")
        return httpx.Response(200, json={"studies": []})

    async with _client_with(handler) as client:
        trials = await client.search_trials(condition="x")

    assert calls["n"] == 2
    assert trials == []


async def test_retry_exhaustion_propagates(fast_retry: None) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="always broken")

    async with _client_with(handler) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await client.search_trials(condition="x")


# ---- Non-retryable 4xx ------------------------------------------------------

async def test_400_raises_clinicaltrials_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text="bad request")

    async with _client_with(handler) as client:
        with pytest.raises(ClinicalTrialsError):
            await client.search_trials(condition="x")


async def test_404_raises_clinicaltrials_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="not found")

    async with _client_with(handler) as client:
        with pytest.raises(ClinicalTrialsError):
            await client.get_trial("NCT99999999")


# ---- Eligibility splitter ---------------------------------------------------

class TestSplitEligibility:
    def test_inclusion_then_exclusion(self) -> None:
        inc, exc = _split_eligibility(
            "Inclusion Criteria:\n- a\n- b\nExclusion Criteria:\n- c\n- d"
        )
        assert "- a" in inc and "- b" in inc
        assert "- c" in exc and "- d" in exc

    def test_exclusion_then_inclusion(self) -> None:
        inc, exc = _split_eligibility(
            "Exclusion Criteria:\n- c\nInclusion Criteria:\n- a"
        )
        assert "- a" in inc
        assert "- c" in exc

    def test_inclusion_only(self) -> None:
        inc, exc = _split_eligibility("Inclusion criteria: age 18+")
        assert "age 18+" in inc
        assert exc == ""

    def test_exclusion_only(self) -> None:
        inc, exc = _split_eligibility("Exclusion Criteria:\n- pregnant")
        assert inc == ""
        assert "pregnant" in exc

    def test_no_headers_falls_through_to_inclusion(self) -> None:
        inc, exc = _split_eligibility("Free text with no header structure")
        assert inc == "Free text with no header structure"
        assert exc == ""

    def test_empty_text(self) -> None:
        assert _split_eligibility("") == ("", "")
