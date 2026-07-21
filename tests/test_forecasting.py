"""Tests for ML Forecasting engine, recursive projections, and REST endpoints."""

import os
import uuid
import pytest
import pandas as pd
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.model import ModelVersion
from ml.forecasting import (
    prepare_time_series,
    engineer_features,
    train_and_evaluate,
    forecast_next_n_days,
)


@pytest.fixture()
def time_series_csv(tmp_path) -> str:
    """Create a mock time series CSV dataset with 60 days of data."""
    dates = pd.date_range(start="2026-05-01", periods=60, freq="D")
    # Linear trend + slight weekly seasonality
    sales = [100.0 + i * 2.0 + (50.0 if i % 7 == 5 else 0.0) for i in range(60)]
    df = pd.DataFrame(
        {
            "OrderDate": dates.strftime("%Y-%m-%d"),
            "SalesAmount": sales,
            "Units": [int(s / 20) for s in sales],
            "Category": ["Technology" if i % 2 == 0 else "Furniture" for i in range(60)],
            "Region": ["North" if i % 2 == 0 else "South" for i in range(60)],
        }
    )
    csv_file = tmp_path / "ts_data.csv"
    df.to_csv(csv_file, index=False)
    return str(csv_file)


@pytest.fixture()
def mapped_ts_dataset(db: Session, registered_user: dict, time_series_csv: str) -> Dataset:
    """Persist a dataset record with 60 days of historical sales and standard mapping."""
    user_id = registered_user["response"]["id"]
    dataset = Dataset(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        filename="ts_data.csv",
        original_filename="ts_data.csv",
        file_path=time_series_csv,
        file_size_bytes=4000,
        row_count=60,
        column_count=5,
        status="ready",
        column_mapping={
            "date_col": "OrderDate",
            "revenue_col": "SalesAmount",
            "quantity_col": "Units",
            "category_col": "Category",
            "region_col": "Region",
        },
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


def test_forecast_feature_engineering(time_series_csv: str) -> None:
    """Verifies that features (lags, rolling averages) are engineered correctly."""
    df = pd.read_csv(time_series_csv)
    df_daily = prepare_time_series(df, "OrderDate", "SalesAmount")
    assert len(df_daily) == 60

    df_feat, feature_cols = engineer_features(df_daily, "OrderDate", "SalesAmount")
    # Verify all expected columns are present
    for col in feature_cols:
        assert col in df_feat.columns

    # Verify lag 1 of row 10 is value of row 9
    assert df_feat["lag_1"].iloc[10] == df_daily["SalesAmount"].iloc[9]


def test_train_and_predict(time_series_csv: str) -> None:
    """Verifies XGBoost training runs and recursive forecasting bounds remain logically consistent."""
    df = pd.read_csv(time_series_csv)
    df_daily = prepare_time_series(df, "OrderDate", "SalesAmount")

    model, metrics, std_error = train_and_evaluate(df_daily, "OrderDate", "SalesAmount")
    assert "mae" in metrics
    assert "rmse" in metrics
    assert "mape" in metrics
    assert metrics["mae"] >= 0.0

    predictions, drivers = forecast_next_n_days(
        model=model,
        df_daily=df_daily,
        date_col="OrderDate",
        target_col="SalesAmount",
        n_days=30,
        std_error=std_error,
    )
    assert len(predictions) == 30
    assert len(drivers) > 0

    for p in predictions:
        assert "date" in p
        assert p["yhat_lower"] <= p["yhat"] <= p["yhat_upper"]


def test_forecasting_api_endpoints(
    client: TestClient, auth_headers: dict, mapped_ts_dataset: Dataset
) -> None:
    """Verifies forecast training and predictions API endpoints return appropriate payloads."""
    # 1. Trigger training (Celery runs synchronously in tests)
    response_train = client.post(
        f"/api/v1/datasets/{mapped_ts_dataset.id}/forecast", headers=auth_headers
    )
    assert response_train.status_code == 202
    assert "task_id" in response_train.json()

    # 2. Get latest forecast
    response_latest = client.get(
        f"/api/v1/datasets/{mapped_ts_dataset.id}/forecast/latest", headers=auth_headers
    )
    assert response_latest.status_code == 200
    data = response_latest.json()
    assert "predictions" in data
    assert len(data["predictions"]) == 30
    assert len(data["shap_drivers"]) > 0

    # 3. List model versions
    response_versions = client.get(
        f"/api/v1/datasets/{mapped_ts_dataset.id}/models", headers=auth_headers
    )
    assert response_versions.status_code == 200
    versions = response_versions.json()
    assert len(versions) >= 1
    assert "metrics" in versions[0]
