"""Add persistent project creative briefs."""

from alembic import op
import sqlalchemy as sa

revision = "c8f305d741be"
down_revision = "b7e214c930af"
branch_labels = None
depends_on = None


def upgrade():
    for name in ("goal", "audience", "style", "constraints"):
        op.add_column("projects", sa.Column(f"brief_{name}", sa.Text(), nullable=True))
    op.add_column(
        "projects",
        sa.Column("brief_version", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade():
    op.drop_column("projects", "brief_version")
    for name in ("constraints", "style", "audience", "goal"):
        op.drop_column("projects", f"brief_{name}")
