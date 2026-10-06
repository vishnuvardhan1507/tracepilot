"""Initial project records and versioned spans."""

from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "records",
        sa.Column("id", sa.String(160), primary_key=True),
        sa.Column("project", sa.String(80), nullable=False, index=True),
        sa.Column("kind", sa.String(40), nullable=False, index=True),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    op.create_table(
        "spans",
        sa.Column("id", sa.String(200), primary_key=True),
        sa.Column("project", sa.String(80), nullable=False, index=True),
        sa.Column("trace_id", sa.String(80), nullable=False, index=True),
        sa.Column("span_id", sa.String(80), nullable=False),
        sa.Column("parent_span_id", sa.String(80)),
        sa.Column("start", sa.String(40), nullable=False, index=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.UniqueConstraint("project", "span_id"),
    )


def downgrade():
    op.drop_table("spans")
    op.drop_table("records")
