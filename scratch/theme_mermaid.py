import os
import re

def theme_mermaid_blocks(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # The Cyberpunk/NOC theme config for Mermaid
    theme_config = "%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%\n"

    # We want to insert the theme config immediately after ```mermaid
    # But only if it doesn't already have an init block
    
    def replacer(match):
        mermaid_tag = match.group(1)
        body = match.group(2)
        if "%%{init" in body:
            return match.group(0) # Already themed
        return f"{mermaid_tag}\n{theme_config}{body}"

    # Match ```mermaid followed by anything until the next ```
    pattern = r'(```mermaid)\n(.*?(?=```))'
    new_content = re.sub(pattern, replacer, content, flags=re.DOTALL)

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Added NOC theme to Mermaid diagrams in {filepath}")

if __name__ == '__main__':
    for root, dirs, files in os.walk(r'.\docs\architecture'):
        for file in files:
            if file.endswith('.md'):
                theme_mermaid_blocks(os.path.join(root, file))
