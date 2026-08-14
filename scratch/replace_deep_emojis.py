import os
import re

def replace_emojis_deep(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    rel_path = os.path.relpath(filepath, '.')
    depth = rel_path.count(os.sep)
    
    if depth == 0:
        base_path = "docs/assets/icons/"
    elif depth == 1:
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

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Replaced emojis in {filepath}")

if __name__ == '__main__':
    for root, dirs, files in os.walk(r'.\docs'):
        for file in files:
            if file.endswith('.md'):
                replace_emojis_deep(os.path.join(root, file))
