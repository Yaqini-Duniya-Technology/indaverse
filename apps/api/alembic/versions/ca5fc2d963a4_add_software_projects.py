"""Add saved website and app blueprints."""

from alembic import op
import sqlalchemy as sa

revision = "ca5fc2d963a4"
down_revision = "b94eb1c852f3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "software_projects",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("pages", sa.JSON(), nullable=False),
        sa.Column("features", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
    )


def downgrade():
    op.drop_table("software_projects")
