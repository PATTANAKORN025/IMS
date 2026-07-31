import json

with open('nodered_data/flows/ingestion.json', 'r', encoding='utf-8') as f:
    flows = json.load(f)

for node in flows:
    if node.get('name') == 'SRE AIOps Parser v9 (Batch)':
        func = node['func']
        # Remove trailing unmatched `; }`
        func = func.rstrip()
        if func.endswith('; }'):
            func = func[:-3].rstrip()
        elif func.endswith('}'):
            # Just to be safe if there's only `}`
            # Let's count braces just in case, but we know it's `122: ; }`
            pass
        
        # specifically replace the known bad token at the end
        if '; }' in func[-10:]:
            func = func[:func.rfind('; }')]

        node['func'] = func

with open('nodered_data/flows/ingestion.json', 'w', encoding='utf-8') as f:
    json.dump(flows, f, indent=4)
print("Removed unexpected token '}' from SRE parser")
