#!/usr/bin/env python3
"""Unwrap a pgAdmin "Copy with SQL INSERT statements" export.

pgAdmin's export wraps each INSERT statement as a single CSV field (header
"insert_sql") so it can be copy-pasted into a spreadsheet -- each field is a
complete, already-valid, semicolon-terminated SQL statement, often spanning
several physical lines. This just needs a real CSV parser (not naive line
splitting) to reconstruct each field correctly, then the CSV wrapper can be
discarded entirely -- the field content IS the SQL.

Usage: python3 unwrap-pgadmin-export.py <input.sql> <output.sql>
"""
import csv
import io
import sys


def main():
    if len(sys.argv) != 3:
        print("Usage: unwrap-pgadmin-export.py <input.sql> <output.sql>", file=sys.stderr)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]

    with open(src, encoding='utf-8') as f:
        content = f.read()

    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    header = rows[0]
    if header != ['insert_sql']:
        print(f"WARNING: unexpected header {header!r}, proceeding anyway", file=sys.stderr)
    data = rows[1:]

    with open(dst, 'w', encoding='utf-8', newline='\n') as out:
        for row in data:
            if not row or not row[0].strip():
                continue
            out.write(row[0].strip())
            out.write('\n')

    print(f"{src}: {len(data)} statements -> {dst}")


if __name__ == '__main__':
    main()
