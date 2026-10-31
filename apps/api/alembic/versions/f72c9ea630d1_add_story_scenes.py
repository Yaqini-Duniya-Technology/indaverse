"""Add independently versioned story scene plans."""

from alembic import op
import sqlalchemy as sa

revision = "f72c9ea630d1"
down_revision = "e61b8df529c0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "story_scenes",
        sa.Column(
            "project_id", sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("scenes", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("story_scenes")
