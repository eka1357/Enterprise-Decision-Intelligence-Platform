"""Tests for AI Assistant services, groundedness guardrails, and REST endpoints."""

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.services.assistant import (
    validate_groundedness,
    build_rule_based_chart_explanation,
    build_rule_based_dashboard_summary,
)


@pytest.fixture()
def mock_dataset(db: Session, registered_user: dict) -> Dataset:
    """Create a mock dataset to support AI assistant endpoint tests."""
    user_id = registered_user["response"]["id"]
    dataset = Dataset(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        filename="sales_data.csv",
        original_filename="sales_data.csv",
        file_path="dummy_path.csv",
        file_size_bytes=1000,
        row_count=5,
        column_count=4,
        status="ready",
        column_mapping={
            "date_col": "date",
            "revenue_col": "revenue",
            "quantity_col": "quantity",
            "category_col": "category",
            "region_col": "region",
        },
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


def test_groundedness_guardrail() -> None:
    """Verifies that validate_groundedness catches hallucinated percentages or values."""
    context = "KPI values: Total revenue $54,300, growth 12.5%. Lags: $51,000 yesterday."

    # 1. Grounded response
    assert validate_groundedness("Revenue grew 12.5% vs last period.", context) is True
    # Allow small standard numbers (like 1, 30 days)
    assert validate_groundedness("Projections are for the next 30 days.", context) is True

    # 2. Hallucinated response (number 99% not in context)
    assert validate_groundedness("Revenue grew 99% vs last period.", context) is False
    # Hallucinated dollar amount $99,000
    assert validate_groundedness("Total revenue was $99,000.", context) is False


def test_rule_based_chart_explanation() -> None:
    """Verifies rule-based explanation compiles averages, min, and max parameters correctly."""
    mock_chart_data = [
        {"category": "Tech", "revenue": 100.0},
        {"category": "Office", "revenue": 20.0},
        {"category": "Furniture", "revenue": 300.0},
    ]

    desc = build_rule_based_chart_explanation("bar_chart", mock_chart_data)
    assert "Furniture" in desc
    assert "300" in desc
    assert "Office" in desc


def test_rule_based_dashboard_summary() -> None:
    """Verifies rule-based summary lists KPIs, drivers, and percentage changes."""
    kpis = {
        "revenue": {
            "value": 15000.0,
            "percentage_change": 8.5,
            "business_meaning": "Revenue grew by 8.5%.",
        }
    }
    categories = [{"category": "Technology", "revenue": 8000.0}]
    regions = [{"region": "North", "revenue": 7000.0}]

    summary = build_rule_based_dashboard_summary(kpis, [], categories, regions)
    assert "15,000" in summary
    assert "8.5%" in summary
    assert "Technology" in summary
    assert "North" in summary


def test_assistant_api_endpoints(
    client: TestClient, auth_headers: dict, mock_dataset: Dataset
) -> None:
    """Verifies assistant routes respond successfully with rule-based text when API keys are unset."""
    # 1. Test explain-chart
    chart_payload = {
        "chart_type": "Area Chart",
        "chart_data": [
            {"date": "2026-07-01", "revenue": 100.0},
            {"date": "2026-07-02", "revenue": 250.0},
        ],
    }
    response_chart = client.post(
        f"/api/v1/datasets/{mock_dataset.id}/assistant/explain-chart",
        json=chart_payload,
        headers=auth_headers,
    )
    assert response_chart.status_code == 200
    assert "explanation" in response_chart.json()
    assert "250" in response_chart.json()["explanation"]

    # 2. Test summarize-dashboard
    dashboard_payload = {
        "kpis": {
            "revenue": {
                "value": 15000.0,
                "percentage_change": 8.5,
                "business_meaning": "Revenue grew by 8.5%.",
            }
        },
        "trend": [],
        "categories": [{"category": "Technology", "revenue": 8000.0}],
        "regions": [{"region": "North", "revenue": 7000.0}],
    }
    response_summary = client.post(
        f"/api/v1/datasets/{mock_dataset.id}/assistant/summarize-dashboard",
        json=dashboard_payload,
        headers=auth_headers,
    )
    assert response_summary.status_code == 200
    assert "summary" in response_summary.json()
    assert "Technology" in response_summary.json()["summary"]
