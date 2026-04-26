from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine


def _table_exists(conn, table_name: str) -> bool:
    query = text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name")
    return conn.execute(query, {"name": table_name}).first() is not None


def _column_names(conn, table_name: str) -> set[str]:
    rows = conn.execute(text(f"PRAGMA table_info({table_name})")).all()
    return {row[1] for row in rows}


def upgrade_sqlite_schema(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as conn:
        if not _table_exists(conn, "claims"):
            return

        columns = _column_names(conn, "claims")

        migration_columns = [
            ("source_type", "TEXT DEFAULT 'document_upload'"),
            ("source_reference", "TEXT"),
            ("submitted_by_user_id", "TEXT"),
            ("suspicious_flag", "BOOLEAN DEFAULT 0"),
            ("incorrect_flag", "BOOLEAN DEFAULT 0"),
            ("risk_score_cached", "FLOAT DEFAULT 0"),
            ("trip_settlement_date", "DATE"),
            ("trip_number", "TEXT"),
            ("from_region", "TEXT"),
            ("from_country", "TEXT"),
            ("from_city", "TEXT"),
            ("to_region", "TEXT"),
            ("to_country", "TEXT"),
            ("to_city", "TEXT"),
            ("trip_activity", "TEXT"),
            ("trip_boundary", "TEXT"),
            ("expense_type", "TEXT"),
            ("masked_id", "TEXT"),
            ("trip_duration_days", "INTEGER"),
            ("case_owner_id", "TEXT"),
            ("case_priority", "TEXT DEFAULT 'standard'"),
            ("case_sla_due_at", "DATETIME"),
            ("case_opened_at", "DATETIME"),
            ("case_closed_at", "DATETIME"),
            ("case_tags", "TEXT DEFAULT '[]'"),
            ("case_watchlist", "BOOLEAN DEFAULT 0"),
            ("case_next_action", "TEXT"),
        ]

        for column_name, ddl_type in migration_columns:
            if column_name not in columns:
                conn.execute(text(f"ALTER TABLE claims ADD COLUMN {column_name} {ddl_type}"))

        # Backfill nulls for rows that existed before new columns were added.
        conn.execute(text("UPDATE claims SET source_type='document_upload' WHERE source_type IS NULL"))
        conn.execute(text("UPDATE claims SET suspicious_flag=0 WHERE suspicious_flag IS NULL"))
        conn.execute(text("UPDATE claims SET incorrect_flag=0 WHERE incorrect_flag IS NULL"))
        conn.execute(text("UPDATE claims SET risk_score_cached=0 WHERE risk_score_cached IS NULL"))
        conn.execute(text("UPDATE claims SET case_priority='standard' WHERE case_priority IS NULL"))
        conn.execute(text("UPDATE claims SET case_tags='[]' WHERE case_tags IS NULL"))
        conn.execute(text("UPDATE claims SET case_watchlist=0 WHERE case_watchlist IS NULL"))
        conn.execute(text("UPDATE claims SET case_opened_at=created_at WHERE case_opened_at IS NULL"))
        conn.execute(
            text(
                "UPDATE claims SET case_closed_at=updated_at "
                "WHERE case_closed_at IS NULL AND status IN ('reviewed', 'escalated')"
            )
        )
