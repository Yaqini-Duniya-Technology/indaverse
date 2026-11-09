"""Create credit wallets, ledger, reservations and download counters."""
from alembic import op
import sqlalchemy as sa

revision = "d45be13ac018"
down_revision = "86db3e0928a1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('credit_accounts',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('revision', sa.BigInteger(), nullable=False),
        sa.Column('plan_key', sa.String(length=16), nullable=False),
        sa.Column('period', sa.String(length=12), nullable=True),
        sa.Column('period_end', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id')
    )
    op.create_table('credit_lots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('reference', sa.String(length=128), nullable=False),
        sa.Column('source', sa.String(length=16), nullable=False),
        sa.Column('amount', sa.BigInteger(), nullable=False),
        sa.Column('remaining', sa.BigInteger(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint('remaining >= 0 AND remaining <= amount AND amount > 0', name='ck_credit_lot_balance'),
        sa.ForeignKeyConstraint(['user_id'], ['credit_accounts.user_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'reference', name='uq_credit_lot_reference')
    )
    op.create_table('credit_reservations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('reference', sa.String(length=128), nullable=False),
        sa.Column('action', sa.String(length=40), nullable=False),
        sa.Column('amount', sa.BigInteger(), nullable=False),
        sa.Column('charged', sa.BigInteger(), nullable=True),
        sa.Column('status', sa.String(length=12), nullable=False),
        sa.Column('allocations', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['credit_accounts.user_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'reference', name='uq_credit_reservation_reference')
    )
    op.create_table('credit_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('reference', sa.String(length=128), nullable=False),
        sa.Column('available_delta', sa.BigInteger(), nullable=False),
        sa.Column('reserved_delta', sa.BigInteger(), nullable=False),
        sa.Column('details', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['credit_accounts.user_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('credit_download_usage',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('month', sa.String(length=7), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['credit_accounts.user_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'month')
    )
    op.create_index(op.f('ix_credit_entries_user_id'), 'credit_entries', ['user_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_credit_entries_user_id'), table_name='credit_entries')
    op.drop_table('credit_download_usage')
    op.drop_table('credit_entries')
    op.drop_table('credit_reservations')
    op.drop_table('credit_lots')
    op.drop_table('credit_accounts')
