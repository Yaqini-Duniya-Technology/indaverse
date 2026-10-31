"""create music generation jobs table

Revision ID: 0924d00cd3dc
Revises: 918a7b6a5f9d
Create Date: 2026-09-08 22:38:40.220081

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0924d00cd3dc"
down_revision: Union[str, Sequence[str], None] = "918a7b6a5f9d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "music_generation_jobs",
        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            autoincrement=True,
        ),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey(
                "projects.id",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey(
                "users.id",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column(
            "provider",
            sa.String(length=100),
            nullable=False,
        ),
        sa.Column(
            "provider_job_id",
            sa.String(length=255),
            nullable=True,
        ),
        sa.Column(
            "prompt",
            sa.Text(),
            nullable=False,
        ),
        sa.Column(
            "output_type",
            sa.String(length=50),
            nullable=False,
        ),
        sa.Column(
            "language",
            sa.String(length=50),
            nullable=False,
        ),
        sa.Column(
            "genre",
            sa.String(length=100),
            nullable=True,
        ),
        sa.Column(
            "mood",
            sa.String(length=100),
            nullable=True,
        ),
        sa.Column(
            "bpm",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(length=50),
            nullable=False,
        ),
        sa.Column(
            "audio_url",
            sa.String(length=500),
            nullable=True,
        ),
        sa.Column(
            "duration_seconds",
            sa.Float(),
            nullable=True,
        ),
        sa.Column(
            "title",
            sa.String(length=150),
            nullable=True,
        ),
        sa.Column(
            "error_message",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_index(
        "ix_music_generation_jobs_project_id",
        "music_generation_jobs",
        ["project_id"],
    )

    op.create_index(
        "ix_music_generation_jobs_user_id",
        "music_generation_jobs",
        ["user_id"],
    )

    op.create_index(
        "ix_music_generation_jobs_provider_job_id",
        "music_generation_jobs",
        ["provider_job_id"],
    )

    op.create_index(
        "ix_music_generation_jobs_status",
        "music_generation_jobs",
        ["status"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_music_generation_jobs_status",
        table_name="music_generation_jobs",
    )

    op.drop_index(
        "ix_music_generation_jobs_provider_job_id",
        table_name="music_generation_jobs",
    )

    op.drop_index(
        "ix_music_generation_jobs_user_id",
        table_name="music_generation_jobs",
    )

    op.drop_index(
        "ix_music_generation_jobs_project_id",
        table_name="music_generation_jobs",
    )

    op.drop_table("music_generation_jobs")