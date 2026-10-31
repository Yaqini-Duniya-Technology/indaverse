"""Add project image assets and versioned cover selection."""

from alembic import op
import sqlalchemy as sa

revision = "c4f96bd307ae"
down_revision = "b3e85ac296fd"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "image_assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(150), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("stored_filename", sa.String(100), nullable=False, unique=True),
        sa.Column("mime_type", sa.String(50), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_image_assets_project_id", "image_assets", ["project_id"])
    # Cover references are checked against the project in the API.
    op.add_column("projects", sa.Column("cover_image_id", sa.Integer(), nullable=True))
    op.add_column("projects", sa.Column(
        "cover_version", sa.Integer(), nullable=False, server_default="0",
    ))


def downgrade():
    op.drop_column("projects", "cover_version")
    op.drop_column("projects", "cover_image_id")
    op.drop_index("ix_image_assets_project_id", table_name="image_assets")
    op.drop_table("image_assets")
