"""Tests for Sales Analytics DuckDB services and endpoints."""

import os
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.services.queries import get_sales_analytics


@pytest.fixture()
def sales_csv(tmp_path) -> str:
    """Create a mock sales CSV dataset."""
    csv_content = (
        "OrderDate,SalesAmount,Units,Category,Region,Customer\n"
        "2026-07-01,150.0,3,Technology,North,CustA\n"
        "2026-07-02,80.0,2,Furniture,South,CustB\n"
        "2026-07-03,20.0,1,Office Supplies,East,CustC\n"
        "2026-07-04,300.0,5,Technology,West,CustA\n"
        "2026-07-05,120.0,4,Office Supplies,North,CustD\n"
    )
    csv_file = tmp_path / "sales_data.csv"
    csv_file.write_text(csv_content)
    return str(csv_file)


@pytest.fixture()
def mapped_dataset(db: Session, registered_user: dict, sales_csv: str) -> Dataset:
    """Persist a dataset with valid sales column mapping."""
    user_id = registered_user["response"]["id"]
    dataset = Dataset(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        filename="sales_data.csv",
        original_filename="sales_data.csv",
        file_path=sales_csv,
        file_size_bytes=1000,
        row_count=5,
        column_count=6,
        status="ready",
        column_mapping={
            "date_col": "OrderDate",
            "revenue_col": "SalesAmount",
            "quantity_col": "Units",
            "category_col": "Category",
            "region_col": "Region",
            "customer_col": "Customer",
        },
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


def test_get_sales_analytics(sales_csv: str) -> None:
    """Verifies that DuckDB aggregation queries calculate correct Sales metrics."""
    mapping = {
        "date_col": "OrderDate",
        "revenue_col": "SalesAmount",
        "quantity_col": "Units",
        "category_col": "Category",
        "region_col": "Region",
        "customer_col": "Customer",
    }

    # 1. Test Aggregations without filters
    report = get_sales_analytics(sales_csv, mapping)
    kpis = report["kpis"]

    # Current revenue = 150 + 80 + 20 + 300 + 120 = 670.0
    assert kpis["revenue"]["value"] == 670.0
    # Current units = 3 + 2 + 1 + 5 + 4 = 15
    assert kpis["quantity"]["value"] == 15
    # Unique customers = CustA, CustB, CustC, CustD = 4
    assert kpis["customers"]["value"] == 4
    # AOV = 670 / 5 = 134.0
    assert kpis["aov"]["value"] == 134.0

    # Assert Category listings (Technology has max revenue = 450)
    assert report["categories"][0]["category"] == "Technology"
    assert report["categories"][0]["revenue"] == 450.0

    # 2. Test Category drill-down filter
    report_filtered = get_sales_analytics(
        sales_csv, mapping, category_filter="Technology"
    )
    # Total revenue for Tech = 150 + 300 = 450.0
    assert report_filtered["kpis"]["revenue"]["value"] == 450.0
    assert len(report_filtered["categories"]) == 1
    assert report_filtered["categories"][0]["category"] == "Technology"


def test_api_get_sales_metrics(
    client: TestClient, auth_headers: dict, mapped_dataset: Dataset
) -> None:
    """Verifies Sales metrics endpoint permissions, routing, and column mapping checks."""
    # 1. Fetch metrics successfully
    response = client.get(
        f"/api/v1/analytics/sales/{mapped_dataset.id}", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "kpis" in data
    assert data["kpis"]["revenue"]["value"] == 670.0

    # 2. Fetch metrics for non-existent dataset
    wrong_id = uuid.uuid4()
    response_missing = client.get(
        f"/api/v1/analytics/sales/{wrong_id}", headers=auth_headers
    )
    assert response_missing.status_code == 404


def test_api_save_column_mapping(
    client: TestClient, auth_headers: dict, mapped_dataset: Dataset
) -> None:
    """Verifies that posting column mapping updates DB model successfully."""
    new_mapping = {
        "date_col": "OrderDate",
        "revenue_col": "SalesAmount",
        "quantity_col": "Units",
        "category_col": "Category",
        "region_col": "Region",
    }
    response = client.post(
        f"/api/v1/datasets/{mapped_dataset.id}/map",
        json=new_mapping,
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["column_mapping"]["revenue_col"] == "SalesAmount"
    # Customer column should be null/absent as it wasn't posted
    assert "customer_col" not in data["column_mapping"]
