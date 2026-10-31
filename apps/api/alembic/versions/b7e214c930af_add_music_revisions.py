"""Add saved music revisions."""

from alembic import op
import sqlalchemy as sa

revision = "b7e214c930af"
down_revision = "0924d00cd3dc"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "music_revisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "project_id", sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_music_revisions_project_id",
        "music_revisions", ["project_id"],
    )


def downgrade():
    op.drop_index(
        "ix_music_revisions_project_id", table_name="music_revisions",
    )
    op.drop_table("music_revisions")
