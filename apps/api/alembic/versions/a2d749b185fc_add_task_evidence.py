"""Add evidence references to refinement tasks."""

from alembic import op
import sqlalchemy as sa

revision = "a2d749b185fc"
down_revision = "f1c638a074eb"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "refinement_tasks",
        sa.Column(
            "evidence", sa.JSON(), nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade():
    op.drop_column("refinement_tasks", "evidence")
