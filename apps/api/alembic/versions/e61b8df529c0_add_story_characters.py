"""Add independently versioned story character profiles."""

from alembic import op
import sqlalchemy as sa

revision = "e61b8df529c0"
down_revision = "d50a7ce418bf"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "story_characters",
        sa.Column(
            "project_id", sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("characters", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("story_characters")
