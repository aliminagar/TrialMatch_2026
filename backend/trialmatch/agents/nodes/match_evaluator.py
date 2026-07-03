"""match_evaluator node — per-criterion eligibility evaluation.

Implements PROJECT_PLAN.docx Section 4.4.4. For every candidate trial, compares
the patient profile against each parsed ``Criterion`` and emits a
``CriterionVerdict`` (PASS / FAIL / INSUFFICIENT_INFO) with grounded reasoning,
then aggregates them into a scored ``TrialVerdict`` keyed by NCT ID in
``AgentState.verdicts``.

v0 uses a deterministic, rule-based evaluator with explicit per-category routing
(``_evaluate_criterion``) — bounded, reproducible, and fully auditable, which is
exactly what a decision-support tool under clinician oversight needs. Every
verdict cites the verbatim criterion text in ``source_citation`` so the
grounding check (Section 10.3) can verify it. The production LLM path (Week 2)
swaps the router for a Claude call against ``prompts/match_evaluation.txt``
returning the same ``CriterionVerdict`` schema.

Verdict semantics are uniform across inclusion and exclusion criteria: ``PASS``
always means "good for eligibility" (an inclusion rule is met, or an exclusion
rule is not triggered) and ``FAIL`` always means "bad for eligibility" (an
inclusion rule is unmet, or an exclusion rule is triggered). Uniform semantics
let the aggregate score treat every PASS/FAIL the same way.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from trialmatch.agents.state import AgentState
from trialmatch.models import Criterion, LlmStats, PatientProfile, TrialVerdict
from trialmatch.models.match import CriterionVerdict, Verdict

logger = logging.getLogger(__name__)

# (verdict, reasoning, confidence) returned by each per-category evaluator.
EvalResult = tuple[Verdict, str, float]

# Minimal ICD-10 chapter hints, used only as a fallback when a diagnosis
# description is missing. C50 = malignant neoplasm of breast.
_ICD10_HINTS = {"C50": "breast"}

# Cancer subtype / stage / biomarker qualifiers we cannot confirm from the
# structured profile — their presence in an inclusion criterion forces
# INSUFFICIENT_INFO rather than an over-confident PASS.
_UNCONFIRMABLE_QUALIFIERS = (
    "hormone-receptor", "hormone receptor", "hr-positive", "her2",
    "triple-negative", "triple negative", "metasta", "stage", "ihc", "ish",
    "grade", "pd-l1", "histolog", "mutation", "egfr", "brca",
)

# Per-criterion contribution to the aggregate score.
_WEIGHT: dict[Verdict, float] = {
    "PASS": 1.0,
    "INSUFFICIENT_INFO": 0.3,
    "FAIL": 0.0,
}

# An age is recognized only when it carries an explicit age token — the word
# "age"/"aged" or the unit "year(s)"/"yr(s)". This keeps duration values such as
# "<= 12 months" or "within 2 years of ..." and unrelated numbers from being
# mis-read as patient ages (the bug that produced false FAILs on real trials).
_AGE_UNIT = r"(?:years?|yrs?)"
_AGE_WORD = re.compile(r"\bage[ds]?\b")
_ECOG_RANGE = re.compile(r"(\d)\s*(?:-|to|–|or)\s*(\d)")
_ECOG_MAX = re.compile(r"(?:<=|≤|less than or equal to|at most)\s*(\d)")
_ECOG_SINGLE = re.compile(r"ecog\D*(\d)")


def _flip(verdict: Verdict) -> Verdict:
    if verdict == "PASS":
        return "FAIL"
    if verdict == "FAIL":
        return "PASS"
    return verdict


def _diagnosis_terms(patient: PatientProfile) -> set[str]:
    """Salient (>3 char) tokens describing the patient's primary diagnosis."""
    terms: set[str] = set()
    diag = patient.primary_diagnosis
    if diag.description:
        terms.update(t for t in re.findall(r"[a-z]+", diag.description.lower()) if len(t) > 3)
    hint = _ICD10_HINTS.get(diag.icd10[:3])
    if hint:
        terms.add(hint)
    return terms


def _eval_ecog(patient: PatientProfile, source: str) -> EvalResult:
    if patient.ecog_performance_status is None:
        return (
            "INSUFFICIENT_INFO",
            "Trial specifies an ECOG range, but the patient's ECOG performance "
            "status is not recorded.",
            0.3,
        )
    ecog = patient.ecog_performance_status
    low = source.lower()
    rng = _ECOG_RANGE.search(low)
    if rng:
        lo, hi = sorted((int(rng.group(1)), int(rng.group(2))))
    elif (mx := _ECOG_MAX.search(low)) is not None:
        lo, hi = 0, int(mx.group(1))
    elif (single := _ECOG_SINGLE.search(low)) is not None:
        lo, hi = 0, int(single.group(1))
    else:
        return (
            "INSUFFICIENT_INFO",
            "Could not parse the required ECOG range from the criterion.",
            0.3,
        )
    if lo <= ecog <= hi:
        return ("PASS", f"Patient ECOG {ecog} is within the required range {lo}-{hi}.", 0.95)
    return ("FAIL", f"Patient ECOG {ecog} is outside the required range {lo}-{hi}.", 0.9)


def _first_int(text: str, patterns: tuple[str, ...]) -> int | None:
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return int(m.group(1))
    return None


def _parse_age_bounds(low: str) -> tuple[int | None, int | None]:
    """Return (min_age, max_age) from a criterion, requiring an explicit age token.

    Yields (None, None) when no age token is present, so durations like
    "<= 12 months" or "at least 2 years after ..." are not read as ages.
    """
    if not (_AGE_WORD.search(low) or re.search(rf"\d\s*{_AGE_UNIT}\b", low)):
        return None, None

    range_pats = (
        r"\bage[ds]?\b\s*(?:of\s*)?(\d{1,3})\s*(?:-|–|to|and)\s*(\d{1,3})",
        rf"\b(\d{{1,3}})\s*(?:-|–|to|and)\s*(\d{{1,3}})\s*{_AGE_UNIT}\b",
        rf"\bbetween\s+(\d{{1,3}})\s+and\s+(\d{{1,3}})\s*{_AGE_UNIT}\b",
    )
    for pat in range_pats:
        m = re.search(pat, low)
        if m:
            a, b = sorted((int(m.group(1)), int(m.group(2))))
            return a, b

    hi = _first_int(low, (
        rf"(?:<=|≤|under|younger than|no older than|up to|maximum age(?: of)?)"
        rf"\s*(\d{{1,3}})\s*{_AGE_UNIT}\b",
        r"\bage[ds]?\b\s*(?:of\s*)?(?:<=|≤|<)\s*(\d{1,3})",
        rf"\b(\d{{1,3}})\s*{_AGE_UNIT}\s+(?:or younger|and younger|or below)\b",
    ))
    lo = _first_int(low, (
        rf"(?:>=|≥|at least|older than|no younger than|minimum age(?: of)?)"
        rf"\s*(\d{{1,3}})\s*{_AGE_UNIT}\b",
        r"\bage[ds]?\b\s*(?:of\s*)?(?:>=|≥|>)?\s*(\d{1,3})\b",
        rf"\b(\d{{1,3}})\s*{_AGE_UNIT}\s+(?:or older|and older|or above)\b",
    ))
    return lo, hi


def _eval_demographic(patient: PatientProfile, source: str) -> EvalResult:
    """Evaluate a demographic criterion as if it were inclusion (PASS = matches).

    The caller flips the verdict for exclusion criteria.
    """
    low = source.lower()
    subs: list[tuple[Verdict, str]] = []

    if "female" in low or re.search(r"\bwomen\b", low):
        ok = patient.sex == "female"
        subs.append(("PASS" if ok else "FAIL", f"sex {patient.sex} vs required female"))
    elif re.search(r"\bmale\b", low) or re.search(r"\bmen\b", low):
        ok = patient.sex == "male"
        subs.append(("PASS" if ok else "FAIL", f"sex {patient.sex} vs required male"))

    lo, hi = _parse_age_bounds(low)
    if lo is not None or hi is not None:
        within = (lo is None or patient.age >= lo) and (hi is None or patient.age <= hi)
        if lo is not None and hi is not None:
            bound = f"{lo}-{hi}"
        elif lo is not None:
            bound = f">={lo}"
        else:
            bound = f"<={hi}"
        subs.append(("PASS" if within else "FAIL", f"age {patient.age} vs {bound}"))

    if "menopaus" in low:
        subs.append(("INSUFFICIENT_INFO", "menopausal status not recorded"))

    if not subs:
        return (
            "INSUFFICIENT_INFO",
            "Demographic criterion could not be evaluated from the profile.",
            0.3,
        )
    notes = "; ".join(note for _, note in subs)
    if any(v == "FAIL" for v, _ in subs):
        return ("FAIL", f"Demographic mismatch ({notes}).", 0.9)
    if all(v == "PASS" for v, _ in subs):
        return ("PASS", f"Demographic conditions met ({notes}).", 0.95)
    return ("INSUFFICIENT_INFO", f"Demographic only partly determinable ({notes}).", 0.4)


def _eval_lab(_patient: PatientProfile, _source: str) -> EvalResult:
    # The v0 profile rarely carries labs, and organ-function values (LVEF,
    # hepatic/renal panels) are not yet modeled for evaluation. Surface as
    # INSUFFICIENT rather than guess.
    return (
        "INSUFFICIENT_INFO",
        "Criterion depends on laboratory or organ-function values not present in "
        "the patient profile.",
        0.3,
    )


def _eval_diagnosis_inclusion(patient: PatientProfile, source: str) -> EvalResult:
    low = source.lower()
    terms = _diagnosis_terms(patient)
    organ_match = any(term in low for term in terms)
    needs_subtype = any(q in low for q in _UNCONFIRMABLE_QUALIFIERS)
    if organ_match and not needs_subtype:
        return ("PASS", "Patient's primary diagnosis matches the required condition.", 0.8)
    if organ_match and needs_subtype:
        return (
            "INSUFFICIENT_INFO",
            "Patient's diagnosis is consistent with the trial's disease site, but the "
            "criterion requires a subtype/stage/biomarker the profile does not capture.",
            0.3,
        )
    return (
        "INSUFFICIENT_INFO",
        "Cannot confirm the patient's diagnosis matches this criterion from the "
        "available profile.",
        0.3,
    )


def _eval_prior_treatment_inclusion(patient: PatientProfile, source: str) -> EvalResult:
    low = source.lower()
    wants_naive = any(
        token in low
        for token in ("naive", "naïve", "no prior", "without prior", "treatment-naive")
    )
    if wants_naive:
        if patient.prior_treatments:
            return (
                "FAIL",
                "Patient has prior treatment recorded, but the criterion requires a "
                "treatment-naive patient.",
                0.85,
            )
        return (
            "PASS",
            "No prior treatments recorded, consistent with the treatment-naive "
            "requirement.",
            0.6,
        )
    if patient.prior_treatments:
        return (
            "PASS",
            "Patient has prior treatment recorded, consistent with the requirement for "
            "prior therapy.",
            0.6,
        )
    return (
        "INSUFFICIENT_INFO",
        "Criterion requires prior therapy, but no prior treatments are recorded in the "
        "patient profile.",
        0.3,
    )


def _eval_medication_inclusion(patient: PatientProfile, source: str) -> EvalResult:
    low = source.lower()
    hit = next((m for m in patient.current_medications if m.lower() in low), None)
    if hit:
        return ("PASS", f"Patient is on {hit}, matching the medication criterion.", 0.7)
    return (
        "INSUFFICIENT_INFO",
        "Cannot confirm the medication requirement from the patient profile.",
        0.3,
    )


def _eval_exclusion_presence(
    patient: PatientProfile, source: str, category: str
) -> EvalResult:
    """Exclusion check: PASS when the excluded item is absent, FAIL when present."""
    low = source.lower()
    if category in ("prior_treatment", "medication"):
        haystack = [*patient.prior_treatments, *patient.current_medications]
        field_desc = "prior therapies or current medications"
        absent_conf = 0.6
    else:  # diagnosis / other comorbid conditions
        haystack = [c.description or c.icd10 for c in patient.comorbidities]
        field_desc = "comorbidities"
        absent_conf = 0.5
    hit = next((h for h in haystack if h and h.lower() in low), None)
    if hit:
        return (
            "FAIL",
            f"Patient profile lists {hit!r}, which this exclusion criterion rules out.",
            0.85,
        )
    return (
        "PASS",
        f"No matching {field_desc} recorded in the patient profile; clinician must "
        "confirm absence.",
        absent_conf,
    )


def _evaluate_criterion(patient: PatientProfile, crit: Criterion) -> CriterionVerdict:
    ctype = crit.criterion_type
    cat = crit.category
    src = crit.source_text

    if cat == "performance":
        verdict, reasoning, conf = _eval_ecog(patient, src)
    elif cat == "lab":
        verdict, reasoning, conf = _eval_lab(patient, src)
    elif cat == "reproductive":
        verdict, reasoning, conf = (
            "INSUFFICIENT_INFO",
            "Pregnancy, breastfeeding, or contraception status is not captured in "
            "the patient profile.",
            0.3,
        )
    elif cat == "demographic":
        verdict, reasoning, conf = _eval_demographic(patient, src)
        if ctype == "exclusion":
            verdict = _flip(verdict)
    elif ctype == "inclusion":
        if cat == "diagnosis":
            verdict, reasoning, conf = _eval_diagnosis_inclusion(patient, src)
        elif cat == "prior_treatment":
            verdict, reasoning, conf = _eval_prior_treatment_inclusion(patient, src)
        elif cat == "medication":
            verdict, reasoning, conf = _eval_medication_inclusion(patient, src)
        else:
            verdict, reasoning, conf = (
                "INSUFFICIENT_INFO",
                "No structured rule for this inclusion criterion; flagged for "
                "clinician review.",
                0.3,
            )
    else:  # exclusion with a diagnosis/medication/prior_treatment/other category
        verdict, reasoning, conf = _eval_exclusion_presence(patient, src, cat)

    return CriterionVerdict(
        criterion=crit,
        verdict=verdict,
        reasoning=reasoning,
        confidence=conf,
        source_citation=src,
    )


def _aggregate(
    nct_id: str, title: str, verdicts: list[CriterionVerdict]
) -> TrialVerdict:
    if not verdicts:
        return TrialVerdict(
            nct_id=nct_id,
            title=title,
            aggregate_verdict="NEEDS_REVIEW",
            score=0.0,
            criteria_verdicts=[],
        )
    raw = sum(_WEIGHT[v.verdict] for v in verdicts) / len(verdicts)
    n_fail = sum(1 for v in verdicts if v.verdict == "FAIL")
    insuff_ratio = sum(1 for v in verdicts if v.verdict == "INSUFFICIENT_INFO") / len(verdicts)

    if n_fail:
        aggregate: Any = "LIKELY_NO_MATCH"
        score = min(raw, 0.35)
    elif raw >= 0.75 and insuff_ratio <= 0.25:
        aggregate = "LIKELY_MATCH"
        score = raw
    else:
        aggregate = "NEEDS_REVIEW"
        score = raw

    return TrialVerdict(
        nct_id=nct_id,
        title=title,
        aggregate_verdict=aggregate,
        score=round(score, 2),
        criteria_verdicts=verdicts,
    )


# ---------------------------------------------------------------------------
# Optional Claude-backed evaluator.
#
# When TRIALMATCH_USE_LLM is set and ANTHROPIC_API_KEY is present, each trial's
# criteria are judged by Claude via structured output against the
# match_evaluation.txt contract. Any failure (no key, network error, malformed
# output) falls back to the deterministic evaluator, so tests — which never set
# the flag — stay fully offline. langchain-anthropic is imported lazily so the
# offline path never loads it.
# ---------------------------------------------------------------------------

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "match_evaluation.txt"

# Approximate list price in USD per 1M tokens, keyed by model-id prefix so a
# dated/suffixed id ("claude-sonnet-4-6-...") still matches. Longest matching
# prefix wins. Used only for a rough cost estimate in the call log; unknown
# models fall back to Sonnet-tier rates with a warning.
_PRICING_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-sonnet-5": (3.0, 15.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-opus-4-7": (5.0, 25.0),
    "claude-haiku-4-5": (1.0, 5.0),
}
_FALLBACK_PRICING = (3.0, 15.0)  # Sonnet-tier


def _estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    """Rough USD cost from token counts and the per-model price table."""
    match = max(
        (p for p in _PRICING_PER_MTOK if model.startswith(p)), key=len, default=""
    )
    if match:
        in_rate, out_rate = _PRICING_PER_MTOK[match]
    else:
        in_rate, out_rate = _FALLBACK_PRICING
        logger.warning(
            "match_evaluator: no price table entry for model %r; using Sonnet-tier "
            "rates ($%.2f/$%.2f per MTok) for the cost estimate.",
            model, in_rate, out_rate,
        )
    return (input_tokens / 1_000_000) * in_rate + (output_tokens / 1_000_000) * out_rate


def _log_llm_call(
    llm: Any, raw_message: Any, n_criteria: int, latency_s: float
) -> LlmStats:
    """Build per-trial call stats, emit an auditable log record, and return them.

    The evaluator sends all of a trial's criteria in one structured-output
    request, so usage is reported per trial (one API call), not per criterion.
    Token counts come from the model's ``usage_metadata``; cost is approximate.
    Structured fields are attached via ``extra`` so log consumers can read them
    off the LogRecord, and the returned ``LlmStats`` lets the graph surface the
    same numbers in the final report.
    """
    usage = getattr(raw_message, "usage_metadata", None) or {}
    input_tokens = int(usage.get("input_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or 0)
    response_meta = getattr(raw_message, "response_metadata", None) or {}
    model = response_meta.get("model") or getattr(llm, "model", None) or "unknown"
    cost_usd = _estimate_cost_usd(model, input_tokens, output_tokens)
    logger.info(
        "match_evaluator LLM call: model=%s criteria=%d (1 batched call) "
        "input_tokens=%d output_tokens=%d cost_usd=$%.6f latency=%.2fs",
        model, n_criteria, input_tokens, output_tokens, cost_usd, latency_s,
        extra={
            "llm_model": model,
            "n_criteria": n_criteria,
            "api_calls": 1,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd,
            "latency_s": latency_s,
        },
    )
    return LlmStats(
        model=model,
        api_calls=1,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost_usd,
        latency_s=latency_s,
    )


def _aggregate_stats(stats: list[LlmStats]) -> LlmStats | None:
    """Combine per-trial LLM stats into one run-level record (None if no calls).

    Calls, tokens, and cost sum across trials. Latency takes the max, not the
    sum: the trials are evaluated concurrently (see ``match_evaluator``), so the
    slowest single call — not their total compute time — reflects the run's
    wall-clock for the evaluation step.
    """
    if not stats:
        return None
    return LlmStats(
        model=stats[-1].model,  # same model across a run
        api_calls=sum(s.api_calls for s in stats),
        input_tokens=sum(s.input_tokens for s in stats),
        output_tokens=sum(s.output_tokens for s in stats),
        cost_usd=sum(s.cost_usd for s in stats),
        latency_s=max(s.latency_s for s in stats),
    )


class _LLMVerdict(BaseModel):
    index: int = Field(description="0-based index of the criterion being judged.")
    verdict: Verdict
    reasoning: str
    confidence: float = Field(ge=0.0, le=1.0)


class _LLMTrialEvaluation(BaseModel):
    verdicts: list[_LLMVerdict]


def _build_llm() -> Any | None:
    """Return a configured ChatAnthropic, or None to use the deterministic path."""
    if not os.environ.get("TRIALMATCH_USE_LLM") or not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    try:
        from langchain_anthropic import ChatAnthropic
    except ImportError:
        return None
    model = os.environ.get("MODEL_NAME", "claude-sonnet-4-6")
    return ChatAnthropic(model=model, temperature=0, max_tokens=8000, timeout=90)


def _llm_human_message(patient: PatientProfile, criteria: list[Criterion]) -> str:
    lines = [f"[{i}] ({c.criterion_type}) {c.source_text}" for i, c in enumerate(criteria)]
    return (
        "PATIENT PROFILE (JSON):\n"
        + json.dumps(patient.model_dump(mode="json"), indent=2)
        + "\n\nCRITERIA — return exactly one verdict per index:\n"
        + "\n".join(lines)
    )


async def _llm_evaluate(
    llm: Any, patient: PatientProfile, criteria: list[Criterion]
) -> tuple[list[CriterionVerdict], LlmStats]:
    from langchain_core.messages import HumanMessage, SystemMessage

    # include_raw=True returns {"raw": AIMessage, "parsed": model, "parsing_error": ...}
    # so we can read usage_metadata / model name off the raw message for the
    # call log, in addition to the validated structured output.
    structured = llm.with_structured_output(_LLMTrialEvaluation, include_raw=True)
    started = time.perf_counter()
    raw_result = await structured.ainvoke(
        [
            SystemMessage(content=_PROMPT_PATH.read_text(encoding="utf-8")),
            HumanMessage(content=_llm_human_message(patient, criteria)),
        ]
    )
    latency_s = time.perf_counter() - started

    result = raw_result.get("parsed")
    if result is None:
        raise RuntimeError(
            f"LLM structured output did not parse: {raw_result.get('parsing_error')!r}"
        )
    stats = _log_llm_call(llm, raw_result.get("raw"), len(criteria), latency_s)

    by_index = {v.index: v for v in result.verdicts}
    verdicts: list[CriterionVerdict] = []
    for i, crit in enumerate(criteria):
        lv = by_index.get(i)
        if lv is None:  # model skipped this one -> deterministic fallback for it
            verdicts.append(_evaluate_criterion(patient, crit))
            continue
        verdicts.append(
            CriterionVerdict(
                criterion=crit,
                verdict=lv.verdict,
                reasoning=lv.reasoning.strip() or "Model returned no reasoning.",
                confidence=min(1.0, max(0.0, lv.confidence)),
                source_citation=crit.source_text,
            )
        )
    return verdicts, stats


async def _evaluate_criteria(
    patient: PatientProfile, criteria: list[Criterion], llm: Any | None
) -> tuple[list[CriterionVerdict], LlmStats | None]:
    """Return per-criterion verdicts and, when the LLM path ran, its call stats."""
    if llm is not None and criteria:
        try:
            return await _llm_evaluate(llm, patient, criteria)
        except Exception as exc:
            # Any LLM failure -> deterministic fallback keeps the run alive, but
            # log it: a silent fallback is how a run can quietly evaluate on
            # rules while the operator believes the LLM path is active.
            logger.warning(
                "match_evaluator: LLM evaluation failed (%s: %s); falling back to "
                "the deterministic rule evaluator for %d criteria.",
                type(exc).__name__, exc, len(criteria),
            )
    return [_evaluate_criterion(patient, c) for c in criteria], None


async def match_evaluator(state: AgentState) -> dict[str, Any]:
    patient = state.get("patient")
    if not isinstance(patient, PatientProfile):
        return {"errors": ["match_evaluator: no PatientProfile in state."]}

    trials = state.get("candidate_trials") or []
    parsed = state.get("parsed_criteria") or {}
    llm = _build_llm()  # None unless explicitly opted in; keeps tests offline

    async def _evaluate_trial(
        trial: Any,
    ) -> tuple[str, TrialVerdict, LlmStats | None]:
        criteria = parsed.get(trial.nct_id, [])
        criterion_verdicts, stats = await _evaluate_criteria(patient, criteria, llm)
        return (
            trial.nct_id,
            _aggregate(trial.nct_id, trial.brief_title, criterion_verdicts),
            stats,
        )

    # Evaluate every candidate trial concurrently. On the LLM path each trial is
    # a separate ~30s structured-output call, so sequential evaluation makes a
    # multi-trial run impractically slow; gather keeps the run at roughly the
    # cost of a single call regardless of trial count.
    evaluated = await asyncio.gather(*(_evaluate_trial(t) for t in trials))

    verdicts: dict[str, TrialVerdict] = {}
    stats_by_trial: list[LlmStats] = []
    for nct_id, verdict, stats in evaluated:
        verdicts[nct_id] = verdict
        if stats is not None:
            stats_by_trial.append(stats)

    result: dict[str, Any] = {"verdicts": verdicts}
    run_stats = _aggregate_stats(stats_by_trial)
    if run_stats is not None:
        result["llm_stats"] = run_stats
    return result
