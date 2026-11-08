"""Add one private soundtrack per saved video sequence."""
from alembic import op
import sqlalchemy as sa

revision = "8c7b2e14f9ad"
down_revision = "60739eacde21"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "video_sequence_soundtracks",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("video_sequences.project_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("format", sa.String(3), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
    )


def downgrade():
    op.drop_table("video_sequence_soundtracks")
