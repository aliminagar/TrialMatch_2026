"""Shared pytest fixtures.

`fast_retry` patches asyncio.sleep so tenacity's exponential-backoff waits
become no-ops. Required for the retry tests in test_tools.py to run in
milliseconds instead of seconds.
"""

from __future__ import annotations

import asyncio

import pytest


@pytest.fixture
def fast_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    """Skip the actual wait inside tenacity's async retry loop."""

    async def _no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(asyncio, "sleep", _no_sleep)
