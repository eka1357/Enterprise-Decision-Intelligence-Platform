"""Celery background tasks for async data processing."""

import logging
import os
import sys
import uuid

# Ensure the root of the project is in python path so we can import etl module
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from app.celery_app import celery
from app.database import SessionLocal
from app.models.dataset import Dataset
from app.models.model import ModelVersion
from etl.pipeline import run_pipeline
import joblib
from pathlib import Path
import pandas as pd
from ml.forecasting import prepare_time_series, train_and_evaluate

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
        db_id = uuid.UUID(dataset_id) if isinstance(dataset_id, str) else dataset_id
        dataset = db.query(Dataset).filter(Dataset.id == db_id).first()
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


@celery.task(name="app.tasks.train_forecast_model_task")
def train_forecast_model_task(dataset_id: str) -> str:
    """Asynchronously train and evaluate a sales forecasting model.

    - Loads clean CSV data using DuckDB/Pandas
    - Aggregates daily sales
    - Engineers time lags and rolling averages
    - Trains XGBoost and evaluates (MAE, RMSE, MAPE)
    - Saves trained model to storage/models/
    - Inserts a ModelVersion row in DB
    """
    logger.info("Starting background training for dataset ID: %s", dataset_id)
    db = SessionLocal()
    try:
        db_id = uuid.UUID(dataset_id) if isinstance(dataset_id, str) else dataset_id
        dataset = db.query(Dataset).filter(Dataset.id == db_id).first()
        if not dataset:
            logger.error("Dataset not found: %s", dataset_id)
            return f"Error: Dataset {dataset_id} not found"

        if not dataset.column_mapping:
            logger.error("Dataset has no column mapping: %s", dataset_id)
            return f"Error: Mapping required for dataset {dataset_id}"

        # 1. Read clean dataset
        # In this phase, we read the cleaned dataset. If not cleaned yet, fallback to raw.
        file_path = dataset.cleaned_file_path if dataset.cleaned_file_path else dataset.file_path
        if not os.path.exists(file_path):
            # Try raw file path
            file_path = dataset.file_path
            if not os.path.exists(file_path):
                return f"Error: CSV file not found on disk at {file_path}"

        df = pd.read_csv(file_path)

        # 2. Extract mapped columns
        mapping = dataset.column_mapping
        date_col = mapping["date_col"]
        # Standardize column naming if cleaned (our auto-cleaning standardizes names to snake_case)
        # Standardize column mapping keys to match cleaned columns if we standardized them
        # Let's search mapping values in df columns. If not present, try standardized key name.
        if date_col not in df.columns:
            # Try standardized name
            clean_date_col = date_col.strip().lower().replace(" ", "_")
            if clean_date_col in df.columns:
                date_col = clean_date_col

        rev_col = mapping["revenue_col"]
        if rev_col not in df.columns:
            clean_rev_col = rev_col.strip().lower().replace(" ", "_")
            if clean_rev_col in df.columns:
                rev_col = clean_rev_col

        df_daily = prepare_time_series(df, date_col, rev_col)

        if len(df_daily) < 10:
            return "Error: Time series must have at least 10 daily points to train a forecasting model."

        # 3. Train & Evaluate XGBoost
        model, metrics, std_error = train_and_evaluate(df_daily, date_col, rev_col)

        # 4. Save model artifact
        models_dir = Path(project_root) / "backend" / "storage" / "models"
        models_dir.mkdir(parents=True, exist_ok=True)

        version_uuid = uuid.uuid4()
        version_id = f"v_{version_uuid.hex[:8]}"
        model_filename = f"{dataset_id}_{version_id}.joblib"
        model_path = models_dir / model_filename

        # Save both model and std_error
        artifact = {"model": model, "std_error": std_error}
        joblib.dump(artifact, model_path)
        logger.info("Saved model artifact to %s", model_path)

        # 5. Insert model run into DB
        model_version = ModelVersion(
            id=version_uuid,
            dataset_id=dataset.id,
            version_id=version_id,
            file_path=str(model_path),
            metrics=metrics,
        )
        db.add(model_version)
        db.commit()

        logger.info("Successfully trained model version: %s", version_id)
        return f"Success: Trained model {version_id} with metrics {metrics}"

    except Exception as exc:
        db.rollback()
        logger.exception("Failed to train forecast model for dataset %s", dataset_id)
        return f"Failure: {exc}"
    finally:
        db.close()

