"""Tests for authentication endpoints."""

from fastapi.testclient import TestClient


class TestRegister:
    """Tests for POST /api/v1/auth/register."""

    def test_register_success(self, client: TestClient) -> None:
        """A valid registration returns 201 with user data."""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "SecurePass1!",
                "full_name": "New User",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["full_name"] == "New User"
        assert "id" in data
        assert "created_at" in data
        # Password should never be in the response
        assert "password" not in data
        assert "password_hash" not in data

    def test_register_duplicate_email(self, client: TestClient) -> None:
        """Registering with an already-used email returns 409."""
        user_data = {
            "email": "duplicate@example.com",
            "password": "SecurePass1!",
            "full_name": "First User",
        }
        # First registration succeeds
        response1 = client.post("/api/v1/auth/register", json=user_data)
        assert response1.status_code == 201

        # Second registration with same email fails
        response2 = client.post("/api/v1/auth/register", json=user_data)
        assert response2.status_code == 409
        assert "already registered" in response2.json()["detail"].lower()


class TestLogin:
    """Tests for POST /api/v1/auth/login."""

    def test_login_success(self, client: TestClient, registered_user: dict) -> None:
        """A valid login returns 200 with an access token."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": registered_user["email"],
                "password": registered_user["password"],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert len(data["access_token"]) > 20  # JWT has meaningful length

    def test_login_wrong_password(self, client: TestClient, registered_user: dict) -> None:
        """Logging in with a wrong password returns 401."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": registered_user["email"],
                "password": "WrongPassword!",
            },
        )
        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower()
