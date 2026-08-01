import json

alm_path = 'c:/Projects/IMS/nodered_data/flows/ldi_alarm_simulator.json'
with open(alm_path, 'r', encoding='utf-8') as f:
    alm_data = json.load(f)

for node in alm_data:
    if node.get('id') == 'almsim_gen' and node.get('type') == 'function':
        func = node['func']
        
        # Replace old 5-machine MACHINES array with 10-machine version
        # Production shares normalized to 10 machines (cumulative %)
        # LDI-01=16.6%, 02=16.6%, 03=10.9%, 04=10.9%, 05=17.2%, 06=17.1%, 07=3.7%, 08=3.7%, 09=1.7%, 10=1.7%
        old_machines = '''const MACHINES = [
    ["LDI-01", 32.3], ["LDI-04", 63.6],
    ["LDI-05", 89.2], ["LDI-06", 99.8], ["LDI-09", 100.0]
];'''
        new_machines = '''const MACHINES = [
    ["LDI-01", 16.6], ["LDI-02", 33.2], ["LDI-03", 44.1], ["LDI-04", 55.0],
    ["LDI-05", 72.2], ["LDI-06", 89.3], ["LDI-07", 93.0], ["LDI-08", 96.7],
    ["LDI-09", 98.4], ["LDI-10", 100.0]
];'''
        
        if old_machines in func:
            func = func.replace(old_machines, new_machines)
            node['func'] = func
            print("✅ Expanded MACHINES from 5 → 10 machines")
        else:
            # Try matching the escaped version
            old_esc = old_machines.replace('"', '\\"').replace('\n', '\\n')
            print("Could not find exact match. Trying line-by-line...")
            # The func field uses escaped quotes and newlines
            # Let's just do a string replace on the raw JSON text
            print("Will try raw text approach instead")
        break

with open(alm_path, 'w', encoding='utf-8') as f:
    json.dump(alm_data, f, indent=4, ensure_ascii=False)
print("Done")
