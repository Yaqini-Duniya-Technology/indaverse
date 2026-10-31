"""Add saved video revision history."""

from alembic import op
import sqlalchemy as sa


revision = "b94eb1c852f3"
down_revision = "a83da0b741e2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "video_revisions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "version", name="uq_video_revision_project_version"),
    )
    op.create_index("ix_video_revisions_project_id", "video_revisions", ["project_id"])


def downgrade():
    op.drop_index("ix_video_revisions_project_id", table_name="video_revisions")
    op.drop_table("video_revisions")
