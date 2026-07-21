import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetResponse
from app.services.dataset import list_user_datasets, upload_dataset

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post(
    "/upload",
    response_model=DatasetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a CSV dataset",
)
async def upload(
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DatasetResponse:
    """Upload a CSV file for processing.

    The file is stored on disk and metadata (row count, columns, etc.)
    is extracted and saved to the database.
    """
    dataset = await upload_dataset(db, file, current_user)
    return DatasetResponse.model_validate(dataset)


@router.get(
    "",
    response_model=list[DatasetResponse],
    summary="List uploaded datasets",
)
def list_datasets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DatasetResponse]:
    """Retrieve all datasets uploaded by the authenticated user.

    Results are ordered by upload date, most recent first.
    """
    datasets = list_user_datasets(db, current_user)
    return [DatasetResponse.model_validate(d) for d in datasets]


@router.get(
    "/{dataset_id}",
    response_model=DatasetResponse,
    summary="Get single dataset details",
)
def get_dataset(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DatasetResponse:
    """Retrieve detailed info for a specific dataset."""
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
    return DatasetResponse.model_validate(dataset)


@router.get(
    "/{dataset_id}/profile",
    summary="Get data quality profile report",
)
def get_dataset_profile(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Retrieve the generated data quality profile report for a dataset."""
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

    if dataset.status == "pending" or dataset.status == "processing":
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail={"status": dataset.status, "message": "Dataset is still being processed."},
        )

    if dataset.status == "failed":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dataset processing failed.",
        )

    if not dataset.profile_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile report not found",
        )

    return dataset.profile_report

