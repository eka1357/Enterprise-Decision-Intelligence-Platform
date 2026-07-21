"""Sales analytics API endpoints."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.dataset import Dataset
from app.models.user import User
from app.services.queries import get_sales_analytics

router = APIRouter(prefix="/analytics/sales", tags=["Sales Analytics"])


@router.get(
    "/{dataset_id}",
    summary="Compute sales metrics for a dataset",
)
def get_sales_metrics(
    dataset_id: uuid.UUID,
    start_date: str | None = None,
    end_date: str | None = None,
    granularity: str = "daily",
    category: str | None = None,
    region: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Retrieve filtered Sales KPIs, trends, categories, and regional metrics.

    Requires column mapping to have been configured first.
    """
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
            detail={
                "code": "MAPPING_REQUIRED",
                "message": "Column mapping required for this dataset before analytics can be run.",
            },
        )

    if dataset.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dataset is not processed and ready for queries.",
        )

    try:
        metrics = get_sales_analytics(
            file_path=dataset.file_path,
            mapping=dataset.column_mapping,
            start_date=start_date,
            end_date=end_date,
            granularity=granularity,
            category_filter=category,
            region_filter=region,
        )
        return metrics
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query data: {exc}",
        )
