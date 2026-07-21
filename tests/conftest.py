"""Test configuration and fixtures for the EDIP backend test suite."""

import os
import sys
import uuid

# Ensure the backend package is importable from the project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

# Use SQLite in-memory for tests — avoids needing a running Postgres
SQLALCHEMY_TEST_DATABASE_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def _setup_db():
    """Create all tables before each test and drop them after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    """Yield a test database session."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    """Yield a FastAPI TestClient with the test database injected."""
    def _override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def registered_user(client: TestClient) -> dict:
    """Register a test user and return the registration data.

    Returns:
        dict with keys: email, password, full_name, and the response data.
    """
    user_data = {
        "email": f"test-{uuid.uuid4().hex[:8]}@example.com",
        "password": "SecurePass123!",
        "full_name": "Test User",
    }
    response = client.post("/api/v1/auth/register", json=user_data)
    assert response.status_code == 201
    user_data["response"] = response.json()
    return user_data


@pytest.fixture()
def auth_headers(client: TestClient, registered_user: dict) -> dict:
    """Log in the test user and return authorization headers.

    Returns:
        dict with the Authorization header for authenticated requests.
    """
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": registered_user["email"],
            "password": registered_user["password"],
        },
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def sample_csv(tmp_path) -> str:
    """Create a sample CSV file and return its path."""
    csv_content = "name,age,city,salary\nAlice,30,New York,85000\nBob,25,London,72000\nCharlie,35,Tokyo,95000\n"
    csv_file = tmp_path / "test_data.csv"
    csv_file.write_text(csv_content)
    return str(csv_file)
