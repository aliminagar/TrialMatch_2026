#!/usr/bin/env bash
# TODO: Deploy script — see PROJECT_PLAN.docx Section 12.
set -e
flyctl deploy --app trialmatch-api --config infrastructure/fly.toml
