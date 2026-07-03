"""GET /api/v1/trials/{nct_id} route.

Fetches a single trial from ClinicalTrials.gov v2 via the shared client. A
missing trial surfaces as 404; other upstream failures as 502.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from trialmatch.api.dependencies import get_ct_client
from trialmatch.models import Trial
from trialmatch.tools.clinicaltrials import ClinicalTrialsClient, ClinicalTrialsError

router = APIRouter(prefix="/api/v1", tags=["trials"])


async def _fetch(client: ClinicalTrialsClient | None, nct_id: str) -> Trial:
    if client is not None:
        return await client.get_trial(nct_id)
    async with ClinicalTrialsClient() as owned:
        return await owned.get_trial(nct_id)


@router.get("/trials/{nct_id}", response_model=Trial)
async def get_trial(
    nct_id: str,
    ct_client: Annotated[ClinicalTrialsClient | None, Depends(get_ct_client)],
) -> Trial:
    try:
        return await _fetch(ct_client, nct_id)
    except ClinicalTrialsError as exc:
        status_code = 404 if "returned 404" in str(exc) else 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
