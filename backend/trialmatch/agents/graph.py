"""LangGraph state machine assembly.

Implements the linear evaluation path per PROJECT_PLAN.docx Section 4.2:

    START → profile_extractor → trial_discovery → eligibility_parser
          → match_evaluator → report_generator → END

Conditional edges, retry loops, and HITL interrupts (Section 4.2 figure
4.2) are deferred to Week 3 (Section 13.3). The graph builder accepts an
optional ClinicalTrialsClient so the FastAPI server can inject a long-lived
client (and tests can inject a MockTransport-backed one).
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from trialmatch.agents.nodes.eligibility_parser import eligibility_parser
from trialmatch.agents.nodes.match_evaluator import match_evaluator
from trialmatch.agents.nodes.profile_extractor import profile_extractor
from trialmatch.agents.nodes.report_generator import report_generator
from trialmatch.agents.nodes.trial_discovery import make_trial_discovery
from trialmatch.agents.state import AgentState
from trialmatch.tools.clinicaltrials import ClinicalTrialsClient


def build_graph(
    *,
    clinicaltrials_client: ClinicalTrialsClient | None = None,
) -> CompiledStateGraph:
    """Assemble and compile the Week 1 linear LangGraph workflow.

    Pass a `clinicaltrials_client` to share one HTTP client across runs
    (FastAPI server, integration tests). Pass nothing and each call to
    trial_discovery will create and tear down its own client — fine for the
    CLI demo, wasteful in production.
    """
    graph: StateGraph[AgentState] = StateGraph(AgentState)

    graph.add_node("profile_extractor", profile_extractor)
    graph.add_node("trial_discovery", make_trial_discovery(clinicaltrials_client))
    graph.add_node("eligibility_parser", eligibility_parser)
    graph.add_node("match_evaluator", match_evaluator)
    graph.add_node("report_generator", report_generator)

    graph.add_edge(START, "profile_extractor")
    graph.add_edge("profile_extractor", "trial_discovery")
    graph.add_edge("trial_discovery", "eligibility_parser")
    graph.add_edge("eligibility_parser", "match_evaluator")
    graph.add_edge("match_evaluator", "report_generator")
    graph.add_edge("report_generator", END)

    return graph.compile()
