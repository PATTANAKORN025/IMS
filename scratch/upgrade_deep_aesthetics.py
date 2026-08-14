import os
import re

def upgrade_markdown_deep(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # Skip files that are already fully upgraded or shouldn't be touched
    if filepath.endswith('README.md') or 'ARCHITECTURE.md' in filepath or 'IMS_PLATFORM_BOOK.md' in filepath:
        # Actually wait, we already upgraded README and ARCHITECTURE in the root.
        # But maybe not the translated ones in docs/
        pass

    # Determine depth for correct asset paths
    # docs/operations/FILE.md -> depth = 2 relative to root
    # C:\Projects\IMS\docs\operations\FILE.md -> relative to C:\Projects\IMS
    rel_path = os.path.relpath(filepath, '.')
    depth = rel_path.count(os.sep)
    
    if depth == 0:
        asset_path = "docs/assets/icons/glowing-divider.svg"
    elif depth == 1:
        asset_path = "assets/icons/glowing-divider.svg"
    elif depth == 2:
        asset_path = "../assets/icons/glowing-divider.svg"
    elif depth == 3:
        asset_path = "../../assets/icons/glowing-divider.svg"
    else:
        asset_path = "../../../assets/icons/glowing-divider.svg"

    divider_img = f'<br/>\n\n<div align="center">\n  <img src="{asset_path}" width="100%" alt="divider" />\n</div>\n\n<br/>'
    
    # We replace lines that are exactly `---`
    new_content = re.sub(r'^\s*---\s*$', divider_img, content, flags=re.MULTILINE)

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Upgraded dividers in {filepath}")

if __name__ == '__main__':
    for root, dirs, files in os.walk(r'.\docs'):
        for file in files:
            if file.endswith('.md'):
                upgrade_markdown_deep(os.path.join(root, file))
