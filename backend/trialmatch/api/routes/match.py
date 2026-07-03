"""POST /api/v1/match route.

Runs the LangGraph workflow for a MatchRequest. The response is content
negotiated:

- ``Accept: text/event-stream`` -> a Server-Sent Events stream of ``StreamEvent``
  frames: one ``state_update`` per graph node as it completes, then a terminal
  ``final_result`` carrying the MatchReport (or an ``error`` frame on failure).
  This is the streaming contract in PROJECT_PLAN.docx Section 4.3 that the
  frontend SSE proxy consumes.
- otherwise -> the ranked MatchReport as a single JSON response.

The ClinicalTrials.gov client is injected via ``get_ct_client`` so tests can
supply a mock and avoid the network.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException
from langgraph.graph.state import CompiledStateGraph
from sse_starlette import EventSourceResponse

from trialmatch.agents.graph import build_graph
from trialmatch.agents.state import AgentState, init_state
from trialmatch.api.dependencies import get_ct_client
from trialmatch.models import MatchReport
from trialmatch.models.api import (
    ErrorEvent,
    FinalResultEvent,
    MatchRequest,
    StateUpdateEvent,
)
from trialmatch.tools.clinicaltrials import ClinicalTrialsClient

router = APIRouter(prefix="/api/v1", tags=["match"])


def _raw_input(request: MatchRequest) -> str | dict[str, Any]:
    """Map a MatchRequest to the graph's raw_input (validator guarantees shape)."""
    if request.input_mode == "structured":
        return request.patient.model_dump()  # type: ignore[union-attr]
    return request.clinical_note.text  # type: ignore[union-attr]


def _frame(event: StateUpdateEvent | FinalResultEvent | ErrorEvent) -> dict[str, str]:
    """Render a StreamEvent as an SSE frame for EventSourceResponse."""
    return {"event": event.event, "data": event.model_dump_json()}


async def _event_stream(
    graph: CompiledStateGraph, state: AgentState
) -> AsyncIterator[dict[str, str]]:
    final_report: MatchReport | None = None
    try:
        async for chunk in graph.astream(state, stream_mode="updates"):
            for node, delta in chunk.items():
                yield _frame(StateUpdateEvent(node=node, status="completed"))
                if isinstance(delta, dict) and isinstance(
                    delta.get("final_report"), MatchReport
                ):
                    final_report = delta["final_report"]
        if final_report is not None:
            yield _frame(FinalResultEvent(report=final_report))
        else:
            yield _frame(
                ErrorEvent(code="no_report", message="match run produced no report")
            )
    except Exception as exc:
        yield _frame(ErrorEvent(code="internal_error", message=str(exc)))


@router.post("/match", response_model=None, responses={200: {"model": MatchReport}})
async def match(
    request: MatchRequest,
    ct_client: Annotated[ClinicalTrialsClient | None, Depends(get_ct_client)],
    accept: Annotated[str, Header()] = "",
) -> MatchReport | EventSourceResponse:
    graph = build_graph(clinicaltrials_client=ct_client)
    state = init_state(_raw_input(request), request.input_mode)

    if "text/event-stream" in accept.lower():
        return EventSourceResponse(_event_stream(graph, state))

    final_state = await graph.ainvoke(state)
    report = final_state.get("final_report")
    if not isinstance(report, MatchReport):
        errors = final_state.get("errors") or ["match run produced no report"]
        raise HTTPException(status_code=500, detail="; ".join(errors))
    return report
