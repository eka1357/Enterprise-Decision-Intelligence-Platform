# Phase 1 — Architecture & Setup

## Overview

Phase 1 establishes the foundational skeleton for EDIP: authentication, file upload, and dataset listing.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   Frontend   │────▶│   Backend    │────▶│  PostgreSQL │
│  React/TS    │     │   FastAPI    │     │    16       │
│  Port 3000   │     │  Port 8000   │     │  Port 5432  │
└─────────────┘     └──────────────┘     └────────────┘
                           │
                    ┌──────┴──────┐
                    │  File Store  │
                    │ /storage/    │
                    └─────────────┘
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/auth/register | No | Create a new account |
| POST | /api/v1/auth/login | No | Get JWT token |
| POST | /api/v1/datasets/upload | JWT | Upload a CSV file |
| GET | /api/v1/datasets | JWT | List user's datasets |
| GET | /health | No | Health check |
| GET | /docs | No | Swagger UI |

## Database Schema

### users
- id (UUID, PK)
- email (VARCHAR, UNIQUE)
- password_hash (VARCHAR)
- full_name (VARCHAR)
- created_at (TIMESTAMP WITH TZ)
- updated_at (TIMESTAMP WITH TZ)

### datasets
- id (UUID, PK)
- user_id (UUID, FK → users.id)
- filename (VARCHAR)
- original_filename (VARCHAR)
- file_path (VARCHAR)
- file_size_bytes (BIGINT)
- row_count (INTEGER)
- column_count (INTEGER)
- columns_metadata (JSONB)
- status (VARCHAR)
- created_at (TIMESTAMP WITH TZ)
- updated_at (TIMESTAMP WITH TZ)

## Running

```bash
docker compose up --build
```

## Testing

```bash
cd backend && pip install -r requirements.txt
cd .. && python -m pytest tests/ -v
```
