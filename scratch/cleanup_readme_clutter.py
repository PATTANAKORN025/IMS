import os
import re

def clean_readme(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove the huge banner and typing SVG block
    # It looks like:
    # <div align="center">
    #   <img src="assets/apex-ldi-noc-banner.jpg"...
    #   <br/>
    #   <br/>
    #   <a href="https://git.io/typing-svg">...
    # </div>
    banner_pattern = r'<div align="center">\s*<img src="assets/apex-ldi-noc-banner\.jpg".*?alt="Typing SVG" /></a>\s*</div>\s*'
    content = re.sub(banner_pattern, '', content, flags=re.DOTALL)

    # 2. Remove the custom ARCHITECTURE badges that clutter the top
    # <div align="center" justify-content="space-between">
    #   <a href="docs/architecture/IMS_PLATFORM_BOOK.md">...</a>
    #   <a href="docs/architecture/ARCHITECTURE.md">...</a>
    # </div>
    arch_badge_pattern = r'<div align="center" justify-content="space-between">\s*<a href="docs/architecture/IMS_PLATFORM_BOOK\.md">.*?</a>\s*<a href="docs/architecture/ARCHITECTURE\.md">.*?</a>\s*</div>\s*'
    content = re.sub(arch_badge_pattern, '', content, flags=re.DOTALL)

    # 3. Clean up the main badges div to be more compact
    # Remove the <br> inside the badges div so they flow naturally or just keep them clean
    badges_pattern = r'(<div align="center">\s*<a href="#quick-start">.*?alt="Release"/></a>.*?)\s*<br>\s*(.*?</div>)'
    content = re.sub(badges_pattern, r'\1\n  \2', content, flags=re.DOTALL)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Cleaned up {filepath}")

if __name__ == '__main__':
    target_files = [
        r'.\README.md', r'.\README-th.md', r'.\README-zh-CN.md'
    ]
    for f in target_files:
        if os.path.exists(f):
            clean_readme(f)
