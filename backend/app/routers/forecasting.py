"""Forecasting endpoints to trigger training, get predictions, and list model versions."""

import os
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import joblib
import pandas as pd

from app.database import get_db
from app.dependencies import get_current_user
from app.models.dataset import Dataset
from app.models.model import ModelVersion
from app.models.user import User
from app.schemas.forecasting import ForecastResponse, ModelVersionResponse, ForecastPoint
from app.tasks import train_forecast_model_task
from ml.forecasting import prepare_time_series, forecast_next_n_days

router = APIRouter(prefix="/datasets", tags=["Forecasting"])


@router.post(
    "/{dataset_id}/forecast",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger forecasting model training",
)
def trigger_training(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Trigger background training of the sales forecasting model using Celery."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found",
        )

    if not dataset.column_mapping:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Column mapping required before training forecasting models.",
        )

    if dataset.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dataset processing is pending/failed.",
        )

    # Launch Celery task
    task = train_forecast_model_task.delay(str(dataset_id))
    return {"task_id": task.id, "status": "processing"}


@router.get(
    "/{dataset_id}/forecast/latest",
    response_model=ForecastResponse,
    summary="Retrieve latest sales forecast with SHAP explainability",
)
def get_latest_forecast(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ForecastResponse:
    """Load latest model version and recursively predict the next 30 days of sales."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found",
        )

    # Find latest trained model version
    latest_model = (
        db.query(ModelVersion)
        .filter(ModelVersion.dataset_id == dataset_id)
        .order_by(ModelVersion.created_at.desc())
        .first()
    )

    if not latest_model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No trained forecasting model found for this dataset.",
        )

    # Load model artifact
    if not os.path.exists(latest_model.file_path):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Trained model artifact file not found on disk.",
        )

    try:
        artifact = joblib.load(latest_model.file_path)
        model = artifact["model"]
        std_error = artifact["std_error"]

        # Read Cleaned CSV
        file_path = dataset.cleaned_file_path if dataset.cleaned_file_path else dataset.file_path
        df = pd.read_csv(file_path)

        mapping = dataset.column_mapping
        date_col = mapping["date_col"]
        # Match clean columns if standardized
        if date_col not in df.columns:
            clean_date_col = date_col.strip().lower().replace(" ", "_")
            if clean_date_col in df.columns:
                date_col = clean_date_col

        rev_col = mapping["revenue_col"]
        if rev_col not in df.columns:
            clean_rev_col = rev_col.strip().lower().replace(" ", "_")
            if clean_rev_col in df.columns:
                rev_col = clean_rev_col

        # Group daily
        df_daily = prepare_time_series(df, date_col, rev_col)

        # Generate next 30 days predictions
        predictions, shap_drivers = forecast_next_n_days(
            model=model,
            df_daily=df_daily,
            date_col=date_col,
            target_col=rev_col,
            n_days=30,
            std_error=std_error,
        )

        return ForecastResponse(
            dataset_id=dataset_id,
            model_version=latest_model.version_id,
            metrics=latest_model.metrics,
            predictions=[ForecastPoint(**p) for p in predictions],
            shap_drivers=shap_drivers,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate forecast: {exc}",
        )


@router.get(
    "/{dataset_id}/models",
    response_model=list[ModelVersionResponse],
    summary="List model versions trained for a dataset",
)
def list_model_versions(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ModelVersionResponse]:
    """Retrieve historical logs and accuracy metrics of all trained model runs."""
    # Verify dataset exists and belongs to current user
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found",
        )

    models = (
        db.query(ModelVersion)
        .filter(ModelVersion.dataset_id == dataset_id)
        .order_by(ModelVersion.created_at.desc())
        .all()
    )
    return [ModelVersionResponse.model_validate(m) for m in models]
