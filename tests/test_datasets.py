"""Tests for dataset endpoints."""

from fastapi.testclient import TestClient


class TestUpload:
    """Tests for POST /api/v1/datasets/upload."""

    def test_upload_csv_success(
        self, client: TestClient, auth_headers: dict, sample_csv: str
    ) -> None:
        """Uploading a valid CSV returns 201 with correct metadata."""
        with open(sample_csv, "rb") as f:
            response = client.post(
                "/api/v1/datasets/upload",
                files={"file": ("test_data.csv", f, "text/csv")},
                headers=auth_headers,
            )

        assert response.status_code == 201
        data = response.json()
        assert data["original_filename"] == "test_data.csv"
        assert data["row_count"] == 3
        assert data["column_count"] == 4
        assert data["status"] == "pending"
        assert "id" in data
        assert data["file_size_bytes"] > 0

        # Verify columns metadata
        col_names = [c["name"] for c in data["columns_metadata"]]
        assert "name" in col_names
        assert "age" in col_names
        assert "city" in col_names
        assert "salary" in col_names

    def test_upload_without_auth(self, client: TestClient, sample_csv: str) -> None:
        """Uploading without authentication returns 403."""
        with open(sample_csv, "rb") as f:
            response = client.post(
                "/api/v1/datasets/upload",
                files={"file": ("test_data.csv", f, "text/csv")},
            )

        assert response.status_code == 403

    def test_upload_non_csv(self, client: TestClient, auth_headers: dict) -> None:
        """Uploading a non-CSV file returns 400."""
        response = client.post(
            "/api/v1/datasets/upload",
            files={"file": ("data.txt", b"not a csv", "text/plain")},
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "csv" in response.json()["detail"].lower()


class TestListDatasets:
    """Tests for GET /api/v1/datasets."""

    def test_list_datasets_returns_uploaded(
        self, client: TestClient, auth_headers: dict, sample_csv: str
    ) -> None:
        """After uploading, the dataset appears in the list."""
        # Upload a file first
        with open(sample_csv, "rb") as f:
            client.post(
                "/api/v1/datasets/upload",
                files={"file": ("test_data.csv", f, "text/csv")},
                headers=auth_headers,
            )

        # List datasets
        response = client.get("/api/v1/datasets", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["original_filename"] == "test_data.csv"
        assert data[0]["row_count"] == 3
