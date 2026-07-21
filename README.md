# Enterprise Decision Intelligence Platform (EDIP)

An enterprise-grade Decision Intelligence Platform that combines Data Engineering, Data Analytics, Machine Learning, Explainable AI, and Business Intelligence into a single production-quality application.

## Quick Start

```bash
docker compose up --build
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs (Swagger):** http://localhost:8000/docs

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Python, FastAPI, PostgreSQL, SQLAlchemy, Alembic |
| **Frontend** | React, TypeScript, Tailwind CSS, Shadcn UI |
| **Infrastructure** | Docker, Docker Compose |

## Project Structure

```
backend/       → FastAPI application
frontend/      → React + TypeScript application
ml/            → Machine learning models (future)
etl/           → ETL pipelines (future)
analytics/     → Analytics modules (future)
reports/       → Report generation (future)
dashboards/    → Dashboard definitions (future)
models/        → Trained model artifacts (future)
datasets/      → Sample datasets (future)
tests/         → Test suites
docs/          → Documentation
docker/        → Docker configuration
scripts/       → Utility scripts
```

## License

Proprietary — All rights reserved.
