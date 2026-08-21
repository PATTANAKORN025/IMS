import json

with open('package.json', 'r', encoding='utf-8') as f:
    pkg = json.load(f)

pkg['version'] = '1.0.1'

with open('package.json', 'w', encoding='utf-8') as f:
    json.dump(pkg, f, indent=2)
