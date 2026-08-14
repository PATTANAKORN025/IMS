import urllib.request
import os

icons = [
    'check', 'line-chart', 'bar-chart-2', 'target', 'camera', 'monitor'
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
