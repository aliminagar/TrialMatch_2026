"""End-to-end integration test for the LangGraph workflow.

Drives the full compiled graph (profile_extractor -> trial_discovery ->
eligibility_parser -> match_evaluator -> report_generator) against a
MockTransport-backed ClinicalTrialsClient, so the entire pipeline runs with no
network access. v0's nodes are deterministic, so there is no LLM to mock — the
test asserts the graph produces real, ranked per-criterion verdicts rather than
the old hardcoded placeholder report.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from trialmatch.agents.graph import build_graph
from trialmatch.agents.state import init_state
from trialmatch.models import MatchReport
from trialmatch.tools.clinicaltrials import ClinicalTrialsClient

MakeClient = Callable[[list[dict[str, Any]]], ClinicalTrialsClient]


async def test_graph_runs_end_to_end_with_mock_client(
    sample_studies: list[dict[str, Any]],
    sample_patients: list[dict[str, Any]],
    make_mock_ct_client: MakeClient,
) -> None:
    client = make_mock_ct_client(sample_studies)
    graph = build_graph(clinicaltrials_client=client)
    state = init_state(raw_input=sample_patients[0], input_mode="structured")

    try:
        final_state = await graph.ainvoke(state)
    finally:
        await client.__aexit__(None, None, None)

    report = final_state.get("final_report")
    assert isinstance(report, MatchReport)
    assert len(report.trial_verdicts) == len(sample_studies)

    # Real verdicts, not the removed hardcoded NEEDS_REVIEW/0.0 placeholder.
    for tv in report.trial_verdicts:
        assert tv.criteria_verdicts, "graph should produce per-criterion verdicts"
        assert 0.0 <= tv.score <= 1.0
        for cv in tv.criteria_verdicts:
            assert cv.source_citation == cv.criterion.source_text  # grounding

    # MatchReport ranks descending by score.
    scores = [tv.score for tv in report.trial_verdicts]
    assert scores == sorted(scores, reverse=True)

    assert report.summary.startswith("Evaluated")


async def test_graph_reports_zero_trials_when_none_discovered(
    sample_patients: list[dict[str, Any]],
    make_mock_ct_client: MakeClient,
) -> None:
    client = make_mock_ct_client([])  # discovery returns no studies
    graph = build_graph(clinicaltrials_client=client)
    state = init_state(raw_input=sample_patients[0], input_mode="structured")

    try:
        final_state = await graph.ainvoke(state)
    finally:
        await client.__aexit__(None, None, None)

    report = final_state.get("final_report")
    assert isinstance(report, MatchReport)
    assert report.trial_verdicts == []
    assert "No candidate trials" in report.summary
