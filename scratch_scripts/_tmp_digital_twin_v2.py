"""
IMS Digital Twin Generator v2 — Production-Grade Mock Data
═══════════════════════════════════════════════════════════
Generates 14-day historical telemetry + alarms for ldi_data & ldi_alarm_log.
Uses EXACT same OU model parameters as the live Node-RED simulator.

Output: postgres/init/034-ldi-statistical-mock.sql (~100MB)

Usage: python data-generators/generate_digital_twin.py
"""
import numpy as np
import random
import os
from datetime import datetime, timedelta

np.random.seed(42)
random.seed(42)

# ─── Configuration ───────────────────────────────────────
START_TIME = datetime.now() - timedelta(days=14)
END_TIME = datetime.now()
INTERVAL_SEC = 10  # One row per 10 seconds per active machine
TOTAL_STEPS = int((END_TIME - START_TIME).total_seconds() / INTERVAL_SEC)

OUTPUT_SQL = os.path.abspath(os.path.join(
    os.path.dirname(__file__), '../postgres/init/034-ldi-statistical-mock.sql'))

# ─── OU Process Parameters (identical to live simulator) ─
THETA = 0.15
DT = 1.0

# ─── Machine Profiles (exact copy from ldi_simulator.json) ─
PROFILES = {
    "LDI-01": {"process": "DF INNER", "share": 0.166, "temp_mu": 21.19, "temp_sd": 0.13,
               "rh_mu": 56.23, "rh_sd": 1.63, "dosage": 69.591, "scan": 220.0, "vac": -16.08,
               "thick_mu": 0.529, "thick_sd": 0.365, "pe_setting": 30.0, "je_setting": 30.0,
               "scale_mode": "FixedScale", "factory": "2",
               "pe": None,
               "je": [[7.9, 2.22], [4.41, 2.29], [10.87, 3.01], None],
               "layers": ["mk-inner-a", "mk-inner-b", "mk-inner-c", "mk-inner-d"]},
    "LDI-02": {"process": "DF INNER", "share": 0.166, "temp_mu": 26.49, "temp_sd": 0.09,
               "rh_mu": 52.52, "rh_sd": 1.58, "dosage": 69.591, "scan": 220.0, "vac": -17.21,
               "thick_mu": 0.528, "thick_sd": 0.365, "pe_setting": 30.0, "je_setting": 30.0,
               "scale_mode": "FixedScale", "factory": "2",
               "pe": None,
               "je": [[2.23, 0.97], [1.63, 1.39], [2.25, 1.26], None],
               "layers": ["mk-inner-a", "mk-inner-b", "mk-inner-c", "mk-inner-d"]},
    "LDI-03": {"process": "DF INNER", "share": 0.109, "temp_mu": 20.92, "temp_sd": 0.08,
               "rh_mu": 56.7, "rh_sd": 0.36, "dosage": 75.708, "scan": 260.0, "vac": -19.15,
               "thick_mu": 0.264, "thick_sd": 0.0, "pe_setting": 30.0, "je_setting": 30.0,
               "scale_mode": "FixedScale", "factory": "3",
               "pe": None,
               "je": [[2.27, 0.28], [1.79, 0.31], [1.13, 0.36], None],
               "layers": ["mk-inner-a", "mk-inner-b", "mk-inner-c", "mk-inner-d"]},
    "LDI-04": {"process": "DF INNER", "share": 0.109, "temp_mu": 22.58, "temp_sd": 0.06,
               "rh_mu": 52.69, "rh_sd": 0.27, "dosage": 72.904, "scan": 270.0, "vac": -17.86,
               "thick_mu": 0.264, "thick_sd": 0.0, "pe_setting": 30.0, "je_setting": 40.0,
               "scale_mode": "FixedScale", "factory": "3",
               "pe": None,
               "je": [[5.94, 1.49], [17.46, 1.74], [11.94, 1.93], None],
               "layers": ["mk-inner-a", "mk-inner-b", "mk-inner-c", "mk-inner-d"]},
    "LDI-05": {"process": "DF OUTER", "share": 0.172, "temp_mu": 22.39, "temp_sd": 0.14,
               "rh_mu": 50.55, "rh_sd": 0.5, "dosage": 15.0, "scan": 435.0, "vac": 0.0,
               "thick_mu": 1.141, "thick_sd": 0.325, "pe_setting": 75.0, "je_setting": 50.0,
               "scale_mode": "Fixed", "factory": "2",
               "pe": [[-6.22, 12.26], [-5.35, 18.69], [-14.76, 21.32],
                      [1.23, 21.44], [-3.21, 18.67], [-5.23, 10.92]],
               "je": [[12.63, 7.15], [10.72, 6.3], [10.27, 5.95], [12.01, 6.65]],
               "layers": ["mk-outer-a", "mk-outer-b"]},
    "LDI-06": {"process": "DF OUTER", "share": 0.171, "temp_mu": 21.88, "temp_sd": 0.1,
               "rh_mu": 52.56, "rh_sd": 0.45, "dosage": 15.0, "scan": 435.0, "vac": 0.0,
               "thick_mu": 1.139, "thick_sd": 0.325, "pe_setting": 75.0, "je_setting": 50.0,
               "scale_mode": "Fixed", "factory": "2",
               "pe": [[3.56, 12.01], [9.55, 15.94], [2.93, 18.46],
                      [15.06, 18.61], [7.23, 16.86], [3.51, 10.32]],
               "je": [[9.43, 5.92], [11.35, 7.28], [11.1, 7.13], [9.26, 5.69]],
               "layers": ["mk-outer-a", "mk-outer-b"]},
    "LDI-07": {"process": "SM", "share": 0.037, "temp_mu": 22.33, "temp_sd": 0.08,
               "rh_mu": 55.83, "rh_sd": 0.44, "dosage": 568.0, "scan": 104.7, "vac": 0.0,
               "thick_mu": 0.986, "thick_sd": 0.335, "pe_setting": 50.0, "je_setting": 50.0,
               "scale_mode": "Auto", "factory": "2",
               "pe": [[0.37, 2.72], [-13.87, 6.56], [-5.44, 5.24],
                      [5.91, 5.53], [14.22, 6.78], [-0.9, 2.66]],
               "je": [[9.22, 5.03], [9.9, 5.06], [5.92, 2.63], [5.37, 2.49]],
               "layers": ["mk-solder-a", "mk-solder-b", "mk-comp-a"]},
    "LDI-08": {"process": "SM", "share": 0.037, "temp_mu": 22.49, "temp_sd": 0.09,
               "rh_mu": 53.18, "rh_sd": 0.37, "dosage": 595.3, "scan": 101.8, "vac": 0.0,
               "thick_mu": 0.986, "thick_sd": 0.336, "pe_setting": 50.0, "je_setting": 50.0,
               "scale_mode": "Auto", "factory": "2",
               "pe": [[-0.1, 5.59], [-9.76, 9.65], [-3.48, 3.27],
                      [3.16, 3.16], [9.52, 9.45], [0.46, 5.82]],
               "je": [[7.53, 5.73], [6.59, 3.75], [4.94, 2.79], [5.66, 5.31]],
               "layers": ["mk-solder-a", "mk-solder-b", "mk-comp-a"]},
    "LDI-09": {"process": "SM", "share": 0.017, "temp_mu": 21.98, "temp_sd": 0.04,
               "rh_mu": 55.63, "rh_sd": 0.07, "dosage": 500.0, "scan": 115.86, "vac": 0.0,
               "thick_mu": 1.174, "thick_sd": 0.05, "pe_setting": 25.0, "je_setting": 25.0,
               "scale_mode": "Auto", "factory": "3",
               "pe": [[1.37, 2.32], [-5.73, 4.63], [1.06, 3.69],
                      [-1.07, 3.7], [5.73, 4.64], [-1.36, 2.38]],
               "je": [[3.2, 2.4], [3.7, 2.15], [4.08, 2.35], [3.72, 2.48]],
               "layers": ["mk-solder-a", "mk-solder-b", "mk-comp-a"]},
    "LDI-10": {"process": "SM", "share": 0.017, "temp_mu": 22.31, "temp_sd": 0.04,
               "rh_mu": 55.03, "rh_sd": 0.09, "dosage": 500.0, "scan": 115.86, "vac": 0.0,
               "thick_mu": 1.174, "thick_sd": 0.05, "pe_setting": 25.0, "je_setting": 25.0,
               "scale_mode": "Auto", "factory": "3",
               "pe": [[0.69, 1.55], [-4.98, 2.47], [1.03, 2.72],
                      [-1.0, 2.72], [4.96, 2.46], [-0.74, 1.59]],
               "je": [[2.35, 1.36], [2.68, 1.53], [3.48, 1.3], [3.12, 1.33]],
               "layers": ["mk-solder-a", "mk-solder-b", "mk-comp-a"]},
}

ALARM_CODES = [
    91009, 90005, 90004, 93004, 90001, 90013, 90012, 91012, 91008, 91017,
    91020, 91024, 93007, 91029, 97014, 70004, 10006, 20, 20021, 2
]
ALARM_CUM = [15.0, 30.0, 45.0, 55.0, 57.8, 60.6, 63.4, 66.2, 69.0, 71.8,
             74.6, 77.4, 80.2, 83.0, 85.8, 88.6, 91.4, 94.2, 97.0, 100.0]

RESIST_TYPES = ["RESIST-A18", "RESIST-A22", "RESIST-B15", "RESIST-B30", "RESIST-C12"]


def ou(prev, mu, sigma):
    if prev is None:
        return mu + sigma * np.random.randn()
    return prev + THETA * (mu - prev) * DT + sigma * np.sqrt(DT) * np.random.randn()

def pick_alarm():
    x = random.random() * 100
    for code, cum in zip(ALARM_CODES, ALARM_CUM):
        if x <= cum:
            return code
    return ALARM_CODES[-1]

def sql_val(v, is_str=False):
    if v is None:
        return "NULL"
    if is_str:
        return f"'{v}'"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        return f"{v:.6f}" if abs(v) < 0.001 else f"{v:.3f}"
    return str(v)


def generate():
    print(f"Generating {TOTAL_STEPS} steps x {len(PROFILES)} machines...")
    print(f"Time range: {START_TIME} -> {END_TIME}")
    print(f"Output: {OUTPUT_SQL}")

    BATCH_SIZE = 2000
    COLS = ('log_id', '"time"', 'eqp_id', 'factory', 'process', 'mo', 'fpn',
            'layer_name', 'resist', 'resist_dosage', 'scan_speed', 'air_vacuum',
            'scale_x', 'scale_y', 'temperature', 'humidity', 'thickness',
            'board_no', 'total_board', 'total_time', 'state', 'scale_mode',
            'pe_1', 'pe_2', 'pe_3', 'pe_4', 'pe_5', 'pe_6',
            'je_1', 'je_2', 'je_3', 'je_4',
            'pe_setting', 'je_setting')
    col_str = ", ".join(COLS)

    with open(OUTPUT_SQL, 'w', encoding='utf-8', newline='\n') as f:
        f.write("-- IMS DIGITAL TWIN v2 -- AUTO-GENERATED MOCK DATA\n")
        f.write(f"-- Generated: {datetime.now().isoformat()}\n")
        f.write(f"-- Machines: {', '.join(PROFILES.keys())}\n")
        f.write(f"-- Time Range: {START_TIME} -> {END_TIME} ({TOTAL_STEPS} steps)\n")
        f.write("-- Model: Ornstein-Uhlenbeck mean-reverting (theta=0.15)\n\n")
        f.write("TRUNCATE TABLE public.ldi_data;\n")
        f.write("TRUNCATE TABLE public.ldi_alarm_log;\n\n")

        total_rows = 0
        total_alarms = 0

        for machine_id, p in PROFILES.items():
            print(f"  Generating {machine_id} (share={p['share']})...")

            temp_state = p["temp_mu"]
            rh_state = p["rh_mu"]
            board = 1
            total_board = random.randint(120, 240)
            mo = f"MO-{random.randint(10000, 99999)}"
            fpn = f"PN-{chr(65 + random.randint(0, 23))}{random.randint(100, 999)}"
            layer = random.choice(p["layers"])
            resist = random.choice(RESIST_TYPES)

            machine_state = 0
            degrade_counter = 0
            fault_counter = 0

            batch = []
            alarm_batch = []
            acc = 0.0

            for step in range(TOTAL_STEPS):
                acc += p["share"] * 2.0
                if acc < 1:
                    continue
                acc -= 1

                t = START_TIME + timedelta(seconds=step * INTERVAL_SEC)
                ts = t.strftime('%Y-%m-%d %H:%M:%S')

                if machine_state == 0:
                    if random.random() < 0.0001:
                        machine_state = 1
                        degrade_counter = random.randint(100, 500)
                elif machine_state == 1:
                    degrade_counter -= 1
                    if degrade_counter <= 0:
                        machine_state = 2
                        fault_counter = random.randint(30, 180)
                        alarm_code = pick_alarm()
                        alarm_batch.append(
                            f"('{machine_id}_{t.strftime('%Y%m%d%H%M%S')}', "
                            f"'{ts}', '{alarm_code}', '{ts}', "
                            f"'{machine_id}', '{p['factory']}', '{p['process']}')")
                elif machine_state == 2:
                    fault_counter -= 1
                    if fault_counter <= 0:
                        machine_state = 0

                temp_state = ou(temp_state, p["temp_mu"], p["temp_sd"])
                rh_state = ou(rh_state, p["rh_mu"], p["rh_sd"])

                dropout = random.random() < 0.0002
                stopped = machine_state == 2 or random.random() < 0.0002

                board += 1
                if board > total_board:
                    board = 1
                    total_board = random.randint(120, 240)
                    mo = f"MO-{random.randint(10000, 99999)}"
                    fpn = f"PN-{chr(65 + random.randint(0, 23))}{random.randint(100, 999)}"
                    layer = random.choice(p["layers"])

                if machine_state == 1 and random.random() < 0.02:
                    alarm_code = pick_alarm()
                    alarm_batch.append(
                        f"('{machine_id}_{t.strftime('%Y%m%d%H%M%S')}_{random.randint(0,999)}', "
                        f"'{ts}', '{alarm_code}', '{ts}', "
                        f"'{machine_id}', '{p['factory']}', '{p['process']}')")

                temperature = 0 if dropout else round(temp_state, 1)
                humidity = 0 if dropout else round(rh_state, 1)
                scale_x = 0 if dropout else round(1.000282 + np.random.randn() * 0.000099, 6)
                scale_y = 0 if dropout else round(1.000280 + np.random.randn() * 0.000099, 6)
                thickness = round(max(0.26, p["thick_mu"] + np.random.randn() * p["thick_sd"]), 3)
                total_time = round(max(5, 7 + abs(np.random.randn()) * (18 if p["process"] == "SM" else 3)), 3)

                pe_vals = [None] * 6
                if p["pe"] is not None:
                    base = [np.random.randn() for _ in range(3)]
                    pairs = [(0, 5), (1, 4), (2, 3)]
                    for k in range(3):
                        a, b = pairs[k]
                        za = base[k]
                        zb = -base[k] + np.random.randn() * 0.15
                        pe_vals[a] = round(p["pe"][a][0] + za * p["pe"][a][1], 3)
                        pe_vals[b] = round(p["pe"][b][0] + zb * p["pe"][b][1], 3)

                je_vals = [None] * 4
                for k in range(4):
                    j = p["je"][k]
                    if j is not None:
                        je_vals[k] = round(max(0, j[0] + abs(np.random.randn()) * j[1]), 1)

                log_id = f"SIM-{machine_id[-2:]}-{step}-{board}"

                row = (
                    f"({sql_val(log_id, True)}, '{ts}', {sql_val(machine_id, True)}, "
                    f"{sql_val(p['factory'], True)}, {sql_val(p['process'], True)}, "
                    f"{sql_val(mo, True)}, {sql_val(fpn, True)}, "
                    f"{sql_val(layer, True)}, {sql_val(resist, True)}, "
                    f"{sql_val(p['dosage'])}, {sql_val(p['scan'])}, {sql_val(p['vac'])}, "
                    f"{sql_val(scale_x)}, {sql_val(scale_y)}, "
                    f"{sql_val(temperature)}, {sql_val(humidity)}, {sql_val(thickness)}, "
                    f"{sql_val(board)}, {sql_val(total_board)}, {sql_val(total_time)}, "
                    f"{sql_val(not stopped)}, {sql_val(p['scale_mode'], True)}, "
                    f"{sql_val(pe_vals[0])}, {sql_val(pe_vals[1])}, {sql_val(pe_vals[2])}, "
                    f"{sql_val(pe_vals[3])}, {sql_val(pe_vals[4])}, {sql_val(pe_vals[5])}, "
                    f"{sql_val(je_vals[0])}, {sql_val(je_vals[1])}, {sql_val(je_vals[2])}, "
                    f"{sql_val(je_vals[3])}, "
                    f"{sql_val(p['pe_setting'])}, {sql_val(p['je_setting'])})"
                )
                batch.append(row)
                total_rows += 1

                if len(batch) >= BATCH_SIZE:
                    f.write(f"INSERT INTO public.ldi_data ({col_str}) VALUES\n")
                    f.write(",\n".join(batch))
                    f.write(";\n")
                    batch = []

                if len(alarm_batch) >= BATCH_SIZE:
                    f.write("INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process) VALUES\n")
                    f.write(",\n".join(alarm_batch))
                    f.write(";\n")
                    total_alarms += len(alarm_batch)
                    alarm_batch = []

            if batch:
                f.write(f"INSERT INTO public.ldi_data ({col_str}) VALUES\n")
                f.write(",\n".join(batch))
                f.write(";\n")
            if alarm_batch:
                f.write("INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process) VALUES\n")
                f.write(",\n".join(alarm_batch))
                f.write(";\n")
                total_alarms += len(alarm_batch)

    print(f"\nGenerated {total_rows:,} telemetry rows + {total_alarms:,} alarms")
    print(f"   Output: {OUTPUT_SQL}")
    size_mb = os.path.getsize(OUTPUT_SQL) / (1024 * 1024)
    print(f"   File size: {size_mb:.1f} MB")


if __name__ == '__main__':
    generate()
    print("Done.")
