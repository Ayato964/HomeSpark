"""Apply the Sales Spark schema patch to the configured Postgres branch.

Idempotent (CREATE TABLE IF NOT EXISTS): safe to re-run. ADDS the spark_* tables
only — it never touches existing poc tables or data.

Safety: refuses to run against the known PRODUCTION endpoint, and prints the
target so a human can confirm before writing.

Usage (from the main/ directory):
    .venv/Scripts/python.exe scripts/apply_schema.py
Requires DATABASE_URL in main/.env (the Neon DEV branch DSN).
"""
import os
import re
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except Exception:
    pass

import psycopg

# The poc production compute endpoint — writing the patch there is NOT allowed
# from this dev helper.
_PROD_ENDPOINT = "ep-aged-thunder"

_SCHEMA_PATCH = os.path.normpath(
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "..",
        "poc_customer_meeting_agent",
        "db",
        "schema_patch_sales_spark.sql",
    )
)


def main() -> int:
    dsn = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_POOLED")
    if not dsn:
        print("ERROR: DATABASE_URL is not set (point it at the Neon DEV branch).")
        return 2

    host_match = re.search(r"@([^/:?]+)", dsn)
    host = host_match.group(1) if host_match else "(unknown)"
    print(f"Target endpoint: {host}")

    if _PROD_ENDPOINT in host:
        print(
            f"REFUSING: '{host}' looks like the PRODUCTION endpoint "
            f"('{_PROD_ENDPOINT}'). Apply schema changes only to a DEV branch."
        )
        return 3

    if not os.path.exists(_SCHEMA_PATCH):
        print(f"ERROR: schema patch not found: {_SCHEMA_PATCH}")
        return 2

    sql = open(_SCHEMA_PATCH, encoding="utf-8").read()
    # Strip line comments BEFORE splitting on ';' — a comment may itself contain
    # a semicolon (e.g. "-- long-lived; re-issued on consent"), which would
    # otherwise split a statement mid-way. The schema has no string literals
    # containing '--', so this is safe.
    sql_no_comments = re.sub(r"--[^\n]*", "", sql)
    statements = [s.strip() for s in sql_no_comments.split(";") if s.strip()]

    with psycopg.connect(dsn, connect_timeout=20) as conn:
        with conn.cursor() as cur:
            # The patch FKs to tenants; fail clearly if the base schema is absent.
            cur.execute(
                "SELECT to_regclass('public.tenants') IS NOT NULL;"
            )
            if not cur.fetchone()[0]:
                print(
                    "ERROR: base table 'tenants' not found. This DB was created "
                    "empty rather than branched. Run db/schema.sql + db/seed.sql "
                    "first."
                )
                return 4
            for st in statements:
                if st.upper() in ("BEGIN", "COMMIT"):
                    continue
                cur.execute(st)
        conn.commit()

        with conn.cursor() as cur:
            cur.execute(
                "SELECT tablename FROM pg_tables WHERE tablename LIKE 'spark_%' ORDER BY 1;"
            )
            tables = [r[0] for r in cur.fetchall()]

    print("Applied. spark_* tables now present:", tables)
    return 0


if __name__ == "__main__":
    sys.exit(main())
