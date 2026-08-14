import os
import re

# Dictionary mapping emojis to SVG replacement strings
svg_map = {
    '💼': '<img src="docs/assets/icons/briefcase.svg" width="18" height="18" align="center" />',
    '🏭': '<img src="docs/assets/icons/factory.svg" width="18" height="18" align="center" />',
    '🏗️': '<img src="docs/assets/icons/layers.svg" width="18" height="18" align="center" />',
    '🏗': '<img src="docs/assets/icons/layers.svg" width="18" height="18" align="center" />',
    '🤝': '<img src="docs/assets/icons/users.svg" width="18" height="18" align="center" />',
    '🐛': '<img src="docs/assets/icons/bug.svg" width="18" height="18" align="center" />',
    '🛠️': '<img src="docs/assets/icons/wrench.svg" width="18" height="18" align="center" />',
    '🛠': '<img src="docs/assets/icons/wrench.svg" width="18" height="18" align="center" />',
    '🎯': '<img src="docs/assets/icons/target.svg" width="18" height="18" align="center" />',
    '📸': '<img src="docs/assets/icons/camera.svg" width="18" height="18" align="center" />',
    '📊': '<img src="docs/assets/icons/activity.svg" width="18" height="18" align="center" />',
    '🖥️': '<img src="docs/assets/icons/monitor.svg" width="18" height="18" align="center" />',
    '🖥': '<img src="docs/assets/icons/monitor.svg" width="18" height="18" align="center" />',
    '📝': '<img src="docs/assets/icons/file-text.svg" width="18" height="18" align="center" />',
    '✨': '<img src="docs/assets/icons/rocket.svg" width="18" height="18" align="center" />',
    '💡': '<img src="docs/assets/icons/lightbulb.svg" width="18" height="18" align="center" />',
    '🚀': '<img src="docs/assets/icons/rocket.svg" width="18" height="18" align="center" />',
    '📈': '<img src="docs/assets/icons/trending-up.svg" width="18" height="18" align="center" />',
    '🔄': '<img src="docs/assets/icons/refresh-cw.svg" width="18" height="18" align="center" />',
    '⏱️': '<img src="docs/assets/icons/clock.svg" width="18" height="18" align="center" />',
    '⏱': '<img src="docs/assets/icons/clock.svg" width="18" height="18" align="center" />',
    '🟢': '![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen)',
    '🔴': '![Down](https://img.shields.io/badge/Status-Down-red)',
    '🟡': '![Warning](https://img.shields.io/badge/Status-Warning-yellow)',
    '🟠': '![Warning](https://img.shields.io/badge/Status-Warning-orange)',
    '🟣': '![Error](https://img.shields.io/badge/Status-Error-purple)'
}

# Regex to match any emoji at the start of a header
header_emoji_re = re.compile(r'^(#+)\s*(?:[\U00010000-\U0010ffff\u2600-\u27BF]+\s*)+(.*)$', flags=re.UNICODE)
# A regex for all emojis to strip if we want to remove them entirely from headers
general_emoji_re = re.compile(r'[\U00010000-\U0010ffff\u2600-\u27BF]', flags=re.UNICODE)

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    new_lines = []
    changed = False

    for line in lines:
        new_line = line
        
        # If it's a header line
        if line.startswith('#'):
            # First check if there's a specific emoji to replace with an SVG
            replaced = False
            for emoji, svg in svg_map.items():
                if emoji in line:
                    if 'ISSUE_TEMPLATE' not in filepath: # don't use <img> tags in issue template headers, github doesn't like it. Instead just strip.
                        new_line = line.replace(emoji, svg)
                        replaced = True
            
            if not replaced or 'ISSUE_TEMPLATE' in filepath:
                # Strip emojis from headers
                match = header_emoji_re.match(new_line)
                if match:
                    new_line = f"{match.group(1)} {match.group(2)}"
                
                # Also strip any other stray emojis in the header
                parts = new_line.split(' ', 1)
                if len(parts) == 2 and parts[0].startswith('#'):
                    # Strip emojis but KEEP flags (flags use regional indicator symbols \U0001F1E6-\U0001F1FF)
                    clean_text = parts[1]
                    for emoji in svg_map.keys():
                        clean_text = clean_text.replace(emoji, '')
                    new_line = f"{parts[0]} {clean_text.strip()}"
        else:
            # Inline text replacements
            for emoji, svg in svg_map.items():
                if emoji in new_line:
                    # In issue templates, replace with nothing to keep it clean, or use SVG?
                    # Issue templates don't support HTML images well, better to strip.
                    if 'ISSUE_TEMPLATE' in filepath:
                        new_line = new_line.replace(emoji, '').strip()
                    else:
                        new_line = new_line.replace(emoji, svg)
        
        # Cleanup double spaces from stripped emojis
        new_line = new_line.replace('  ', ' ').replace(' / ', ' / ')
        if new_line != line:
            changed = True
        new_lines.append(new_line)

    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines))
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('.'):
    if '.git' in dirs: dirs.remove('.git')
    if 'node_modules' in dirs: dirs.remove('node_modules')
    if 'archive' in dirs: dirs.remove('archive')
    for f in files:
        if f.endswith('.md'):
            process_file(os.path.join(root, f))
