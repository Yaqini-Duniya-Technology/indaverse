"""Add private, versioned video sequences and bounded source storage."""
from alembic import op
import sqlalchemy as sa

revision = "60739eacde21"
down_revision = "41c8a9f52d16"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "video_sequences",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("clips", sa.JSON(), nullable=False),
    )
    op.create_table(
        "video_sequence_sources",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("video_sequences.project_id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
    )
    op.create_index("ix_video_sequence_sources_project_id", "video_sequence_sources", ["project_id"])


def downgrade():
    op.drop_table("video_sequence_sources")
    op.drop_table("video_sequences")
