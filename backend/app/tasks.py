"""Celery background tasks for async data processing."""

import logging
import os
import sys

# Ensure the root of the project is in python path so we can import etl module
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from app.celery_app import celery
from app.database import SessionLocal
from app.models.dataset import Dataset
from etl.pipeline import run_pipeline

logger = logging.getLogger(__name__)


@celery.task(name="app.tasks.process_dataset_task")
def process_dataset_task(dataset_id: str) -> str:
    """Asynchronously process an uploaded dataset.

    - Infer schema and validate via Pandera
    - Profile columns (missing, unique, outliers)
    - Check for schema drift compared to previous uploads of same name
    - Clean columns and values, save cleaned copy
    """
    logger.info("Starting background processing for dataset ID: %s", dataset_id)
    db = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            logger.error("Dataset not found: %s", dataset_id)
            return f"Error: Dataset {dataset_id} not found"

        dataset.status = "processing"
        db.commit()

        # Check for previous schema of same file name to detect schema drift
        previous_completed = (
            db.query(Dataset)
            .filter(
                Dataset.user_id == dataset.user_id,
                Dataset.original_filename == dataset.original_filename,
                Dataset.status == "ready",
                Dataset.id != dataset.id,
            )
            .order_by(Dataset.created_at.desc())
            .first()
        )

        previous_schema = None
        if previous_completed and previous_completed.profile_report:
            prev_profile = previous_completed.profile_report
            # Convert dictionary mapping of columns to the list format expected
            if "columns" in prev_profile:
                previous_schema = [
                    {"name": col_name, "dtype": col_data.get("type", "text")}
                    for col_name, col_data in prev_profile["columns"].items()
                ]

        # Execute ETL pipeline
        logger.info("Executing ETL pipeline on file: %s", dataset.file_path)
        report = run_pipeline(dataset.file_path, previous_schema=previous_schema)

        # Update DB record with results
        dataset.status = "ready"
        dataset.profile_report = report
        dataset.cleaned_file_path = report.get("cleaned_file_path")
        dataset.row_count = report["summary"]["total_rows"]
        dataset.column_count = report["summary"]["total_columns"]
        
        # Format columns metadata for backward compatibility with phase 1 view
        cols_meta = []
        for col_name, col_data in report.get("columns", {}).items():
            cols_meta.append({"name": col_name, "dtype": col_data.get("type", "text")})
        dataset.columns_metadata = cols_meta

        db.commit()
        logger.info("Successfully processed dataset: %s", dataset.original_filename)
        return f"Success: Processed dataset {dataset_id}"

    except Exception as exc:
        db.rollback()
        logger.exception("Failed to process dataset %s", dataset_id)
        # Update dataset status to failed
        try:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
            if dataset:
                dataset.status = "failed"
                db.commit()
        except Exception:
            logger.exception("Failed to mark dataset as failed in DB")
        return f"Failure: {exc}"
    finally:
        db.close()
