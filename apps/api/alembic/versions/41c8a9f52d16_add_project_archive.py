"""Add a reversible archive marker to creative projects."""
from alembic import op
import sqlalchemy as sa

revision = "41c8a9f52d16"
down_revision = "0e93a61da7e8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("archived_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("projects", "archived_at")
