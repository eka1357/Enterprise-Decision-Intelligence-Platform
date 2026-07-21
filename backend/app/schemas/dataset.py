"""Dataset request and response schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DatasetResponse(BaseModel):
    """Schema for dataset data in responses."""

    id: uuid.UUID
    original_filename: str
    file_size_bytes: int
    row_count: int | None = None
    column_count: int | None = None
    columns_metadata: list[dict[str, Any]] | None = None
    status: str
    cleaned_file_path: str | None = None
    profile_report: dict[str, Any] | None = None
    column_mapping: dict[str, str] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ColumnMappingRequest(BaseModel):
    """Request schema for defining dataset column mappings for modules."""

    date_col: str
    revenue_col: str
    quantity_col: str
    category_col: str
    region_col: str
    customer_col: str | None = None

