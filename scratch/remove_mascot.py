import os
import re

def remove_mascot(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to remove the mascot div block
    pattern = r'<br/>\s*<div align="center">\s*<img src=".*?cyberpunk_cat_mascot\.jpg".*?alt="System Guardian" />\s*<p><i>IMS System Guardian</i></p>\s*</div>'
    
    new_content = re.sub(pattern, '', content, flags=re.DOTALL)

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Removed mascot from {filepath}")
    else:
        print(f"Mascot not found in {filepath}")

if __name__ == '__main__':
    target_files = [
        r'.\README.md', r'.\README-th.md', r'.\README-zh-CN.md'
    ]
    for f in target_files:
        if os.path.exists(f):
            remove_mascot(f)
