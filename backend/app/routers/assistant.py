"""AI Assistant endpoints for charts explanations and executive summaries."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.dataset import Dataset
from app.models.user import User
from app.schemas.ai import (
    ExplainChartRequest,
    ExplainChartResponse,
    SummarizeDashboardRequest,
    SummarizeDashboardResponse,
)
from app.services.assistant import explain_chart_service, summarize_dashboard_service

router = APIRouter(prefix="/datasets", tags=["AI Assistant"])


@router.post(
    "/{dataset_id}/assistant/explain-chart",
    response_model=ExplainChartResponse,
    summary="Explain a specific chart's data context",
)
async def explain_chart(
    dataset_id: uuid.UUID,
    payload: ExplainChartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExplainChartResponse:
    """Propose business explanation for a chart grounded strictly in the provided values."""
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

    explanation = await explain_chart_service(payload.chart_type, payload.chart_data)
    return ExplainChartResponse(explanation=explanation)


@router.post(
    "/{dataset_id}/assistant/summarize-dashboard",
    response_model=SummarizeDashboardResponse,
    summary="Generate executive summary paragraph of sales dashboard",
)
async def summarize_dashboard(
    dataset_id: uuid.UUID,
    payload: SummarizeDashboardRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SummarizeDashboardResponse:
    """Generate executive highlights report grounded strictly in the provided metric contexts."""
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

    summary = await summarize_dashboard_service(
        payload.kpis, payload.trend, payload.categories, payload.regions
    )
    return SummarizeDashboardResponse(summary=summary)
