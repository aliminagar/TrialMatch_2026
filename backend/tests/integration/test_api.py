"""FastAPI integration tests using TestClient.

Exercises the minimal v0 service: GET /healthz and POST /api/v1/match. The
match test overrides the ``get_ct_client`` dependency with a MockTransport-backed
client (built from tests/fixtures), so the full graph runs end-to-end through
the HTTP layer with no network access.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from trialmatch.api.dependencies import get_ct_client
from trialmatch.main import app
from trialmatch.tools.clinicaltrials import ClinicalTrialsClient

MakeClient = Callable[[list[dict[str, Any]]], ClinicalTrialsClient]


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_healthz_returns_ok(client: TestClient) -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"]


def test_match_structured_returns_ranked_report(
    client: TestClient,
    sample_studies: list[dict[str, Any]],
    sample_patients: list[dict[str, Any]],
    make_mock_ct_client: MakeClient,
) -> None:
    app.dependency_overrides[get_ct_client] = lambda: make_mock_ct_client(sample_studies)
    try:
        response = client.post(
            "/api/v1/match",
            json={"input_mode": "structured", "patient": sample_patients[0]},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert len(body["trial_verdicts"]) == len(sample_studies)

    # Real, grounded, ranked verdicts came back through the HTTP layer.
    for tv in body["trial_verdicts"]:
        assert tv["criteria_verdicts"]
        assert 0.0 <= tv["score"] <= 1.0
    scores = [tv["score"] for tv in body["trial_verdicts"]]
    assert scores == sorted(scores, reverse=True)
    assert body["disclaimer"]


def test_match_caps_trials_to_options_max_results(
    client: TestClient,
    sample_studies: list[dict[str, Any]],
    sample_patients: list[dict[str, Any]],
    make_mock_ct_client: MakeClient,
) -> None:
    assert len(sample_studies) >= 2, "fixture must have >1 study to test the cap"
    app.dependency_overrides[get_ct_client] = lambda: make_mock_ct_client(sample_studies)
    try:
        response = client.post(
            "/api/v1/match",
            json={
                "input_mode": "structured",
                "patient": sample_patients[0],
                "options": {"max_results": 1},
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert len(response.json()["trial_verdicts"]) == 1


def test_match_rejects_structured_request_without_patient(client: TestClient) -> None:
    # MatchRequest's validator requires a patient in structured mode -> 422.
    response = client.post("/api/v1/match", json={"input_mode": "structured"})

    assert response.status_code == 422


def test_get_trial_returns_trial(
    client: TestClient,
    sample_studies: list[dict[str, Any]],
    make_mock_ct_client: MakeClient,
) -> None:
    app.dependency_overrides[get_ct_client] = lambda: make_mock_ct_client(sample_studies)
    try:
        response = client.get("/api/v1/trials/NCT04000001")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["nct_id"] == "NCT04000001"


def test_get_trial_unknown_id_returns_404(
    client: TestClient,
    sample_studies: list[dict[str, Any]],
    make_mock_ct_client: MakeClient,
) -> None:
    app.dependency_overrides[get_ct_client] = lambda: make_mock_ct_client(sample_studies)
    try:
        response = client.get("/api/v1/trials/NCT09999999")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


def _parse_sse(text: str) -> list[dict[str, str]]:
    """Parse an SSE payload into a list of {'event', 'data'} frames."""
    frames: list[dict[str, str]] = []
    for block in text.replace("\r\n", "\n").strip().split("\n\n"):
        frame: dict[str, str] = {}
        for line in block.splitlines():
            if line.startswith("event:"):
                frame["event"] = line[len("event:") :].strip()
            elif line.startswith("data:"):
                frame["data"] = line[len("data:") :].strip()
        if frame:
            frames.append(frame)
    return frames


def test_match_stream_emits_state_updates_then_final_result(
    client: TestClient,
    sample_studies: list[dict[str, Any]],
    sample_patients: list[dict[str, Any]],
    make_mock_ct_client: MakeClient,
) -> None:
    app.dependency_overrides[get_ct_client] = lambda: make_mock_ct_client(sample_studies)
    try:
        response = client.post(
            "/api/v1/match",
            json={"input_mode": "structured", "patient": sample_patients[0]},
            headers={"Accept": "text/event-stream"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    frames = _parse_sse(response.text)
    names = [f["event"] for f in frames]
    # One state_update per graph node, then a terminal final_result.
    assert names.count("state_update") >= 1
    assert names[-1] == "final_result"

    final = json.loads(frames[-1]["data"])
    assert final["event"] == "final_result"
    assert len(final["report"]["trial_verdicts"]) == len(sample_studies)
