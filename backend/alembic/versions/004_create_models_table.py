"""Create models table.

Revision ID: 004_create_models_table
Revises: 003_add_column_mapping
Create Date: 2026-07-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "004_create_models_table"
down_revision: Union[str, None] = "003_add_column_mapping"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create models table."""
    op.create_table(
        "models",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("dataset_id", sa.UUID(), nullable=False),
        sa.Column("version_id", sa.String(length=50), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_models_dataset_id"), "models", ["dataset_id"], unique=False)


def downgrade() -> None:
    """Drop models table."""
    op.drop_index(op.f("ix_models_dataset_id"), table_name="models")
    op.drop_table("models")
