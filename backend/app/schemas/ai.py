"""AI assistant request and response schemas."""

from typing import Any
from pydantic import BaseModel


class ExplainChartRequest(BaseModel):
    """Payload containing chart metadata and values to explain."""

    chart_type: str
    chart_data: Any


class ExplainChartResponse(BaseModel):
    """Plain-language AI interpretation of the specified chart."""

    explanation: str


class SummarizeDashboardRequest(BaseModel):
    """Payload containing complete dashboard parameters."""

    kpis: dict[str, Any]
    trend: list[dict[str, Any]]
    categories: list[dict[str, Any]]
    regions: list[dict[str, Any]]


class SummarizeDashboardResponse(BaseModel):
    """Executive narrative summary explaining dashboard highlights."""

    summary: str
