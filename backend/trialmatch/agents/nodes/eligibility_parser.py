"""eligibility_parser node — structured parsing of trial eligibility text.

Implements PROJECT_PLAN.docx Section 4.4.3. Converts each candidate trial's raw
inclusion/exclusion prose into a list of structured ``Criterion`` objects (one
per bulleted line), keyed by NCT ID in ``AgentState.parsed_criteria``, so the
match_evaluator can reason over discrete, citable rules instead of a free-text
blob.

v0 uses a deterministic, fully-auditable parser: it splits the protocol's
inclusion/exclusion blocks into individual lines and routes each to a
``CriterionCategory`` by keyword. This keeps the node bounded and reproducible —
the same input always yields the same criteria. The production LLM path (Week 2)
sends the same blocks to Claude with ``prompts/eligibility_parsing.txt`` and
validates the structured output against ``Criterion``; that is a drop-in
replacement for ``_parse_trial`` below and changes nothing downstream.
"""

from __future__ import annotations

import re
from typing import Any

from trialmatch.agents.state import AgentState
from trialmatch.models import Criterion, Trial
from trialmatch.models.trial import CriterionCategory, CriterionOperator, CriterionType

# Leading list markers to strip: "- ", "* ", "• ", "1. ", "2) ", "(3) ", etc.
_BULLET = re.compile(r"^\s*(?:[-*•]|\(?\d{1,2}[.)])\s*")

# Ordered (category, keywords) routing. First match wins, so more specific
# categories (performance, lab) are checked before broad ones (diagnosis,
# demographic). Keywords are matched case-insensitively as substrings.
_CATEGORY_KEYWORDS: tuple[tuple[CriterionCategory, tuple[str, ...]], ...] = (
    ("performance", ("ecog", "performance status", "karnofsky")),
    (
        "lab",
        (
            "lvef", "ejection fraction", "hemoglobin", "platelet", "neutrophil",
            "creatinine", "bilirubin", "hepatic", "renal", "organ function",
            "bone marrow", "laboratory", "count",
        ),
    ),
    (
        "prior_treatment",
        (
            "prior", "previous", "treated", "line of", "chemotherap",
            "radiotherap", "radiation", "surgery", "received", "naive", "naïve",
        ),
    ),
    (
        "medication",
        (
            "medication", "drug", "tamoxifen", "aromatase inhibitor",
            "pembrolizumab", "trastuzumab", "concomitant",
        ),
    ),
    # Reproductive status (pregnancy / breastfeeding / contraception) is checked
    # before diagnosis and demographic so these criteria never fall into the
    # demographic age/sex logic — the structured profile does not capture them,
    # so the evaluator returns INSUFFICIENT_INFO rather than a spurious verdict.
    (
        "reproductive",
        (
            "pregnan", "breastfeed", "breast-feed", "lactat", "contracept",
            "childbearing", "child-bearing",
        ),
    ),
    (
        "diagnosis",
        (
            "cancer", "carcinoma", "tumor", "tumour", "malignan", "metasta",
            "stage", "histolog", "her2", "receptor", "triple-negative",
            "autoimmune", "lung disease", "metastases", "hiv", "hepatitis",
            "diagnos", "disease",
        ),
    ),
    (
        "demographic",
        (
            "age", "years", "female", "male", "women", "men", "menopaus",
            "adult", "sex", "gender",
        ),
    ),
)


def _categorize(text: str) -> CriterionCategory:
    low = text.lower()
    for category, keywords in _CATEGORY_KEYWORDS:
        if any(kw in low for kw in keywords):
            return category
    return "other"


def _split_lines(block: str) -> list[str]:
    """Split an eligibility block into cleaned, non-empty criterion lines."""
    lines: list[str] = []
    for raw in block.splitlines():
        cleaned = _BULLET.sub("", raw).strip()
        if cleaned:
            lines.append(cleaned)
    return lines


def _parse_block(block: str, criterion_type: CriterionType) -> list[Criterion]:
    # "has" reads as "patient must HAVE this property" for inclusion; "lacks"
    # as "patient must LACK it" for exclusion. operator/threshold/field are
    # best-effort metadata here — the evaluator is source_text-driven.
    operator: CriterionOperator = "has" if criterion_type == "inclusion" else "lacks"
    return [
        Criterion(
            criterion_type=criterion_type,
            category=_categorize(line),
            operator=operator,
            source_text=line,
        )
        for line in _split_lines(block)
    ]


def _parse_trial(trial: Trial) -> list[Criterion]:
    return [
        *_parse_block(trial.inclusion_text, "inclusion"),
        *_parse_block(trial.exclusion_text, "exclusion"),
    ]


async def eligibility_parser(state: AgentState) -> dict[str, Any]:
    trials = state.get("candidate_trials") or []
    if not trials:
        return {"parsed_criteria": {}}

    parsed: dict[str, list[Criterion]] = {}
    unparsed: list[str] = []
    for trial in trials:
        criteria = _parse_trial(trial)
        parsed[trial.nct_id] = criteria
        if not criteria:
            unparsed.append(trial.nct_id)

    result: dict[str, Any] = {"parsed_criteria": parsed}
    if unparsed:
        result["errors"] = [
            "eligibility_parser: no eligibility text to parse for "
            + ", ".join(unparsed)
        ]
    return result
