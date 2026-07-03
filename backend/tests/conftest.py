"""Shared pytest fixtures.

`fast_retry` patches asyncio.sleep so tenacity's exponential-backoff waits
become no-ops. Required for the retry tests in test_tools.py to run in
milliseconds instead of seconds.

The fixture-data helpers (`sample_patients`, `sample_studies`,
`make_mock_ct_client`) load the JSON under tests/fixtures/ and build a
ClinicalTrialsClient backed by an httpx MockTransport, so integration tests can
exercise the full graph without any network access.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest

from trialmatch.tools.clinicaltrials import ClinicalTrialsClient

_FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fast_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    """Skip the actual wait inside tenacity's async retry loop."""

    async def _no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(asyncio, "sleep", _no_sleep)


@pytest.fixture
def sample_patients() -> list[dict[str, Any]]:
    """Realistic PatientProfile-shaped dicts from tests/fixtures."""
    data = json.loads((_FIXTURES / "sample_patients.json").read_text(encoding="utf-8"))
    return data["patients"]


@pytest.fixture
def sample_studies() -> list[dict[str, Any]]:
    """Raw ClinicalTrials.gov v2 study payloads from tests/fixtures."""
    data = json.loads((_FIXTURES / "sample_trials.json").read_text(encoding="utf-8"))
    return data["studies"]


@pytest.fixture
def make_mock_ct_client() -> Callable[[list[dict[str, Any]]], ClinicalTrialsClient]:
    """Factory: build a ClinicalTrialsClient that serves the given v2 studies.

    The MockTransport answers ``/studies`` with the full list and
    ``/studies/{nct}`` with the matching study (404 otherwise), so the real
    client parser and retry logic run against in-memory data.
    """

    def _factory(studies: list[dict[str, Any]]) -> ClinicalTrialsClient:
        by_nct = {
            s["protocolSection"]["identificationModule"]["nctId"]: s for s in studies
        }

        def handler(request: httpx.Request) -> httpx.Response:
            path = request.url.path
            if path.endswith("/studies"):
                return httpx.Response(200, json={"studies": studies})
            if "/studies/" in path:
                study = by_nct.get(path.rsplit("/", 1)[-1])
                if study is None:
                    return httpx.Response(404, text="not found")
                return httpx.Response(200, json=study)
            return httpx.Response(404, text=f"unknown path: {path}")

        transport = httpx.MockTransport(handler)
        return ClinicalTrialsClient(client=httpx.AsyncClient(transport=transport))

    return _factory
