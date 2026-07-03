"""Unit tests for the eligibility_parser node.

v0's parser is deterministic (no LLM), so there is no model to mock — these
tests exercise the rule-based line splitter and category router directly, and
assert the structured ``Criterion`` output that match_evaluator depends on.
"""

from __future__ import annotations

from typing import Any

import pytest

from trialmatch.agents.nodes.eligibility_parser import _categorize, eligibility_parser
from trialmatch.models import Trial
from trialmatch.tools.clinicaltrials import _parse_study


def _trial(**overrides: Any) -> Trial:
    base: dict[str, Any] = {
        "nct_id": "NCT01234567",
        "brief_title": "Test Trial",
        "inclusion_text": "",
        "exclusion_text": "",
    }
    base.update(overrides)
    return Trial(**base)


async def test_splits_inclusion_and_exclusion_into_criteria() -> None:
    trial = _trial(
        inclusion_text="- Female, age >= 18\n- ECOG performance status 0-2",
        exclusion_text="- Prior chemotherapy\n- Severe hepatic impairment",
    )

    result = await eligibility_parser({"candidate_trials": [trial]})

    criteria = result["parsed_criteria"]["NCT01234567"]
    assert len(criteria) == 4
    assert sum(c.criterion_type == "inclusion" for c in criteria) == 2
    assert sum(c.criterion_type == "exclusion" for c in criteria) == 2


async def test_strips_bullets_and_sets_operator_by_type() -> None:
    trial = _trial(
        inclusion_text="- Female, age >= 18",
        exclusion_text="* Active second malignancy",
    )

    criteria = (await eligibility_parser({"candidate_trials": [trial]}))[
        "parsed_criteria"
    ]["NCT01234567"]

    inclusion = next(c for c in criteria if c.criterion_type == "inclusion")
    exclusion = next(c for c in criteria if c.criterion_type == "exclusion")
    assert inclusion.source_text == "Female, age >= 18"  # leading "- " removed
    assert exclusion.source_text == "Active second malignancy"  # leading "* " removed
    assert inclusion.operator == "has"
    assert exclusion.operator == "lacks"


async def test_empty_candidate_trials_returns_empty_map() -> None:
    assert await eligibility_parser({"candidate_trials": []}) == {"parsed_criteria": {}}


async def test_trial_without_eligibility_text_records_warning() -> None:
    result = await eligibility_parser({"candidate_trials": [_trial()]})

    assert result["parsed_criteria"]["NCT01234567"] == []
    assert any("NCT01234567" in err for err in result["errors"])


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("ECOG performance status 0-1", "performance"),
        ("Female, age >= 18", "demographic"),
        ("Histologically confirmed breast cancer", "diagnosis"),
        ("LVEF < 50%", "lab"),
        ("Prior chemotherapy or radiotherapy", "prior_treatment"),
        ("Willing to provide written informed consent", "other"),
    ],
)
def test_categorize_routes_by_keyword(text: str, expected: str) -> None:
    assert _categorize(text) == expected


async def test_parses_realistic_fixture_trials(
    sample_studies: list[dict[str, Any]],
) -> None:
    trials = [_parse_study(s) for s in sample_studies]

    parsed = (await eligibility_parser({"candidate_trials": trials}))["parsed_criteria"]

    assert set(parsed) == {t.nct_id for t in trials}
    for nct_id, criteria in parsed.items():
        assert criteria, f"no criteria parsed for {nct_id}"
        assert all(c.source_text for c in criteria)  # every criterion keeps its citation anchor
