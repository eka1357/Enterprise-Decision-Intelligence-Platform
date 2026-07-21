"""Add column_mapping to datasets.

Revision ID: 003_add_column_mapping
Revises: 002_data_pipeline_columns
Create Date: 2026-07-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003_add_column_mapping"
down_revision: Union[str, None] = "002_data_pipeline_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add column_mapping to datasets."""
    op.add_column(
        "datasets",
        sa.Column("column_mapping", sa.JSON(), nullable=True)
    )


def downgrade() -> None:
    """Remove column_mapping from datasets."""
    op.drop_column("datasets", "column_mapping")
