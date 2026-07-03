"""FastAPI application factory.

Builds the app and registers the route modules. Endpoint logic lives in
``trialmatch.api.routes.*`` and dependency providers in
``trialmatch.api.dependencies``; this module only wires them together.

Current v0 surface:
- GET  /healthz                    (health)
- POST /api/v1/match               (match; JSON or SSE via content negotiation)
- GET  /api/v1/trials/{nct_id}     (trials)

Deferred: /readyz, request/response middleware, and auth.

CORS: the Next.js frontend (default http://localhost:3000) calls the API from
the browser, so cross-origin requests are permitted for the configured web
origins. Override with the ``TRIALMATCH_CORS_ORIGINS`` env var (comma-separated).
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from trialmatch import __version__
from trialmatch.api.routes import health, match, trials

_DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"


def _cors_origins() -> list[str]:
    raw = os.environ.get("TRIALMATCH_CORS_ORIGINS", _DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    app = FastAPI(title="TrialMatch AI", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(match.router)
    app.include_router(trials.router)
    return app


app = create_app()
