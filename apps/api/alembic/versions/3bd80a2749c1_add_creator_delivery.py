"""Persist private creator delivery data."""
from alembic import op
import sqlalchemy as sa

revision = "3bd80a2749c1"
down_revision = "7e70d435ad12"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "creator_delivery",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("kind", sa.String(20), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
    )


def downgrade():
    op.drop_table("creator_delivery")
