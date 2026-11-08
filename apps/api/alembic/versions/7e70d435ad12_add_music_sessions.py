"""Store non-destructive Music Studio sessions."""
from alembic import op
import sqlalchemy as sa

revision = "7e70d435ad12"
down_revision = "54e51e7ace01"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "music_sessions",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
    )


def downgrade():
    op.drop_table("music_sessions")
