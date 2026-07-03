"""FastAPI dependency-injection providers.

Implements PROJECT_PLAN.docx Section 4.3. Provides the ClinicalTrials.gov client
shared by the trial_discovery graph node and the /trials route.

``get_ct_client`` returns None by default, so each request builds its own
short-lived live client. Tests override it via ``app.dependency_overrides`` to
inject a MockTransport-backed client and avoid any network access.
"""

from __future__ import annotations

from trialmatch.tools.clinicaltrials import ClinicalTrialsClient


def get_ct_client() -> ClinicalTrialsClient | None:
    """Return the ClinicalTrials.gov client to use, or None to build one per run."""
    return None
