"""Add saved playable game level settings."""

from alembic import op
import sqlalchemy as sa

revision = "fd82f50c96d7"
down_revision = "ec71e4fb85c6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "game_play_settings",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("layout", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
    )


def downgrade():
    op.drop_table("game_play_settings")
