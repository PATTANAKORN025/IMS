import os
import re

def upgrade_arch_file(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # 1. Dynamic SVG Path Resolution
    rel_path = os.path.relpath(filepath, '.')
    depth = rel_path.count(os.sep)
    
    # E.g. docs/architecture/ARCHITECTURE.md -> depth = 2 (docs, architecture)
    # So relative to docs/assets/icons:
    if depth == 1:
        base_path = "assets/icons/"
    elif depth == 2:
        base_path = "../assets/icons/"
    elif depth == 3:
        base_path = "../../assets/icons/"
    else:
        base_path = "../../../assets/icons/"
        
    def icon_tag(filename):
        return f'<img src="{base_path}{filename}" width="18" height="18" align="center" />'

    emoji_map = {
        "✅": icon_tag("circle-check.svg"),
        "❌": icon_tag("circle-x.svg"),
        "⚠": icon_tag("triangle-alert.svg"),
        "✕": icon_tag("x.svg"),
        "⚡": icon_tag("zap.svg")
    }

    new_content = content
    for emoji, tag in emoji_map.items():
        new_content = new_content.replace(emoji, tag)

    # 2. Refactor Callouts to GitHub Native Alerts
    # > **Note:** -> > [!NOTE]
    new_content = re.sub(r'^>\s*\*\*Note:\*\*\s*', '> [!NOTE]\n> ', new_content, flags=re.MULTILINE | re.IGNORECASE)
    new_content = re.sub(r'^>\s*Note:\s*', '> [!NOTE]\n> ', new_content, flags=re.MULTILINE | re.IGNORECASE)
    
    new_content = re.sub(r'^>\s*\*\*Warning:\*\*\s*', '> [!WARNING]\n> ', new_content, flags=re.MULTILINE | re.IGNORECASE)
    new_content = re.sub(r'^>\s*Warning:\s*', '> [!WARNING]\n> ', new_content, flags=re.MULTILINE | re.IGNORECASE)
    
    new_content = re.sub(r'^>\s*\*\*Important:\*\*\s*', '> [!IMPORTANT]\n> ', new_content, flags=re.MULTILINE | re.IGNORECASE)
    new_content = re.sub(r'^>\s*Important:\s*', '> [!IMPORTANT]\n> ', new_content, flags=re.MULTILINE | re.IGNORECASE)

    # Also match Thai words as requested previously
    new_content = re.sub(r'^>\s*\*\*เป้าหมาย:\*\*\s*', '> [!IMPORTANT]\n> ', new_content, flags=re.MULTILINE | re.IGNORECASE)
    new_content = re.sub(r'^>\s*เป้าหมาย:\s*', '> [!IMPORTANT]\n> ', new_content, flags=re.MULTILINE | re.IGNORECASE)


    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Upgraded aesthetics in {filepath}")

if __name__ == '__main__':
    for root, dirs, files in os.walk(r'.\docs'):
        for file in files:
            if file.endswith('.md'):
                upgrade_arch_file(os.path.join(root, file))
