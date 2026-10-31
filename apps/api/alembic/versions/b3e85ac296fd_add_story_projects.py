"""Add saved story projects and ordered chapter drafts."""

from alembic import op
import sqlalchemy as sa

revision = "b3e85ac296fd"
down_revision = "a2d749b185fc"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "story_projects",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("synopsis", sa.Text(), nullable=False),
        sa.Column("genre", sa.String(100), nullable=False),
        sa.Column("chapters", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
    )


def downgrade():
    op.drop_table("story_projects")
