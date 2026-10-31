"""Add saved project plans."""

from alembic import op
import sqlalchemy as sa

revision = "d9a416e852cf"
down_revision = "c8f305d741be"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "project_plans",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("brief_version", sa.Integer(), nullable=False),
        sa.Column("brief_snapshot", sa.JSON(), nullable=False),
        sa.Column("planner", sa.String(50), nullable=False),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
    )


def downgrade():
    op.drop_table("project_plans")
