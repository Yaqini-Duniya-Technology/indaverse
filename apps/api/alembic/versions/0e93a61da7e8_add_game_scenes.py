"""Add saved 3D game scenes."""

from alembic import op
import sqlalchemy as sa


revision = "0e93a61da7e8"
down_revision = "fd82f50c96d7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "game_scenes",
        sa.Column(
            "project_id", sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("layout", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("game_scenes")
