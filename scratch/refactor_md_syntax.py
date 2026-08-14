import os
import re

# Fallback SVG to replace all unmapped emojis
fallback_svg = '<img src="docs/assets/icons/target.svg" width="18" height="18" align="center" />'

# Known replacements (from previous script, just in case)
svg_map = {
    '📈': '<img src="docs/assets/icons/trending-up.svg" width="18" height="18" align="center" />',
    '⚙️': '<img src="docs/assets/icons/settings.svg" width="18" height="18" align="center" />',
    '⚙': '<img src="docs/assets/icons/settings.svg" width="18" height="18" align="center" />',
    # We will use fallback for everything else
}

emoji_pattern = re.compile(r'[\U00010000-\U0010ffff]', flags=re.UNICODE)
bare_codeblock_pattern = re.compile(r'^```\s*$', re.MULTILINE)

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    changed = False
    
    # 1. Enforce syntax highlighting on bare code blocks
    # If we see a bare ```, we'll try to guess based on content, or default to `text`
    # To keep it safe and avoid breaking markdown, we just replace ` ```\n` with ` ```text\n`
    # But ONLY for opening blocks. This is tricky with regex. 
    # Let's count backticks to see if it's opening or closing.
    lines = content.split('\n')
    in_block = False
    processed_lines = []
    
    for line in lines:
        new_line = line
        if line.strip().startswith('```'):
            if not in_block:
                # Opening block
                in_block = True
                if line.strip() == '```':
                    new_line = '```text'
                    changed = True
            else:
                # Closing block
                in_block = False
        
        # 2. Eradicate emojis
        emojis_found = emoji_pattern.findall(new_line)
        for emoji in set(emojis_found):
            replacement = svg_map.get(emoji, fallback_svg)
            new_line = new_line.replace(emoji, replacement)
            changed = True
            
        processed_lines.append(new_line)

    new_content = '\n'.join(processed_lines)
    
    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Refactored syntax/emojis in {filepath}")

for root, dirs, files in os.walk('.'):
    if '.git' in dirs: dirs.remove('.git')
    if 'node_modules' in dirs: dirs.remove('node_modules')
    if 'scratch' in dirs: dirs.remove('scratch')
    if '.claude' in dirs: dirs.remove('.claude')
    if '.mimocode' in dirs: dirs.remove('.mimocode')
    if '.agents' in dirs: dirs.remove('.agents')
    
    for f in files:
        if f.endswith('.md'):
            process_file(os.path.join(root, f))
