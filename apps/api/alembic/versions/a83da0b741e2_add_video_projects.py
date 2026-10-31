"""Add saved video scripts and ordered shot plans."""

from alembic import op
import sqlalchemy as sa


revision = "a83da0b741e2"
down_revision = "f72c9ea630d1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "video_projects",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("script", sa.Text(), nullable=False),
        sa.Column("aspect_ratio", sa.String(10), nullable=False),
        sa.Column("shots", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
    )


def downgrade():
    op.drop_table("video_projects")
