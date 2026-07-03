"""Week 1 CLI demo — runs a sample patient through the linear LangGraph.

Builds the graph, feeds in a hardcoded 58F breast-cancer profile, and
pretty-prints the resulting MatchReport.

Per PROJECT_PLAN.docx Section 13.1 deliverable:
"CLI script that runs a stub patient through the linear graph and prints a
 placeholder report."

Usage:
    python scripts/run_demo.py          # hits the live ClinicalTrials.gov API
    python scripts/run_demo.py --mock   # uses scripts/fixtures/sample_trials.json

The live path works against the real API (the client tunes its TLS cipher
suite so the ClinicalTrials.gov edge does not 403 it — see
ClinicalTrialsClient._build_ssl_context). The --mock flag runs the same parser
and graph code end-to-end against a bundled fixture, with no network access.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import httpx

# Allow `python scripts/run_demo.py` from anywhere — prepend backend/ to sys.path
# so `trialmatch` imports resolve without requiring an editable install.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from trialmatch.agents.graph import build_graph  # noqa: E402
from trialmatch.agents.state import init_state  # noqa: E402
from trialmatch.models import MatchReport  # noqa: E402
from trialmatch.tools.clinicaltrials import ClinicalTrialsClient  # noqa: E402

_FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "sample_trials.json"


SAMPLE_PATIENT = {
    "age": 58,
    "sex": "female",
    "primary_diagnosis": {
        "icd10": "C50.911",
        "description": "Malignant neoplasm of breast",
    },
    "ecog_performance_status": 1,
    "current_medications": ["metformin", "lisinopril"],
    "geographic_constraint": {"country": "US", "state": "LA"},
}


def _load_fixture() -> dict[str, Any]:
    with _FIXTURE_PATH.open(encoding="utf-8") as fp:
        return json.load(fp)


def _build_mock_client() -> ClinicalTrialsClient:
    """Construct a ClinicalTrialsClient whose transport returns the fixture.

    Exercises the real parser and HTTP layer — the only thing mocked is the
    upstream network call. /studies returns the studies list; /studies/{id}
    returns the matching study (or 404).
    """
    fixture = _load_fixture()
    studies: list[dict[str, Any]] = fixture.get("studies", [])
    by_nct: dict[str, dict[str, Any]] = {
        s["protocolSection"]["identificationModule"]["nctId"]: s for s in studies
    }

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/studies"):
            return httpx.Response(200, json={"studies": studies})
        if "/studies/" in path:
            nct_id = path.rsplit("/", 1)[-1]
            study = by_nct.get(nct_id)
            if study is None:
                return httpx.Response(404, text=f"NCT {nct_id} not in fixture")
            return httpx.Response(200, json=study)
        return httpx.Response(404, text=f"Unknown path: {path}")

    transport = httpx.MockTransport(handler)
    return ClinicalTrialsClient(client=httpx.AsyncClient(transport=transport))


def _print_report(report: MatchReport, errors: list[str]) -> None:
    p = report.patient
    print("=" * 72)
    print("TrialMatch AI - Demo Run")
    print("=" * 72)

    print("\nPatient")
    print(f"  Age:            {p.age}")
    print(f"  Sex:            {p.sex}")
    desc = f" - {p.primary_diagnosis.description}" if p.primary_diagnosis.description else ""
    print(f"  Primary dx:     {p.primary_diagnosis.icd10}{desc}")
    if p.ecog_performance_status is not None:
        print(f"  ECOG:           {p.ecog_performance_status}")
    if p.current_medications:
        print(f"  Medications:    {', '.join(p.current_medications)}")
    if p.geographic_constraint:
        g = p.geographic_constraint
        loc = ", ".join(filter(None, [g.city, g.state, g.country]))
        print(f"  Location:       {loc}")

    print(f"\nSummary\n  {report.summary}")

    print(f"\nDiscovered trials ({len(report.trial_verdicts)})")
    if not report.trial_verdicts:
        print("  (none)")
    _tag = {"PASS": "PASS", "FAIL": "FAIL", "INSUFFICIENT_INFO": "INFO"}
    for v in report.trial_verdicts:
        title = v.title if len(v.title) <= 70 else v.title[:67] + "..."
        print(f"\n  {v.nct_id}  [{v.aggregate_verdict}]  score={v.score:.2f}")
        print(f"     {title}")
        for cv in v.criteria_verdicts:
            ctype = cv.criterion.criterion_type[:4]  # "incl" / "excl"
            src = cv.criterion.source_text
            src = src if len(src) <= 58 else src[:55] + "..."
            print(f"       [{_tag[cv.verdict]}] ({ctype}) {src}")
            print(f"              -> {cv.reasoning}  (conf {cv.confidence:.2f})")

    if errors:
        print(f"\nErrors / warnings ({len(errors)})")
        for e in errors:
            print(f"  - {e}")

    print(f"\nRun ID:        {report.run_id or '(not set in Week 1)'}")
    print(f"Generated at:  {report.generated_at.isoformat()}")
    print(f"\nDisclaimer\n  {report.disclaimer}")
    print("=" * 72)


async def main() -> int:
    parser = argparse.ArgumentParser(description="TrialMatch AI Week 1 demo.")
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Use the bundled sample_trials.json fixture instead of the live API.",
    )
    args = parser.parse_args()

    mock_client = _build_mock_client() if args.mock else None
    graph = build_graph(clinicaltrials_client=mock_client)
    state = init_state(raw_input=SAMPLE_PATIENT, input_mode="structured")

    try:
        final_state = await graph.ainvoke(state)
    finally:
        if mock_client is not None:
            await mock_client.__aexit__(None, None, None)

    report = final_state.get("final_report")
    errors = final_state.get("errors") or []

    if report is None:
        print("Demo run failed - no final_report produced.")
        for e in errors:
            print(f"  - {e}")
        return 1

    _print_report(report, errors)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
