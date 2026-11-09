"""Add invite-only beta registration and per-account access."""

from alembic import op
import sqlalchemy as sa

revision = "86db3e0928a1"
down_revision = "3bd80a2749c1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "beta_invites",
        sa.Column("digest", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("redeemed_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "beta_access",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("granted_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table("beta_access")
    op.drop_table("beta_invites")
