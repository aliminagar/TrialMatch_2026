FROM python:3.11-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]"
COPY trialmatch/ ./trialmatch/

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "trialmatch.main:app", "--host", "0.0.0.0", "--port", "8000"]
