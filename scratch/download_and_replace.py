import urllib.request
import os

icons = [
    'circle-check', 'circle-x', 'triangle-alert'
]

base_url = "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/{}.svg"
out_dir = "docs/assets/icons"

for icon in icons:
    url = base_url.format(icon)
    path = os.path.join(out_dir, f"{icon}.svg")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            svg = response.read().decode('utf-8')
            with open(path, 'w', encoding='utf-8') as f:
                f.write(svg)
        print(f"Downloaded {icon}.svg")
    except Exception as e:
        print(f"Failed to download {icon}: {e}")

# Now replace in files
replacements = {
    '<img src="docs/assets/icons/check-circle.svg" width="16" height="16" align="center" />': '<img src="docs/assets/icons/circle-check.svg" width="16" height="16" align="center" />',
    '<img src="docs/assets/icons/x-circle.svg" width="16" height="16" align="center" />': '<img src="docs/assets/icons/circle-x.svg" width="16" height="16" align="center" />',
    '<img src="docs/assets/icons/alert-triangle.svg" width="16" height="16" align="center" />': '<img src="docs/assets/icons/triangle-alert.svg" width="16" height="16" align="center" />',
    '✅': '<img src="docs/assets/icons/circle-check.svg" width="16" height="16" align="center" />',
    '❌': '<img src="docs/assets/icons/circle-x.svg" width="16" height="16" align="center" />',
    '⚠': '<img src="docs/assets/icons/triangle-alert.svg" width="16" height="16" align="center" />',
}

for root, dirs, files in os.walk('.'):
    if '.git' in dirs: dirs.remove('.git')
    if 'node_modules' in dirs: dirs.remove('node_modules')
    if 'scratch' in dirs: dirs.remove('scratch')
    if '.claude' in dirs: dirs.remove('.claude')
    if '.mimocode' in dirs: dirs.remove('.mimocode')
    if '.agents' in dirs: dirs.remove('.agents')
    
    for f in files:
        if f.endswith('.md'):
            filepath = os.path.join(root, f)
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
                content = file.read()
            
            new_content = content
            for old, new in replacements.items():
                new_content = new_content.replace(old, new)
                
            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as file:
                    file.write(new_content)
                print(f"Replaced emojis in {filepath}")
