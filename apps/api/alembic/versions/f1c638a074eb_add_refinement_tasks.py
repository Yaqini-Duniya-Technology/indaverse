"""Add refinement tasks linked to saved human reviews."""

from alembic import op
import sqlalchemy as sa

revision = "f1c638a074eb"
down_revision = "e0b527f963da"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "refinement_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("review_id", sa.Integer(),
                  sa.ForeignKey("project_reviews.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(250), nullable=False),
        sa.Column("source_feedback", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("resolution", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("review_id", "source_number",
                            name="uq_refinement_review_source"),
    )
    op.create_index("ix_refinement_tasks_project_id", "refinement_tasks", ["project_id"])
    op.create_index("ix_refinement_tasks_review_id", "refinement_tasks", ["review_id"])


def downgrade():
    op.drop_index("ix_refinement_tasks_review_id", table_name="refinement_tasks")
    op.drop_index("ix_refinement_tasks_project_id", table_name="refinement_tasks")
    op.drop_table("refinement_tasks")
