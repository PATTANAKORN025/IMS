#!/usr/bin/env python3
"""
Extract one table's row data out of a plain pg_dump SQL file and write it
as a flat TSV, ready for `\\copy <table> (<cols>) FROM <file>` against an
already-migrated schema.

Why this exists: restoring a full pg_dump of a database that has
TimescaleDB continuous aggregates (`psql < dump.sql` against a database
that already has its own schema) is unreliable -- confirmed by running it
for real (scripts/dr-test.sh Drill 3, 2026-08-13, see
docs/evidence/DR_DRILL_3_FINDINGS.md): "cannot alter the internal view of
a continuous aggregate", "operation not supported on materialization
tables", internal per-chunk table names that don't match a freshly
created hypertable's own internal IDs. TimescaleDB's own pg_dump output
warns about this every time ("circular foreign-key constraints... You
might not be able to restore the dump").

The schema (tables, views, CAGGs, policies) is already fully and
correctly reproducible from database/migrations/ alone -- that's what
db-migrate is for, and it's proven to apply cleanly on an empty database.
The only thing a backup actually needs to restore is the RAW ROW DATA
migrations don't seed (telemetry, alarm log) -- not the schema. This
script pulls just that, working around pg_dump's per-chunk hypertable
COPY format (each hypertable chunk is dumped through an internal
_timescaledb_internal._hyper_N_M_chunk table, named by IDs specific to
the instance that produced the dump -- restoring through the PARENT
table name instead sidesteps that entirely, since TimescaleDB routes a
normal COPY/INSERT into the correct chunk automatically).

Usage:
  python3 scripts/dr-restore-table-data.py <dump.sql> <table_name> <out.tsv>

Prints the exact column list (as it appears in the dump) to stdout, for
the caller to use in `\\copy <table_name> (<columns>) FROM <out.tsv>`.
Exits 1 with no output if the table has zero rows in the dump.
"""
import re
import sys


def main():
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    dump_path, table_name, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(dump_path, encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    # Find the parent table's own COPY header to learn the exact column
    # list -- present even when the block itself is empty (hypertable
    # data lives in per-chunk blocks instead, using the same columns).
    parent_re = re.compile(
        r"^COPY (?:public\.)?" + re.escape(table_name) + r"\s*\(([^)]*)\)\s*FROM stdin;\s*$"
    )
    columns = None
    for line in lines:
        m = parent_re.match(line)
        if m:
            columns = m.group(1)
            break
    if columns is None:
        print(f"no COPY block found for table '{table_name}' in {dump_path}", file=sys.stderr)
        sys.exit(1)

    header_variants = {
        f"COPY public.{table_name} ({columns}) FROM stdin;\n",
        f"COPY {table_name} ({columns}) FROM stdin;\n",
    }
    chunk_re = re.compile(
        r"^COPY _timescaledb_internal\.\S+ \(" + re.escape(columns) + r"\) FROM stdin;\s*$"
    )

    total = 0
    with open(out_path, "w", encoding="utf-8", newline="\n") as out:
        i, n = 0, len(lines)
        while i < n:
            line = lines[i]
            if line in header_variants or chunk_re.match(line):
                i += 1
                while i < n and lines[i].rstrip("\n") != "\\.":
                    out.write(lines[i])
                    total += 1
                    i += 1
            i += 1

    if total == 0:
        print(f"0 rows found for table '{table_name}' in {dump_path}", file=sys.stderr)
        sys.exit(1)

    print(columns)
    print(f"{total} rows -> {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
