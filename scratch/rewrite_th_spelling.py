import re

file_path = 'docs/architecture/ARCHITECTURE-th.md'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace all occurrences
content = content.replace('แสกน', 'สแกน')
content = content.replace('ศูนย์ยากาศ', 'สุญญากาศ')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Spelling corrected in ARCHITECTURE-th.md")
