"""Pydantic request and response schemas for ML forecasting."""

import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel


class ModelVersionResponse(BaseModel):
    """Response schema for model runs and evaluations."""

    id: uuid.UUID
    dataset_id: uuid.UUID
    version_id: str
    metrics: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class ForecastPoint(BaseModel):
    """Represents a single forecasted date prediction."""

    date: str
    yhat: float
    yhat_lower: float
    yhat_upper: float


class ForecastResponse(BaseModel):
    """Response schema for forecast predictions and explainabilities."""

    dataset_id: uuid.UUID
    model_version: str
    metrics: dict[str, Any]
    predictions: list[ForecastPoint]
    shap_drivers: list[str]
