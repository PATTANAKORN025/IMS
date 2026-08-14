import os
import re

def upgrade_markdown(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # Determine depth for correct asset paths
    depth = filepath.count(os.sep)
    if depth == 1: # Root folder (e.g. .\README.md)
        asset_path = "docs/assets/icons/glowing-divider.svg"
        mascot_path = "assets/cyberpunk_cat_mascot.jpg"
    elif depth == 2: # e.g. .\docs\ARCHITECTURE.md
        asset_path = "assets/icons/glowing-divider.svg"
        mascot_path = "../assets/cyberpunk_cat_mascot.jpg"
    elif depth == 3: # e.g. .\docs\architecture\ARCHITECTURE.md
        asset_path = "../assets/icons/glowing-divider.svg"
        mascot_path = "../../assets/cyberpunk_cat_mascot.jpg"
    else:
        return # Skip deeper files for now

    # Replace `---` with glowing divider
    # But only if it's on a line by itself
    divider_img = f'<br/>\n\n<div align="center">\n  <img src="{asset_path}" width="100%" alt="divider" />\n</div>\n\n<br/>'
    
    # We replace lines that are exactly `---`
    new_content = re.sub(r'^\s*---\s*$', divider_img, content, flags=re.MULTILINE)

    # Add Cyberpunk Mascot at the end if it's a root README
    if depth == 1 and 'cyberpunk_cat_mascot' not in new_content:
        mascot_html = f"""

{divider_img}

<div align="center">
  <img src="{mascot_path}" width="150" style="border-radius:50%; box-shadow: 0 0 20px rgba(0, 242, 254, 0.5);" alt="System Guardian" />
  <p><i>IMS System Guardian</i></p>
</div>
"""
        new_content += mascot_html

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Upgraded {filepath}")

if __name__ == '__main__':
    target_files = [
        r'.\README.md', r'.\README-th.md', r'.\README-zh-CN.md',
        r'.\docs\architecture\ARCHITECTURE.md',
        r'.\docs\architecture\IMS_PLATFORM_BOOK.md'
    ]
    for f in target_files:
        if os.path.exists(f):
            upgrade_markdown(f)
