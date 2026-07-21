"""Report request and status response schemas."""

from pydantic import BaseModel


class ReportExportRequest(BaseModel):
    """Payload carrying filtered dashboard view states to target in exports."""

    start_date: str | None = None
    end_date: str | None = None
    granularity: str = "daily"
    category: str | None = None
    region: str | None = None


class ReportStatusResponse(BaseModel):
    """Details status of an asynchronous report generation Celery job."""

    task_id: str
    status: str  # pending, processing, success, failed
    download_url: str | None = None
    error: str | None = None
