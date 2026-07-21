"""Tests for marketing analytics and K-Means segmentation."""

import os
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
import pandas as pd

from app.models.dataset import Dataset
from ml.segmentation import prepare_segmentation_features, train_segmentation


@pytest.fixture()
def marketing_csv(tmp_path) -> str:
    """Create a mock sales/marketing CSV dataset with customer, spend, conversions, and clicks."""
    csv_content = (
        "date,campaign,spend,clicks,conversions,revenue,customer\n"
        "2026-07-01,Campaign A,100.0,50,5,150.0,CustA\n"
        "2026-07-02,Campaign B,50.0,20,2,100.0,CustB\n"
        "2026-07-03,Campaign A,150.0,60,6,300.0,CustA\n"
        "2026-07-04,Campaign C,200.0,80,8,100.0,CustC\n"
        "2026-07-05,Campaign B,100.0,40,4,200.0,CustB\n"
    )
    csv_file = tmp_path / "marketing_sample.csv"
    csv_file.write_text(csv_content)
    return str(csv_file)


@pytest.fixture()
def mock_marketing_dataset(db: Session, registered_user: dict, marketing_csv: str) -> Dataset:
    """Create a mock dataset with valid column mapping for marketing tests."""
    user_id = registered_user["response"]["id"]
    dataset = Dataset(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        filename="marketing_sample.csv",
        original_filename="marketing_sample.csv",
        file_path=marketing_csv,
        file_size_bytes=2048,
        row_count=5,
        column_count=7,
        status="ready",
        column_mapping={
            "date_col": "date",
            "category_col": "campaign",  # Map campaign name to category fallback
            "revenue_col": "revenue",
            "quantity_col": "conversions",  # Map conversions to quantity fallback
            "customer_col": "customer",
            "spend_col": "spend",
            "conversions_col": "conversions",
            "clicks_col": "clicks",
        },
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


def test_segmentation_feature_extraction(marketing_csv: str) -> None:
    """Verifies K-Means customer RFM feature aggregates are grouped correctly."""
    df = pd.read_csv(marketing_csv)
    mapping = {
        "customer_col": "customer",
        "revenue_col": "revenue",
    }
    
    features = prepare_segmentation_features(df, mapping)
    assert len(features) == 3  # CustA, CustB, CustC
    
    # Verify CustA spend is 150 + 300 = 450
    custa_data = features[features["customer"] == "CustA"]
    assert custa_data["total_spend"].values[0] == 450.0
    assert custa_data["frequency"].values[0] == 2
    assert custa_data["avg_order_value"].values[0] == 225.0


def test_segmentation_training(marketing_csv: str) -> None:
    """Verifies K-Means segmentation trains and labels customer segment designations."""
    df = pd.read_csv(marketing_csv)
    mapping = {
        "customer_col": "customer",
        "revenue_col": "revenue",
    }
    df_features = prepare_segmentation_features(df, mapping)
    
    kmeans, scaler, metrics, df_labeled = train_segmentation(df_features)
    
    assert "silhouette" in metrics
    assert "profiles" in metrics
    assert len(df_labeled) == 3
    assert "segment_name" in df_labeled.columns


def test_marketing_analytics_router(
    client: TestClient, auth_headers: dict, mock_marketing_dataset: Dataset
) -> None:
    """Verifies marketing analytics endpoint aggregates conversion indicators."""
    res = client.get(
        f"/api/v1/analytics/marketing/{mock_marketing_dataset.id}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    
    assert "kpis" in data
    assert "spend" in data["kpis"]
    assert "conversion_rate" in data["kpis"]
    assert "cac" in data["kpis"]
    assert "roas" in data["kpis"]
    
    # Total Conversions A=11, B=6, C=8 -> A should be top campaign
    assert len(data["campaigns"]) > 0
    assert data["campaigns"][0]["campaign"] == "Campaign A"
