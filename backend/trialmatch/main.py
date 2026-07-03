"""FastAPI application factory.

Builds the app and registers the route modules. Endpoint logic lives in
``trialmatch.api.routes.*`` and dependency providers in
``trialmatch.api.dependencies``; this module only wires them together.

Current v0 surface:
- GET  /healthz                    (health)
- POST /api/v1/match               (match; JSON or SSE via content negotiation)
- GET  /api/v1/trials/{nct_id}     (trials)

Deferred: /readyz, request/response middleware, and auth.
"""

from __future__ import annotations

from fastapi import FastAPI

from trialmatch import __version__
from trialmatch.api.routes import health, match, trials


def create_app() -> FastAPI:
    app = FastAPI(title="TrialMatch AI", version=__version__)
    app.include_router(health.router)
    app.include_router(match.router)
    app.include_router(trials.router)
    return app


app = create_app()
