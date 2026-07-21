"""Dataset routes for file upload and listing."""

from fastapi import APIRouter, Depends, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
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
