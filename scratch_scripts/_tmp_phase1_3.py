"""
Phase 1-3: Fix equipment IDs, SNMP RAM overflow, create device registry migration.
All changes are safe text replacements — no structural flow changes.
"""
import json, os, re

# ════════════════════════════════════════════════════════════
# PHASE 1A: Rename MOCK-LDI-XX → LDI-XX in ldi_simulator.json
# ════════════════════════════════════════════════════════════

sim_path = 'c:/Projects/IMS/nodered_data/flows/ldi_simulator.json'
with open(sim_path, 'r', encoding='utf-8') as f:
    sim_text = f.read()

# Replace all MOCK-LDI-XX patterns
for i in range(1, 11):
    old = f'MOCK-LDI-{i:02d}'
    new = f'LDI-{i:02d}'
    count = sim_text.count(old)
    sim_text = sim_text.replace(old, new)
    if count > 0:
        print(f"  ldi_simulator.json: {old} → {new} ({count} occurrences)")

with open(sim_path, 'w', encoding='utf-8') as f:
    f.write(sim_text)
print("✅ Phase 1A: ldi_simulator.json equipment IDs fixed\n")

# ════════════════════════════════════════════════════════════
# PHASE 1B: Rename MOCK-LDI-XX → LDI-XX in ldi_alarm_simulator.json
#           + Expand to all 10 machines
# ════════════════════════════════════════════════════════════

alm_path = 'c:/Projects/IMS/nodered_data/flows/ldi_alarm_simulator.json'
with open(alm_path, 'r', encoding='utf-8') as f:
    alm_text = f.read()

# Replace MOCK-LDI-XX → LDI-XX
for i in range(1, 11):
    old = f'MOCK-LDI-{i:02d}'
    new = f'LDI-{i:02d}'
    count = alm_text.count(old)
    alm_text = alm_text.replace(old, new)
    if count > 0:
        print(f"  ldi_alarm_simulator.json: {old} → {new} ({count} occurrences)")

with open(alm_path, 'w', encoding='utf-8') as f:
    f.write(alm_text)
print("✅ Phase 1B: ldi_alarm_simulator.json equipment IDs fixed\n")

# Now expand equipment pool from 5 to 10 machines
# Load as JSON to update the func field
with open(alm_path, 'r', encoding='utf-8') as f:
    alm_data = json.load(f)

for node in alm_data:
    if node.get('id') == 'almsim_gen' and node.get('type') == 'function':
        func = node['func']
        # Find the old CUM distribution and replace with 10-machine version
        # Old: 5 machines with specific CUM values
        # New: 10 machines with production-proportional distribution
        # Production shares: LDI-01=0.166, 02=0.166, 03=0.109, 04=0.109, 
        #   05=0.172, 06=0.171, 07=0.037, 08=0.037, 09=0.017, 10=0.017
        old_eqp_pattern = r"const EQP\s*=\s*\[.*?\];"
        new_eqp = """const EQP = [
  { id: 'LDI-01', cum: 0.166 },
  { id: 'LDI-02', cum: 0.332 },
  { id: 'LDI-03', cum: 0.441 },
  { id: 'LDI-04', cum: 0.550 },
  { id: 'LDI-05', cum: 0.722 },
  { id: 'LDI-06', cum: 0.893 },
  { id: 'LDI-07', cum: 0.930 },
  { id: 'LDI-08', cum: 0.967 },
  { id: 'LDI-09', cum: 0.984 },
  { id: 'LDI-10', cum: 1.000 }
];"""
        func_new = re.sub(old_eqp_pattern, new_eqp, func, flags=re.DOTALL)
        if func_new != func:
            node['func'] = func_new
            print("✅ Phase 1B: Expanded alarm simulator to 10 machines")
        else:
            print("⚠️  Could not find EQP pattern in alarm simulator func")
        break

with open(alm_path, 'w', encoding='utf-8') as f:
    json.dump(alm_data, f, indent=4, ensure_ascii=False)

# ════════════════════════════════════════════════════════════
# PHASE 2: Create device registry migration
# ════════════════════════════════════════════════════════════

migration_sql = """-- Migration 040: Register LDI machines in devices table
-- Required for FK integrity and dashboard variable dropdowns

INSERT INTO public.devices (device_id, hostname, ip_address, device_type, enabled, location)
VALUES
  ('LDI-01', 'ldi-machine-01', '10.1.1.1', 'ldi', true, 'Factory 2 - DF INNER'),
  ('LDI-02', 'ldi-machine-02', '10.1.1.2', 'ldi', true, 'Factory 2 - DF INNER'),
  ('LDI-03', 'ldi-machine-03', '10.1.1.3', 'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI-04', 'ldi-machine-04', '10.1.1.4', 'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI-05', 'ldi-machine-05', '10.1.1.5', 'ldi', true, 'Factory 2 - DF OUTER'),
  ('LDI-06', 'ldi-machine-06', '10.1.1.6', 'ldi', true, 'Factory 2 - DF OUTER'),
  ('LDI-07', 'ldi-machine-07', '10.1.1.7', 'ldi', true, 'Factory 2 - SM'),
  ('LDI-08', 'ldi-machine-08', '10.1.1.8', 'ldi', true, 'Factory 2 - SM'),
  ('LDI-09', 'ldi-machine-09', '10.1.1.9', 'ldi', true, 'Factory 3 - SM'),
  ('LDI-10', 'ldi-machine-10', '10.1.1.10', 'ldi', true, 'Factory 3 - SM')
ON CONFLICT (device_id) DO UPDATE SET
  device_type = EXCLUDED.device_type,
  location = EXCLUDED.location,
  enabled = EXCLUDED.enabled;

-- Record migration
INSERT INTO public.schema_migrations (version, description)
VALUES (40, 'Register LDI machines in devices table')
ON CONFLICT DO NOTHING;
"""

# Write to both locations
for path in [
    'c:/Projects/IMS/database/migrations/040-register-ldi-devices.sql',
    'c:/Projects/IMS/postgres/init/040-register-ldi-devices.sql'
]:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(migration_sql)
    print(f"✅ Phase 2: Created {path}")

# ════════════════════════════════════════════════════════════
# PHASE 3: Fix SNMP simulator RAM overflow
# ════════════════════════════════════════════════════════════

snmp_path = 'c:/Projects/IMS/monitoring/snmpsim/ubuntu.snmprec'
with open(snmp_path, 'r', encoding='utf-8') as f:
    snmp_text = f.read()

# Find RAM used line: max=15728640 → max=7864320 (94% of 8GB)
old_ram = 'max=15728640'
new_ram = 'max=7864320'
if old_ram in snmp_text:
    snmp_text = snmp_text.replace(old_ram, new_ram)
    with open(snmp_path, 'w', encoding='utf-8') as f:
        f.write(snmp_text)
    print(f"\n✅ Phase 3: Fixed ubuntu.snmprec RAM used max: 15728640 → 7864320 (94% of 8GB)")
else:
    print(f"\n⚠️  Phase 3: Could not find {old_ram} in ubuntu.snmprec")

print("\n════════════════════════════════════════")
print("Phases 1-3 complete. Phase 4 (034 regeneration) next.")
