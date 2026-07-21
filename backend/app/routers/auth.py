"""Authentication routes for user registration and login."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.auth import TokenResponse, UserLogin, UserRegister, UserResponse
from app.services.auth import authenticate_user, register_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
def register(data: UserRegister, db: Session = Depends(get_db)) -> UserResponse:
    """Create a new user account.

    - **email**: Valid email address (must be unique)
    - **password**: Minimum 8 characters
    - **full_name**: User's display name
    """
    user = register_user(db, data)
    return UserResponse.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in and receive a JWT token",
)
def login(data: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    """Authenticate with email and password to receive a JWT access token.

    Include the token in subsequent requests as:
    `Authorization: Bearer <token>`
    """
    token = authenticate_user(db, data.email, data.password)
    return TokenResponse(access_token=token)
