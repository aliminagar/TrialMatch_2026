"""ClinicalTrials.gov v2 API wrapper.

Implements per PROJECT_PLAN.docx Section 7.1. Provides async access to:

- GET /studies — condition search with optional location and status filters
- GET /studies/{nct_id} — single-trial lookup

Uses httpx for async I/O and tenacity for exponential-backoff retry on
transient failures (Section 17 Risk Register — rate limiting and outages).

The wrapper parses the v2 nested `protocolSection` payload into the flat
Trial model from `trialmatch.models.trial`. The eligibility text block is
split into inclusion/exclusion sections by a simple header heuristic — the
agent's eligibility_parser node does the real structured parsing later.
"""

from __future__ import annotations

import re
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from trialmatch.models.trial import (
    RecruitmentStatus,
    Trial,
    TrialLocation,
    TrialPhase,
)

DEFAULT_BASE_URL = "https://clinicaltrials.gov/api/v2"
DEFAULT_TIMEOUT = 30.0
DEFAULT_PAGE_SIZE = 25

# ClinicalTrials.gov rejects the default httpx UA with 403. Identify the
# client so the registry can rate-limit us as a known consumer.
DEFAULT_USER_AGENT = "TrialMatch-AI/0.1 (+https://github.com/alirezaminagar/trialmatch-ai)"
_DEFAULT_HEADERS = {
    "User-Agent": DEFAULT_USER_AGENT,
    "Accept": "application/json",
}

_RECRUITMENT_VALUES: frozenset[str] = frozenset(RecruitmentStatus.__args__)  # type: ignore[attr-defined]
_PHASE_VALUES: frozenset[str] = frozenset(TrialPhase.__args__)  # type: ignore[attr-defined]

# Matches an "Inclusion Criteria" header in either order; case-insensitive.
_INCLUSION_HEADER = re.compile(r"inclusion\s+criteria\s*:?", re.IGNORECASE)
_EXCLUSION_HEADER = re.compile(r"exclusion\s+criteria\s*:?", re.IGNORECASE)


class ClinicalTrialsError(RuntimeError):
    """Raised when the API returns an unrecoverable error."""


class ClinicalTrialsClient:
    """Async wrapper around the ClinicalTrials.gov v2 REST API.

    The optional `client` arg accepts a pre-built `httpx.AsyncClient` —
    useful for unit tests that inject a `MockTransport`. When omitted, the
    wrapper creates and owns its own client.
    """

    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._client = client
        self._owns_client = client is None

    async def __aenter__(self) -> ClinicalTrialsClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout, headers=_DEFAULT_HEADERS
            )
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    # ---- Public API ----------------------------------------------------

    async def search_trials(
        self,
        condition: str,
        *,
        location: str | None = None,
        status: RecruitmentStatus | None = None,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> list[Trial]:
        """Search /studies by condition with optional geographic/status filters."""
        params: dict[str, str | int] = {
            "query.cond": condition,
            "pageSize": page_size,
            "format": "json",
        }
        if location:
            params["query.locn"] = location
        if status:
            params["filter.overallStatus"] = status

        payload = await self._get("/studies", params=params)
        studies = payload.get("studies", [])
        return [_parse_study(s) for s in studies]

    async def get_trial(self, nct_id: str) -> Trial:
        """Fetch a single trial by NCT ID."""
        normalized = nct_id.upper().strip()
        payload = await self._get(f"/studies/{normalized}", params={"format": "json"})
        # /studies/{id} returns the bare study object, not wrapped under "studies".
        return _parse_study(payload)

    # ---- Internal HTTP -------------------------------------------------

    @retry(
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TransportError)),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=8.0),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    async def _get(self, path: str, *, params: dict[str, Any]) -> dict[str, Any]:
        if self._client is None:
            # Allow one-shot use without an explicit context-manager.
            self._client = httpx.AsyncClient(
                timeout=self._timeout, headers=_DEFAULT_HEADERS
            )
            self._owns_client = True

        url = f"{self._base_url}{path}"
        response = await self._client.get(url, params=params)
        # 4xx is non-retryable except 429 (rate limit). Tenacity only retries
        # if we raise; 4xx other than 429 we surface as ClinicalTrialsError.
        if response.status_code == 429 or response.status_code >= 500:
            response.raise_for_status()  # triggers retry
        if response.status_code >= 400:
            raise ClinicalTrialsError(
                f"ClinicalTrials.gov returned {response.status_code} for {path}: "
                f"{response.text[:200]}"
            )
        return response.json()  # type: ignore[no-any-return]


# ---- Parsing helpers --------------------------------------------------------

def _parse_study(study: dict[str, Any]) -> Trial:
    """Map a v2 `protocolSection` payload to our Trial model.

    Tolerant by design: missing sections are treated as absent rather than
    raising. The eligibility_parser handles partial data downstream.
    """
    proto = study.get("protocolSection", {})
    ident = proto.get("identificationModule", {})
    status_mod = proto.get("statusModule", {})
    design = proto.get("designModule", {})
    conditions_mod = proto.get("conditionsModule", {})
    eligibility_mod = proto.get("eligibilityModule", {})
    sponsor_mod = proto.get("sponsorCollaboratorsModule", {})
    locations_mod = proto.get("contactsLocationsModule", {})

    nct_id = ident.get("nctId", "")
    brief_title = ident.get("briefTitle", "") or ident.get("officialTitle", "") or nct_id

    phases = design.get("phases") or []
    phase = _normalize_phase(phases[0]) if phases else None

    overall_status = _normalize_status(status_mod.get("overallStatus"))

    eligibility_text = eligibility_mod.get("eligibilityCriteria", "") or ""
    inclusion_text, exclusion_text = _split_eligibility(eligibility_text)

    enrollment_info = design.get("enrollmentInfo") or {}
    enrollment_count = enrollment_info.get("count")

    sex_raw = (eligibility_mod.get("sex") or "").upper() or None
    eligible_sex = sex_raw if sex_raw in {"ALL", "MALE", "FEMALE"} else None

    return Trial(
        nct_id=nct_id,
        brief_title=brief_title,
        official_title=ident.get("officialTitle"),
        phase=phase,
        overall_status=overall_status,
        conditions=list(conditions_mod.get("conditions") or []),
        sponsor=(sponsor_mod.get("leadSponsor") or {}).get("name"),
        enrollment=enrollment_count if isinstance(enrollment_count, int) else None,
        eligibility_text=eligibility_text,
        inclusion_text=inclusion_text,
        exclusion_text=exclusion_text,
        locations=[_parse_location(loc) for loc in (locations_mod.get("locations") or [])],
        minimum_age=eligibility_mod.get("minimumAge"),
        maximum_age=eligibility_mod.get("maximumAge"),
        eligible_sex=eligible_sex,
    )


def _parse_location(loc: dict[str, Any]) -> TrialLocation:
    return TrialLocation(
        facility=loc.get("facility"),
        city=loc.get("city"),
        state=loc.get("state"),
        country=loc.get("country"),
        status=_normalize_status(loc.get("status")),
    )


def _normalize_status(value: str | None) -> RecruitmentStatus | None:
    if not value:
        return None
    candidate = value.upper().replace(" ", "_").replace("-", "_")
    return candidate if candidate in _RECRUITMENT_VALUES else None  # type: ignore[return-value]


def _normalize_phase(value: str | None) -> TrialPhase | None:
    if not value:
        return None
    candidate = value.upper().replace(" ", "_").replace("/", "_").replace("-", "_")
    return candidate if candidate in _PHASE_VALUES else None  # type: ignore[return-value]


def _split_eligibility(text: str) -> tuple[str, str]:
    """Split a free-text eligibility block into (inclusion, exclusion).

    The API returns one combined string with either order of headers. If
    headers are missing, the entire text is treated as inclusion text — the
    eligibility_parser node can recover from this.
    """
    if not text:
        return "", ""

    inc_match = _INCLUSION_HEADER.search(text)
    exc_match = _EXCLUSION_HEADER.search(text)

    if inc_match and exc_match:
        if inc_match.start() < exc_match.start():
            inclusion = text[inc_match.end(): exc_match.start()].strip()
            exclusion = text[exc_match.end():].strip()
        else:
            exclusion = text[exc_match.end(): inc_match.start()].strip()
            inclusion = text[inc_match.end():].strip()
        return inclusion, exclusion

    if inc_match:
        return text[inc_match.end():].strip(), ""
    if exc_match:
        return "", text[exc_match.end():].strip()
    return text.strip(), ""
