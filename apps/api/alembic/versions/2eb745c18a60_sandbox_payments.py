"""Create the Paystack test checkout journal."""
from alembic import op
import sqlalchemy as sa

revision = "2eb745c18a60"
down_revision = "d45be13ac018"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('sandbox_payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reference', sa.String(length=48), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('attempt', sa.String(length=36), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('product', sa.String(length=40), nullable=False),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('amount_kobo', sa.Integer(), nullable=False),
        sa.Column('credits', sa.Integer(), nullable=False),
        sa.Column('plan', sa.String(length=16), nullable=True),
        sa.Column('period', sa.String(length=12), nullable=True),
        sa.Column('state', sa.String(length=20), nullable=False),
        sa.Column('checkout_url', sa.String(length=512), nullable=True),
        sa.Column('provider_id', sa.BigInteger(), nullable=True),
        sa.Column('last_checked_at', sa.DateTime(), nullable=True),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint('amount_kobo > 0 AND credits >= 0', name='ck_sandbox_payment_quote'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider_id'),
        sa.UniqueConstraint('reference'),
        sa.UniqueConstraint('user_id', 'attempt', name='uq_sandbox_payment_attempt')
    )
    op.create_table('sandbox_payment_audit',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('payment_id', sa.Integer(), nullable=False),
        sa.Column('event', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['payment_id'], ['sandbox_payments.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sandbox_payment_audit_payment_id'), 'sandbox_payment_audit', ['payment_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_sandbox_payment_audit_payment_id'), table_name='sandbox_payment_audit')
    op.drop_table('sandbox_payment_audit')
    op.drop_table('sandbox_payments')
