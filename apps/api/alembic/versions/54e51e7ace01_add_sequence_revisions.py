"""Add sequence snapshots and soundtrack source identity."""
from alembic import op
import sqlalchemy as sa

revision = "54e51e7ace01"
down_revision = "8c7b2e14f9ad"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("video_sequence_soundtracks", sa.Column("source_token", sa.String(32), nullable=True))
    op.create_table(
        "video_sequence_revisions",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("video_sequences.project_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("version", sa.Integer(), primary_key=True),
        sa.Column("snapshot", sa.JSON(), nullable=False),
    )


def downgrade():
    op.drop_table("video_sequence_revisions")
    op.drop_column("video_sequence_soundtracks", "source_token")
