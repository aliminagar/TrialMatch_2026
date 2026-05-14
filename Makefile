.PHONY: help install dev test lint type-check eval up down logs clean

help:
	@echo "TrialMatch AI — common commands"
	@echo "  make install      Install backend dependencies"
	@echo "  make dev          Run backend in dev mode"
	@echo "  make test         Run all tests"
	@echo "  make lint         Run ruff"
	@echo "  make type-check   Run mypy"
	@echo "  make eval         Run LangSmith eval suite"
	@echo "  make up           Start full stack via docker-compose"
	@echo "  make down         Stop docker-compose stack"
	@echo "  make logs         Tail docker-compose logs"

install:
	cd backend && pip install -e ".[dev]"

dev:
	cd backend && uvicorn trialmatch.main:app --reload

test:
	cd backend && pytest -v

lint:
	cd backend && ruff check .

type-check:
	cd backend && mypy trialmatch

eval:
	cd backend && python evals/run_evals.py

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +
