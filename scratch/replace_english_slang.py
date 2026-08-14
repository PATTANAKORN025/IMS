import os
import re

files_to_process = [
    r'docs\architecture\IMS_MANUFACTURING_PLATFORM_V2.md',
    r'docs\evidence\DR_DRILL_3_FINDINGS.md',
    r'docs\operations\BACKUP_RESTORE.md',
    r'docs\operations\DR_TEST_PLAN.md'
]

replacements = {
    r'throwaway DB': 'ephemeral isolated database',
    r'throwaway `ims_dr_test` database': 'ephemeral `ims_dr_test` validation database',
    r'false FAIL': 'false negative validation',
    r'naive': 'simplistic',
    r'dump \(': 'database snapshot (',
    r'dump snapshot': 'database snapshot',
    r'dump \d+s': 'snapshot export time: \g<0>',
    r'before dump': 'before snapshot',
    r'after dump': 'after snapshot',
    r'the dump completed': 'the snapshot completed',
    r'the dump': 'the snapshot',
    r'dump\.sql': 'snapshot.sql',
    r'full_dump\.sql': 'full_snapshot.sql',
    r'A plain `pg_dump` against the live database': 'An uncompressed `pg_dump` snapshot extracted from the production database',
}

for filepath in files_to_process:
    filepath = os.path.join('C:\\Projects\\IMS', filepath)
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        for pattern, repl in replacements.items():
            content = re.sub(pattern, repl, content, flags=re.IGNORECASE)
            
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated {filepath}')
