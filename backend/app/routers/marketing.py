"""Marketing module routers exposing marketing aggregates and K-Means segmentation triggers."""

import uuid
from typing import Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.dataset import Dataset
from app.models.model import ModelVersion
from app.models.user import User
from app.services.queries import execute_duckdb_query
from app.tasks import train_segmentation_model_task

router = APIRouter(prefix="/analytics/marketing", tags=["Marketing Analytics"])


def get_marketing_kpi(value: float, prev: float, label: str, meaning: str) -> dict[str, Any]:
    """Format KPI outputs with percentage changes and meanings."""
    pct = 0.0
    if prev > 0:
        pct = round(((value - prev) / prev) * 100, 1)
    return {
        "label": label,
        "value": round(value, 2),
        "previous_value": round(prev, 2),
        "percentage_change": pct,
        "business_meaning": meaning,
    }


@router.get(
    "/{dataset_id}",
    summary="Compute Campaign Spend, Conversion Rate, CAC, and ROAS",
)
def get_marketing_metrics(
    dataset_id: uuid.UUID,
    start_date: str | None = None,
    end_date: str | None = None,
    campaign_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Run aggregations against ad campaign columns using DuckDB."""
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

    mapping = dataset.column_mapping
    if not mapping:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Column mapping required to query marketing analytics.",
        )

    file_path = dataset.cleaned_file_path if dataset.cleaned_file_path else dataset.file_path

    # Extract mapped column names
    date_col = mapping.get("date_col")
    campaign_col = mapping.get("campaign_col") or mapping.get("category_col")
    spend_col = mapping.get("spend_col") or mapping.get("revenue_col")  # Fallback if no spend
    conversions_col = mapping.get("conversions_col") or mapping.get("quantity_col")
    clicks_col = mapping.get("clicks_col")
    revenue_col = mapping.get("revenue_col")

    if not date_col or not campaign_col or not spend_col or not conversions_col:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mapping columns missing. Specify date, campaign name, spend, and conversions.",
        )

    try:
        # Build base filter
        filters = []
        params = []

        if start_date:
            filters.append(f"CAST({date_col} AS DATE) >= CAST(? AS DATE)")
            params.append(start_date)
        if end_date:
            filters.append(f"CAST({date_col} AS DATE) <= CAST(? AS DATE)")
            params.append(end_date)
        if campaign_filter:
            filters.append(f"{campaign_col} = ?")
            params.append(campaign_filter)

        filter_str = " AND ".join(filters)
        where_clause = f"WHERE {filter_str}" if filters else ""

        # Query bounds to split current and previous periods
        bounds_query = f"SELECT MIN({date_col}), MAX({date_col}) FROM '{file_path}'"
        bounds = execute_duckdb_query(bounds_query)[0]
        min_d, max_d = bounds[0], bounds[1]

        if not min_d or not max_d:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No date entries found inside dataset.",
            )

        # Convert to datetime to split period midpoint
        min_dt = datetime.strptime(str(min_d)[:10], "%Y-%m-%d")
        max_dt = datetime.strptime(str(max_d)[:10], "%Y-%m-%d")
        midpoint = min_dt + (max_dt - min_dt) / 2
        midpoint_str = midpoint.strftime("%Y-%m-%d")

        # Period queries
        # Current period (after midpoint)
        curr_filters = [f"CAST({date_col} AS DATE) >= CAST('{midpoint_str}' AS DATE)"] + filters
        curr_where = "WHERE " + " AND ".join(curr_filters)

        # Previous period (before midpoint)
        prev_filters = [f"CAST({date_col} AS DATE) < CAST('{midpoint_str}' AS DATE)"] + filters
        prev_where = "WHERE " + " AND ".join(prev_filters)

        def run_aggregates(where_clause: str) -> tuple[float, float, float, float]:
            """Compute aggregate sums for marketing metrics."""
            clicks_sql = f"SUM({clicks_col})" if clicks_col else "SUM({conversions_col}) * 10"
            rev_sql = f"SUM({revenue_col})" if revenue_col else "SUM({spend_col}) * 1.5"

            q = (
                f"SELECT "
                f"  COALESCE(SUM({spend_col}), 0.0), "
                f"  COALESCE(SUM({conversions_col}), 0.0), "
                f"  COALESCE({clicks_sql}, 0.0), "
                f"  COALESCE({rev_sql}, 0.0) "
                f"FROM '{file_path}' {where_clause}"
            )
            res = execute_duckdb_query(q, params)
            return float(res[0][0]), float(res[0][1]), float(res[0][2]), float(res[0][3])

        c_spend, c_conv, c_click, c_rev = run_aggregates(curr_where)
        p_spend, p_conv, p_click, p_rev = run_aggregates(prev_where)

        # KPI formulas
        c_conv_rate = (c_conv / c_click * 100) if c_click > 0 else 0.0
        p_conv_rate = (p_conv / p_click * 100) if p_click > 0 else 0.0

        c_cac = (c_spend / c_conv) if c_conv > 0 else 0.0
        p_cac = (p_spend / p_conv) if p_conv > 0 else 0.0

        c_roas = (c_rev / c_spend) if c_spend > 0 else 0.0
        p_roas = (p_rev / p_spend) if p_spend > 0 else 0.0

        kpis = {
            "spend": get_marketing_kpi(c_spend, p_spend, "Campaign Spend", "Total marketing ad expenditure across active channels."),
            "conversion_rate": get_marketing_kpi(c_conv_rate, p_conv_rate, "Conversion Rate", "Percentage of clicks that resulted in a conversion action."),
            "cac": get_marketing_kpi(c_cac, p_cac, "Customer Acquisition Cost", "Average marketing spend required to acquire a single customer."),
            "roas": get_marketing_kpi(c_roas, p_roas, "Return on Ad Spend", "Gross revenue generated for every dollar spent on advertising."),
        }

        # Trend over time (daily/weekly/monthly rollup)
        trend_query = (
            f"SELECT "
            f"  strftime('%Y-%m-%d', CAST({date_col} AS DATE)) as date, "
            f"  COALESCE(SUM({spend_col}), 0.0) as spend, "
            f"  COALESCE(SUM({conversions_col}), 0.0) as conversions "
            f"FROM '{file_path}' "
            f"{where_clause} "
            f"GROUP BY date "
            f"ORDER BY date"
        )
        trend_res = execute_duckdb_query(trend_query, params)
        trend = [{"date": r[0], "spend": r[1], "conversions": r[2]} for r in trend_res]

        # Top Converting Campaigns
        campaign_query = (
            f"SELECT "
            f"  {campaign_col} as campaign, "
            f"  COALESCE(SUM({spend_col}), 0.0) as spend, "
            f"  COALESCE(SUM({conversions_col}), 0.0) as conversions "
            f"FROM '{file_path}' "
            f"{where_clause} "
            f"GROUP BY campaign "
            f"ORDER BY conversions DESC "
            f"LIMIT 10"
        )
        campaign_res = execute_duckdb_query(campaign_query, params)
        campaigns = [{"campaign": r[0], "spend": r[1], "conversions": r[2]} for r in campaign_res]

        return {
            "kpis": kpis,
            "trend": trend,
            "campaigns": campaigns,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query marketing database: {exc}",
        )


@router.post(
    "/{dataset_id}/segmentation",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Train K-Means customer segmentation model",
)
def train_segmentation_model(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Trigger background K-Means clustering run on mapped customer attributes."""
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

    task = train_segmentation_model_task.delay(str(dataset_id))
    return {"task_id": task.id, "status": "processing"}


@router.get(
    "/{dataset_id}/segmentation/latest",
    summary="Fetch the latest trained segmentation profiles",
)
def get_latest_segmentation(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Retrieve silhouette scores, cluster profiles, and assignments from the latest model run."""
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

    model_run = (
        db.query(ModelVersion)
        .filter(
            ModelVersion.dataset_id == dataset_id,
            ModelVersion.version_id.like("seg_v_%"),
        )
        .order_by(ModelVersion.created_at.desc())
        .first()
    )

    if not model_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No segmentation model has been trained for this dataset yet.",
        )

    return {
        "model_version": model_run.version_id,
        "trained_at": model_run.created_at.isoformat(),
        "metrics": model_run.metrics,
    }
