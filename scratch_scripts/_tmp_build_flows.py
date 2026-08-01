import json, glob

out = []
for f in glob.glob('c:/Projects/IMS/nodered_data/flows/*.json'):
    with open(f, 'r', encoding='utf-8') as file:
        data = json.load(file)
        if isinstance(data, list):
            out.extend(data)

with open('c:/Projects/IMS/nodered_data/flows.json', 'w', encoding='utf-8') as out_file:
    json.dump(out, out_file, indent=4, ensure_ascii=False)
print("Flows merged successfully.")
