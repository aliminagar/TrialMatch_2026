"""Unit tests for the match_evaluator node.

v0's evaluator is a deterministic rule engine (no LLM), so these tests assert
the per-category routing, verdict semantics (PASS = good for eligibility across
both inclusion and exclusion), grounding (every verdict cites its criterion),
and the score/aggregate logic — directly, without mocking a model.
"""

from __future__ import annotations

from typing import Any

from trialmatch.agents.nodes.eligibility_parser import eligibility_parser
from trialmatch.agents.nodes.match_evaluator import (
    _aggregate,
    _evaluate_criterion,
    match_evaluator,
)
from trialmatch.models import Criterion, Diagnosis, PatientProfile
from trialmatch.models.match import CriterionVerdict
from trialmatch.tools.clinicaltrials import _parse_study


def _patient(**overrides: Any) -> PatientProfile:
    base: dict[str, Any] = {
        "age": 58,
        "sex": "female",
        "primary_diagnosis": Diagnosis(
            icd10="C50.911", description="Malignant neoplasm of breast"
        ),
        "ecog_performance_status": 1,
    }
    base.update(overrides)
    return PatientProfile(**base)


def _crit(
    source: str, *, criterion_type: str = "inclusion", category: str = "other"
) -> Criterion:
    operator = "has" if criterion_type == "inclusion" else "lacks"
    return Criterion(
        criterion_type=criterion_type,  # type: ignore[arg-type]
        category=category,  # type: ignore[arg-type]
        operator=operator,
        source_text=source,
    )


def _cv(verdict: str) -> CriterionVerdict:
    return CriterionVerdict(
        criterion=_crit("placeholder criterion"),
        verdict=verdict,  # type: ignore[arg-type]
        reasoning="reason",
        confidence=0.5,
        source_citation="placeholder criterion",
    )


# ---- per-criterion routing -------------------------------------------------

def test_ecog_within_range_passes_and_is_grounded() -> None:
    verdict = _evaluate_criterion(
        _patient(ecog_performance_status=1), _crit("ECOG 0-2", category="performance")
    )
    assert verdict.verdict == "PASS"
    assert verdict.source_citation == "ECOG 0-2"  # grounding


def test_ecog_outside_range_fails() -> None:
    verdict = _evaluate_criterion(
        _patient(ecog_performance_status=3), _crit("ECOG 0-1", category="performance")
    )
    assert verdict.verdict == "FAIL"


def test_ecog_missing_is_insufficient() -> None:
    verdict = _evaluate_criterion(
        _patient(ecog_performance_status=None), _crit("ECOG 0-1", category="performance")
    )
    assert verdict.verdict == "INSUFFICIENT_INFO"


def test_demographic_sex_and_age_pass() -> None:
    verdict = _evaluate_criterion(
        _patient(), _crit("Female, age >= 18", category="demographic")
    )
    assert verdict.verdict == "PASS"


def test_demographic_sex_mismatch_fails() -> None:
    verdict = _evaluate_criterion(
        _patient(sex="male"), _crit("Female, age >= 18", category="demographic")
    )
    assert verdict.verdict == "FAIL"


def test_demographic_exclusion_inverts_verdict() -> None:
    # Exclusion "Male patients" with a female patient: not excluded -> PASS.
    verdict = _evaluate_criterion(
        _patient(sex="female"),
        _crit("Male patients", criterion_type="exclusion", category="demographic"),
    )
    assert verdict.verdict == "PASS"


def test_diagnosis_site_match_without_subtype_passes() -> None:
    verdict = _evaluate_criterion(
        _patient(), _crit("Confirmed breast cancer", category="diagnosis")
    )
    assert verdict.verdict == "PASS"


def test_diagnosis_with_unconfirmable_subtype_is_insufficient() -> None:
    verdict = _evaluate_criterion(
        _patient(), _crit("HER2-positive breast cancer", category="diagnosis")
    )
    assert verdict.verdict == "INSUFFICIENT_INFO"


def test_exclusion_medication_present_fails() -> None:
    patient = _patient(current_medications=["warfarin"])
    verdict = _evaluate_criterion(
        patient,
        _crit(
            "Current treatment with warfarin",
            criterion_type="exclusion",
            category="medication",
        ),
    )
    assert verdict.verdict == "FAIL"


def test_exclusion_absent_treatment_passes() -> None:
    verdict = _evaluate_criterion(
        _patient(),
        _crit(
            "Prior tamoxifen therapy",
            criterion_type="exclusion",
            category="prior_treatment",
        ),
    )
    assert verdict.verdict == "PASS"


def test_lab_criterion_is_insufficient() -> None:
    verdict = _evaluate_criterion(_patient(), _crit("LVEF < 50%", category="lab"))
    assert verdict.verdict == "INSUFFICIENT_INFO"


# ---- aggregation -----------------------------------------------------------

def test_aggregate_all_pass_is_likely_match() -> None:
    tv = _aggregate("NCT00000001", "t", [_cv("PASS")] * 4)
    assert tv.aggregate_verdict == "LIKELY_MATCH"
    assert tv.score >= 0.75


def test_aggregate_any_fail_is_likely_no_match_and_capped() -> None:
    tv = _aggregate("NCT00000001", "t", [_cv("PASS"), _cv("PASS"), _cv("FAIL")])
    assert tv.aggregate_verdict == "LIKELY_NO_MATCH"
    assert tv.score <= 0.35


def test_aggregate_mixed_unknowns_needs_review() -> None:
    tv = _aggregate(
        "NCT00000001", "t", [_cv("PASS"), _cv("INSUFFICIENT_INFO"), _cv("INSUFFICIENT_INFO")]
    )
    assert tv.aggregate_verdict == "NEEDS_REVIEW"


def test_aggregate_empty_is_needs_review_zero() -> None:
    tv = _aggregate("NCT00000001", "t", [])
    assert tv.aggregate_verdict == "NEEDS_REVIEW"
    assert tv.score == 0.0


# ---- node integration over fixtures ----------------------------------------

async def test_match_evaluator_requires_patient() -> None:
    result = await match_evaluator({"candidate_trials": []})
    assert "errors" in result


async def test_match_evaluator_node_over_fixture(
    sample_studies: list[dict[str, Any]], sample_patients: list[dict[str, Any]]
) -> None:
    trials = [_parse_study(s) for s in sample_studies]
    patient = PatientProfile.model_validate(sample_patients[0])
    parsed = (await eligibility_parser({"candidate_trials": trials}))["parsed_criteria"]

    verdicts = (
        await match_evaluator(
            {"patient": patient, "candidate_trials": trials, "parsed_criteria": parsed}
        )
    )["verdicts"]

    assert set(verdicts) == {t.nct_id for t in trials}
    for tv in verdicts.values():
        assert tv.criteria_verdicts, "expected real per-criterion verdicts"
        assert 0.0 <= tv.score <= 1.0
        for cv in tv.criteria_verdicts:
            assert cv.source_citation == cv.criterion.source_text  # grounding
