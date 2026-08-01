import json
import os

with open('c:/Projects/IMS/nodered_data/flows.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

sim_nodes = [n for n in data if n.get('id', '').startswith('almsim_')]

os.makedirs('c:/Projects/IMS/.gemini/antigravity/brain/2fe0384c-962c-40e4-b353-01d67fd3e995/scratch', exist_ok=True)
with open('c:/Projects/IMS/.gemini/antigravity/brain/2fe0384c-962c-40e4-b353-01d67fd3e995/scratch/sim_nodes.json', 'w', encoding='utf-8') as out:
    json.dump(sim_nodes, out, indent=4)
