"""Add pipeline columns to datasets table.

Revision ID: 002_data_pipeline_columns
Revises: 001_initial_schema
Create Date: 2026-07-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "002_data_pipeline_columns"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add cleaned_file_path and profile_report to datasets, alter status default."""
    op.add_column(
        "datasets",
        sa.Column("cleaned_file_path", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "datasets",
        sa.Column("profile_report", sa.JSON(), nullable=True)
    )
    # Alter default status from 'uploaded' to 'pending'
    op.alter_column(
        "datasets",
        "status",
        server_default="pending"
    )


def downgrade() -> None:
    """Remove columns and restore status default."""
    op.alter_column(
        "datasets",
        "status",
        server_default="uploaded"
    )
    op.drop_column("datasets", "profile_report")
    op.drop_column("datasets", "cleaned_file_path")
