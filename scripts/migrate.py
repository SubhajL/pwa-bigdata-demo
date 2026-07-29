"""Apply `infra/db/NNN_*.sql` in order, exactly once each.

Why this exists: compose mounts `001_init.sql` into the TimescaleDB entrypoint, and that
entrypoint only runs on an EMPTY data directory. Anyone who already brought the stack up
has a populated `tsdb-data` volume, so a newly added `002_*.sql` would never be applied —
they would run new code against the old schema and see confusing failures rather than a
clear error. Mounting the whole `db/` directory fixes fresh installs; this runner fixes
existing ones.

Idempotent by construction: applied filenames are recorded in `schema_migrations`, and the
migrations themselves are written with IF NOT EXISTS so a re-run is harmless either way.

    DATABASE_URL=postgresql://pwa:pwa@localhost:5433/pwa python scripts/migrate.py
"""
from __future__ import annotations

import os
import pathlib
import sys

import psycopg

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = ROOT / "infra" / "db"

CREATE_LEDGER = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""


def migration_files(directory: pathlib.Path = MIGRATIONS_DIR) -> list[pathlib.Path]:
    """Every `NNN_*.sql`, ordered by its numeric prefix."""
    return sorted(directory.glob("[0-9][0-9][0-9]_*.sql"), key=lambda p: p.name)


def applied(conn: psycopg.Connection[tuple[object, ...]]) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT filename FROM schema_migrations")
        return {row[0] for row in cur.fetchall()}


def apply_pending(conn: psycopg.Connection[tuple[object, ...]]) -> list[str]:
    """Apply every unapplied migration in order. Returns the filenames applied."""
    with conn.cursor() as cur:
        cur.execute(CREATE_LEDGER)
    conn.commit()

    done = applied(conn)
    newly: list[str] = []
    for path in migration_files():
        if path.name in done:
            continue
        with conn.cursor() as cur:
            cur.execute(path.read_text(encoding="utf-8"))
            cur.execute(
                "INSERT INTO schema_migrations (filename) VALUES (%s) "
                "ON CONFLICT (filename) DO NOTHING",
                (path.name,),
            )
        conn.commit()
        newly.append(path.name)
    return newly


def main() -> int:
    dsn = os.environ.get("DATABASE_URL", "postgresql://pwa:pwa@localhost:5433/pwa")
    with psycopg.connect(dsn) as conn:
        newly = apply_pending(conn)
    if newly:
        print(f"applied: {', '.join(newly)}")
    else:
        print("schema already up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
