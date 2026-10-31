"""Add saved human project reviews."""

from alembic import op
import sqlalchemy as sa

revision = "e0b527f963da"
down_revision = "d9a416e852cf"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "project_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_id", sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_version", sa.Integer(), nullable=False),
        sa.Column("brief_version", sa.Integer(), nullable=False),
        sa.Column("decision", sa.String(30), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("step_feedback", sa.JSON(), nullable=False),
        sa.Column("plan_snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_project_reviews_project_id", "project_reviews", ["project_id"],
    )


def downgrade():
    op.drop_index("ix_project_reviews_project_id", table_name="project_reviews")
    op.drop_table("project_reviews")
