"""Authentication service handling user registration and login."""

import logging

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.auth import UserRegister
from app.utils.security import create_access_token, hash_password, verify_password

logger = logging.getLogger(__name__)


def register_user(db: Session, data: UserRegister) -> User:
    """Register a new user account.

    Args:
        db: The database session.
        data: Registration data containing email, password, and full name.

    Returns:
        The newly created User instance.

    Raises:
        HTTPException: 409 if the email is already registered.
    """
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info("User registered: %s", user.email)
    return user


def authenticate_user(db: Session, email: str, password: str) -> str:
    """Authenticate a user and return a JWT access token.

    Args:
        db: The database session.
        email: The user's email address.
        password: The plaintext password to verify.

    Returns:
        A signed JWT access token string.

    Raises:
        HTTPException: 401 if credentials are invalid.
    """
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(subject=str(user.id))
    logger.info("User authenticated: %s", user.email)
    return token
