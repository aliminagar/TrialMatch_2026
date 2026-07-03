"""Health probe routes.

Implements PROJECT_PLAN.docx Section 16.4. ``/healthz`` is a liveness probe.
``/readyz`` (readiness with LLM + external-API dependency checks) is deferred
until those connectivity checks are wired.
"""

from __future__ import annotations

from fastapi import APIRouter

from trialmatch import __version__
from trialmatch.models.api import HealthStatus

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=HealthStatus)
async def healthz() -> HealthStatus:
    return HealthStatus(version=__version__)
