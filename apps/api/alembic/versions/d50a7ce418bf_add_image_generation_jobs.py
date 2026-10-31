"""Add saved image generation requests."""

from alembic import op
import sqlalchemy as sa

revision = "d50a7ce418bf"
down_revision = "c4f96bd307ae"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "image_generation_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "project_id", sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(150), nullable=False),
        sa.Column("purpose", sa.String(30), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(100), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_image_generation_jobs_project_id",
        "image_generation_jobs", ["project_id"],
    )


def downgrade():
    op.drop_index(
        "ix_image_generation_jobs_project_id",
        table_name="image_generation_jobs",
    )
    op.drop_table("image_generation_jobs")
