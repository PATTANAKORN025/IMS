import os
import re

emoji_pattern = re.compile(r'[\U00010000-\U0010ffff]', flags=re.UNICODE)
files = ['.github/ISSUE_TEMPLATE/bug_report.md', 'README.md', 'docs/business/BUSINESS_VALUE_ROI.md']

for path in files:
    if os.path.exists(path):
        content = open(path, encoding='utf-8').read()
        lines = content.split('\n')
        print(f'\n--- {path} ---')
        for i, line in enumerate(lines):
            if emoji_pattern.search(line):
                print(f'{i+1}: {line.strip()}')
