"""Unit tests for the match_evaluator node.

v0's evaluator is a deterministic rule engine (no LLM), so these tests assert
the per-category routing, verdict semantics (PASS = good for eligibility across
both inclusion and exclusion), grounding (every verdict cites its criterion),
and the score/aggregate logic — directly, without mocking a model.
"""

from __future__ import annotations

import logging
from typing import Any

import pytest

from trialmatch.agents.nodes.eligibility_parser import _categorize, eligibility_parser
from trialmatch.agents.nodes.match_evaluator import (
    _aggregate,
    _build_llm,
    _estimate_cost_usd,
    _evaluate_criteria,
    _evaluate_criterion,
    _llm_evaluate,
    _LLMTrialEvaluation,
    _LLMVerdict,
    _log_llm_call,
    _parse_age_bounds,
    match_evaluator,
)
from trialmatch.models import Criterion, Diagnosis, PatientProfile
from trialmatch.models.match import CriterionVerdict, LlmStats
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


# ---- regression: NCT07174336 real-world mis-parses ------------------------

# Verbatim ClinicalTrials.gov criterion texts that produced false FAILs before
# the parser was hardened: a duration ("<= 12 months") read as an age bound, and
# a pregnancy rule ("at least 2 years") read as a demographic age.
NCT07174336_PROGRESSION = (
    "relapsed with documented evidence of progression less than or equal to "
    "(≤)12 months of completing (neo)adjuvant ET ± CDK4/6 inhibitor."
)
NCT07174336_PREGNANCY = (
    "Are pregnant, breastfeeding, or intend to become pregnant during the study "
    "or within 6 months of the last dose of study intervention and at least 2 "
    "years after the last dose of fulvestrant and/or CDK4/6 inhibitor after the "
    "final administration of study treatment."
)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Female, age >= 18", (18, None)),
        ("Adults aged 18-75", (18, 75)),
        ("Patients up to 75 years", (None, 75)),
        ("18 years or older", (18, None)),
        # duration units and unrelated numbers must NOT be read as ages:
        ("progression within 12 months", (None, None)),
        ("stable for at least 2 weeks", (None, None)),
        (NCT07174336_PROGRESSION, (None, None)),
    ],
)
def test_parse_age_bounds(text: str, expected: tuple[int | None, int | None]) -> None:
    assert _parse_age_bounds(text.lower()) == expected


def test_regression_progression_criterion_not_failed() -> None:
    # "(≤)12 months" must not be read as "age <= 12" -> was a false FAIL.
    crit = _crit(NCT07174336_PROGRESSION, category=_categorize(NCT07174336_PROGRESSION))
    verdict = _evaluate_criterion(_patient(age=58), crit)
    assert verdict.verdict == "INSUFFICIENT_INFO"


def test_regression_pregnancy_criterion_is_reproductive_insufficient() -> None:
    # Pregnancy/contraception is its own category, never a demographic FAIL.
    assert _categorize(NCT07174336_PREGNANCY) == "reproductive"
    crit = _crit(
        NCT07174336_PREGNANCY, criterion_type="exclusion", category="reproductive"
    )
    verdict = _evaluate_criterion(_patient(age=58), crit)
    assert verdict.verdict == "INSUFFICIENT_INFO"


# ---- Claude-backed evaluator: logging, cost, and fallback (mocked, offline) --
#
# These never touch the network: a fake ChatAnthropic returns the same
# include_raw={"raw", "parsed"} shape langchain's with_structured_output emits.


class _FakeRaw:
    """Stand-in for the langchain AIMessage carried under include_raw's "raw"."""

    def __init__(self, input_tokens: int, output_tokens: int, model: str) -> None:
        self.usage_metadata = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        }
        self.response_metadata = {"model": model}


class _FakeStructured:
    def __init__(self, result: dict[str, Any], *, raises: Exception | None) -> None:
        self._result = result
        self._raises = raises

    async def ainvoke(self, _messages: Any) -> dict[str, Any]:
        if self._raises is not None:
            raise self._raises
        return self._result


class _FakeLLM:
    """Minimal ChatAnthropic double: records the include_raw flag it was given."""

    def __init__(
        self,
        result: dict[str, Any] | None = None,
        *,
        raises: Exception | None = None,
        model: str = "claude-sonnet-5",
    ) -> None:
        self._result = result or {}
        self._raises = raises
        self.model = model
        self.include_raw_seen: bool | None = None

    def with_structured_output(self, _schema: Any, *, include_raw: bool = False) -> Any:
        self.include_raw_seen = include_raw
        return _FakeStructured(self._result, raises=self._raises)


def _fake_llm_result(model: str = "claude-sonnet-5") -> dict[str, Any]:
    parsed = _LLMTrialEvaluation(
        verdicts=[
            _LLMVerdict(index=0, verdict="INSUFFICIENT_INFO", reasoning="dur", confidence=0.3),
            _LLMVerdict(index=1, verdict="PASS", reasoning="ecog ok", confidence=0.9),
        ]
    )
    return {"raw": _FakeRaw(1000, 500, model), "parsed": parsed, "parsing_error": None}


def test_estimate_cost_sonnet_rates() -> None:
    # 1000 in @ $3/MTok + 500 out @ $15/MTok = 0.003 + 0.0075 = 0.0105
    assert _estimate_cost_usd("claude-sonnet-5", 1000, 500) == pytest.approx(0.0105)


def test_estimate_cost_matches_dated_suffix_by_prefix() -> None:
    # A dated/suffixed id still resolves to the same Sonnet rates via prefix.
    assert _estimate_cost_usd("claude-sonnet-5-20990101", 1_000_000, 0) == pytest.approx(3.0)


def test_estimate_cost_unknown_model_warns_and_uses_sonnet_fallback(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.WARNING, logger="trialmatch.agents.nodes.match_evaluator"):
        cost = _estimate_cost_usd("some-unlisted-model", 1_000_000, 0)
    assert cost == pytest.approx(3.0)  # Sonnet-tier fallback
    assert any("no price table entry" in r.message for r in caplog.records)


def test_log_llm_call_emits_structured_proof(caplog: pytest.LogCaptureFixture) -> None:
    llm = _FakeLLM(model="claude-sonnet-5")
    with caplog.at_level(logging.INFO, logger="trialmatch.agents.nodes.match_evaluator"):
        _log_llm_call(llm, _FakeRaw(1000, 500, "claude-sonnet-5"), n_criteria=2, latency_s=1.5)
    rec = next(r for r in caplog.records if getattr(r, "llm_model", None))
    assert rec.levelno == logging.INFO
    assert rec.llm_model == "claude-sonnet-5"
    assert rec.api_calls == 1
    assert rec.input_tokens == 1000
    assert rec.output_tokens == 500
    assert rec.n_criteria == 2
    assert rec.cost_usd == pytest.approx(0.0105)
    assert rec.latency_s == 1.5


async def test_llm_evaluate_maps_verdicts_and_logs(caplog: pytest.LogCaptureFixture) -> None:
    llm = _FakeLLM(_fake_llm_result())
    criteria = [
        _crit("relapsed within 12 months", category="prior_treatment"),
        _crit("ECOG 0-1", category="performance"),
    ]
    with caplog.at_level(logging.INFO, logger="trialmatch.agents.nodes.match_evaluator"):
        verdicts, stats = await _llm_evaluate(llm, _patient(), criteria)

    assert llm.include_raw_seen is True  # we asked for the raw message
    assert [v.verdict for v in verdicts] == ["INSUFFICIENT_INFO", "PASS"]
    # grounding is preserved: each verdict cites its own criterion text
    assert [v.source_citation for v in verdicts] == [c.source_text for c in criteria]
    # stats are returned for the report, not just logged
    assert stats.model == "claude-sonnet-5"
    assert stats.api_calls == 1
    assert stats.input_tokens == 1000 and stats.output_tokens == 500
    assert stats.cost_usd == pytest.approx(0.0105)
    assert any(getattr(r, "llm_model", None) == "claude-sonnet-5" for r in caplog.records)


async def test_evaluate_criteria_falls_back_and_warns_on_llm_error(
    caplog: pytest.LogCaptureFixture,
) -> None:
    llm = _FakeLLM(raises=RuntimeError("boom"))
    criteria = [_crit("ECOG 0-1", category="performance")]
    with caplog.at_level(logging.WARNING, logger="trialmatch.agents.nodes.match_evaluator"):
        verdicts, stats = await _evaluate_criteria(_patient(), criteria, llm)

    # Deterministic result still produced (ECOG 1 within 0-1 -> PASS), no stats.
    assert [v.verdict for v in verdicts] == ["PASS"]
    assert stats is None
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert warnings, "expected a fallback WARNING"
    assert "RuntimeError" in warnings[-1].message and "boom" in warnings[-1].message


def test_aggregate_stats_sums_across_trials() -> None:
    from trialmatch.agents.nodes.match_evaluator import _aggregate_stats

    assert _aggregate_stats([]) is None
    a = LlmStats(model="claude-sonnet-5", api_calls=1, input_tokens=1000,
                 output_tokens=500, cost_usd=0.0105, latency_s=2.0)
    b = LlmStats(model="claude-sonnet-5", api_calls=1, input_tokens=200,
                 output_tokens=100, cost_usd=0.0021, latency_s=1.5)
    agg = _aggregate_stats([a, b])
    assert agg is not None
    assert agg.api_calls == 2
    assert agg.input_tokens == 1200 and agg.output_tokens == 600
    assert agg.cost_usd == pytest.approx(0.0126)
    # latency is the max (concurrent eval), not the sum
    assert agg.latency_s == pytest.approx(2.0)


async def test_match_evaluator_surfaces_llm_stats_in_state(
    monkeypatch: pytest.MonkeyPatch, sample_studies: list[dict[str, Any]]
) -> None:
    # Force the node onto the (mocked) LLM path by patching the builder.
    from trialmatch.agents.nodes import match_evaluator as me

    trials = [_parse_study(s) for s in sample_studies][:1]
    parsed = (await eligibility_parser({"candidate_trials": trials}))["parsed_criteria"]
    n = len(parsed[trials[0].nct_id])
    result = {
        "raw": _FakeRaw(1500, 900, "claude-sonnet-5"),
        "parsed": _LLMTrialEvaluation(
            verdicts=[
                _LLMVerdict(index=i, verdict="PASS", reasoning="ok", confidence=0.8)
                for i in range(n)
            ]
        ),
        "parsing_error": None,
    }
    monkeypatch.setattr(me, "_build_llm", lambda: _FakeLLM(result))

    state = await me.match_evaluator(
        {"patient": _patient(), "candidate_trials": trials, "parsed_criteria": parsed}
    )
    assert "llm_stats" in state
    stats = state["llm_stats"]
    assert isinstance(stats, LlmStats)
    assert stats.api_calls == 1
    assert stats.input_tokens == 1500 and stats.output_tokens == 900


async def test_match_evaluator_omits_llm_stats_on_rules_path(
    sample_studies: list[dict[str, Any]]
) -> None:
    # No opt-in flag -> deterministic path -> no llm_stats key.
    trials = [_parse_study(s) for s in sample_studies][:1]
    parsed = (await eligibility_parser({"candidate_trials": trials}))["parsed_criteria"]
    state = await match_evaluator(
        {"patient": _patient(), "candidate_trials": trials, "parsed_criteria": parsed}
    )
    assert "llm_stats" not in state


# ---- LLM path is opt-in and off by default (keeps tests offline) -----------

def test_build_llm_disabled_without_optin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TRIALMATCH_USE_LLM", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-not-real")
    assert _build_llm() is None  # no opt-in flag -> deterministic, no network


def test_build_llm_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRIALMATCH_USE_LLM", "1")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert _build_llm() is None  # opted in but no key -> deterministic
