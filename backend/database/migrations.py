from sqlalchemy import text

from database.connection import engine


async def run_compatibility_migrations() -> None:
    """Apply small idempotent schema updates for existing installations."""
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_version INTEGER NOT NULL DEFAULT 0",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email) WHERE email IS NOT NULL",
    ]

    async with engine.begin() as connection:
        for statement in statements:
            await connection.execute(text(statement))
