"""Add saved 2D and 3D game blueprints."""

from alembic import op
import sqlalchemy as sa

revision = "db60d3ea74b5"
down_revision = "ca5fc2d963a4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "game_projects",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("dimension", sa.String(2), nullable=False),
        sa.Column("genre", sa.String(100), nullable=False),
        sa.Column("concept", sa.Text(), nullable=False),
        sa.Column("core_loop", sa.Text(), nullable=False),
        sa.Column("controls", sa.Text(), nullable=False),
        sa.Column("characters", sa.JSON(), nullable=False),
        sa.Column("levels", sa.JSON(), nullable=False),
        sa.Column("assets", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
    )


def downgrade():
    op.drop_table("game_projects")
