"""Dataset service handling file upload and metadata extraction."""

import logging
import os
import uuid
from pathlib import Path

import pandas as pd
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.dataset import Dataset
from app.models.user import User

logger = logging.getLogger(__name__)


def _ensure_upload_dir() -> Path:
    """Create the upload directory if it does not exist.

    Returns:
        The Path object for the upload directory.
    """
    upload_path = Path(settings.UPLOAD_DIR)
    upload_path.mkdir(parents=True, exist_ok=True)
    return upload_path


def _extract_csv_metadata(file_path: str) -> dict:
    """Parse a CSV file and extract row count, column count, and column metadata.

    Args:
        file_path: Absolute path to the CSV file on disk.

    Returns:
        Dictionary with keys: row_count, column_count, columns_metadata.
    """
    try:
        df = pd.read_csv(file_path, nrows=0)
        column_count = len(df.columns)
        columns_metadata = [
            {"name": col, "dtype": str(dtype)}
            for col, dtype in zip(df.columns, df.dtypes, strict=False)
        ]

        row_count = sum(1 for _ in open(file_path, encoding="utf-8")) - 1  # noqa: SIM115
        row_count = max(row_count, 0)

        return {
            "row_count": row_count,
            "column_count": column_count,
            "columns_metadata": columns_metadata,
        }
    except Exception as exc:
        logger.warning("Failed to extract CSV metadata: %s", exc)
        return {
            "row_count": None,
            "column_count": None,
            "columns_metadata": None,
        }


async def upload_dataset(db: Session, file: UploadFile, user: User) -> Dataset:
    """Save an uploaded CSV file to disk and create a database record.

    Args:
        db: The database session.
        file: The uploaded file from the request.
        user: The authenticated user performing the upload.

    Returns:
        The newly created Dataset instance with metadata populated.

    Raises:
        HTTPException: 400 if the file is not a CSV.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are accepted",
        )

    upload_dir = _ensure_upload_dir()
    file_id = uuid.uuid4()
    safe_filename = f"{file_id}_{file.filename}"
    file_path = upload_dir / safe_filename

    content = await file.read()
    file_size = len(content)

    with open(file_path, "wb") as f:
        f.write(content)

    logger.info("File saved: %s (%d bytes)", file_path, file_size)

    metadata = _extract_csv_metadata(str(file_path))

    dataset = Dataset(
        id=file_id,
        user_id=user.id,
        filename=safe_filename,
        original_filename=file.filename,
        file_path=str(file_path),
        file_size_bytes=file_size,
        row_count=metadata["row_count"],
        column_count=metadata["column_count"],
        columns_metadata=metadata["columns_metadata"],
        status="pending",
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    logger.info("Dataset created: %s (id=%s)", dataset.original_filename, dataset.id)

    # Trigger Celery background task
    from app.tasks import process_dataset_task
    process_dataset_task.delay(str(dataset.id))
    logger.info("Triggered background profiling task for dataset ID: %s", dataset.id)

    return dataset


def list_user_datasets(db: Session, user: User) -> list[Dataset]:
    """Retrieve all datasets uploaded by a specific user.

    Args:
        db: The database session.
        user: The authenticated user whose datasets to list.

    Returns:
        A list of Dataset instances ordered by creation date descending.
    """
    return (
        db.query(Dataset)
        .filter(Dataset.user_id == user.id)
        .order_by(Dataset.created_at.desc())
        .all()
    )
