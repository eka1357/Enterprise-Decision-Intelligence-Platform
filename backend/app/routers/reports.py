"""Reports export API endpoints for PDF, Excel, and CSV compilations."""

import os
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from celery.result import AsyncResult
import io
import csv

from app.database import get_db
from app.dependencies import get_current_user
from app.models.dataset import Dataset
from app.models.user import User
from app.schemas.reports import ReportExportRequest, ReportStatusResponse
from app.tasks import generate_pdf_report_task, generate_excel_report_task

router = APIRouter(prefix="/datasets", tags=["Reports"])


@router.post(
    "/{dataset_id}/reports/pdf",
    response_model=ReportStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger PDF report generation",
)
def export_pdf_report(
    dataset_id: uuid.UUID,
    payload: ReportExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Trigger background compilation of a formatted PDF summary report."""
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
            detail="Column mapping required before generating reports.",
        )

    task_id = str(uuid.uuid4())
    generate_pdf_report_task.apply_async(
        args=[
            task_id,
            str(dataset_id),
            payload.start_date,
            payload.end_date,
            payload.granularity,
            payload.category,
            payload.region,
        ],
        task_id=task_id,
    )
    return {"task_id": task_id, "status": "processing"}


@router.post(
    "/{dataset_id}/reports/excel",
    response_model=ReportStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger Excel spreadsheet generation",
)
def export_excel_report(
    dataset_id: uuid.UUID,
    payload: ReportExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Trigger background compilation of a styled multi-sheet Excel spreadsheet workbook."""
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
            detail="Column mapping required before generating reports.",
        )

    task_id = str(uuid.uuid4())
    generate_excel_report_task.apply_async(
        args=[
            task_id,
            str(dataset_id),
            payload.start_date,
            payload.end_date,
            payload.granularity,
            payload.category,
            payload.region,
        ],
        task_id=task_id,
    )
    return {"task_id": task_id, "status": "processing"}


@router.get(
    "/{dataset_id}/reports/csv",
    summary="Synchronous CSV data stream export",
)
def export_csv_report(
    dataset_id: uuid.UUID,
    start_date: str | None = None,
    end_date: str | None = None,
    granularity: str = "daily",
    category: str | None = None,
    region: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Stream a CSV file containing aggregated daily trend data matching active filters."""
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
            detail="Column mapping required before exporting data.",
        )

    try:
        from app.services.queries import get_sales_analytics
        file_path = dataset.cleaned_file_path if dataset.cleaned_file_path else dataset.file_path
        analytics = get_sales_analytics(
            file_path=file_path,
            mapping=dataset.column_mapping,
            start_date=start_date,
            end_date=end_date,
            granularity=granularity,
            category_filter=category,
            region_filter=region,
        )

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Date", "Revenue", "Units Quantity"])
        for row in analytics["trend"]:
            writer.writerow([row["date"], row["revenue"], row["quantity"]])

        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=sales_export_{dataset_id}.csv"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compile CSV stream: {exc}",
        )


@router.get(
    "/reports/status/{task_id}",
    response_model=ReportStatusResponse,
    summary="Query report compilation job status",
)
def get_report_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
) -> ReportStatusResponse:
    """Check task execution status of a background report compilation run."""
    result = AsyncResult(task_id)
    state = result.status.lower()

    # Normalize Celery status states
    if state == "pending":
        status_str = "pending"
    elif state == "started" or state == "retry":
        status_str = "processing"
    elif state == "success":
        status_str = "success"
    else:
        status_str = "failed"

    download_url = None
    error = None
    if status_str == "success":
        download_url = f"/api/v1/datasets/reports/download/{task_id}"
    elif status_str == "failed":
        error = str(result.result)

    return ReportStatusResponse(
        task_id=task_id,
        status=status_str,
        download_url=download_url,
        error=error,
    )


@router.get(
    "/reports/download/{task_id}",
    summary="Download compiled PDF/Excel reports",
)
def download_report(
    task_id: str,
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Serve completed PDF or Excel file exports from the server storage cache."""
    # Find matching file on disk
    # We look in the reports directory for either .pdf or .xlsx matching task_id
    reports_dir = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "reports")
    pdf_file = os.path.join(reports_dir, f"{task_id}.pdf")
    excel_file = os.path.join(reports_dir, f"{task_id}.xlsx")

    if os.path.exists(pdf_file):
        return FileResponse(
            pdf_file,
            media_type="application/pdf",
            filename=f"sales_performance_report_{task_id[:8]}.pdf",
        )
    elif os.path.exists(excel_file):
        return FileResponse(
            excel_file,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=f"sales_summary_workbook_{task_id[:8]}.xlsx",
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report file not found. It may have expired or failed compilation.",
        )
