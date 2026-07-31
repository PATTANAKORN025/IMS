import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import random
import os

# Set random seed for reproducibility
np.random.seed(42)
random.seed(42)

# --- Configuration ---
MACHINES = ["LDI-01", "LDI-02", "LDI-03", "LDI-04", "LDI-05", "LDI-06"]
START_TIME = datetime.now() - timedelta(days=14)
END_TIME = datetime.now()
INTERVAL_SEC = 10
TOTAL_STEPS = int((END_TIME - START_TIME).total_seconds() / INTERVAL_SEC)

# Paths for output (in postgres/init)
OUTPUT_MOCK_SQL = os.path.abspath(os.path.join(os.path.dirname(__file__), '../postgres/init/034-ldi-statistical-mock.sql'))
OUTPUT_ALARM_SQL = os.path.abspath(os.path.join(os.path.dirname(__file__), '../postgres/init/036-alarm-master-synthetic.sql'))

# Synthetic Alarms Dictionary (IP Safe)
ALARM_CODES = {
    1000: {"msg": "Laser Diode Temp Warning", "type": "Warning"},
    1001: {"msg": "Laser Diode Temp Critical", "type": "Critical"},
    2000: {"msg": "Positioning Error X-Axis", "type": "Critical"},
    2001: {"msg": "Positioning Error Y-Axis", "type": "Critical"},
    3000: {"msg": "Vacuum Pressure Low", "type": "Warning"},
    4000: {"msg": "Joule Effect Variance", "type": "Warning"},
    5000: {"msg": "General Machine Fault", "type": "Critical"},
}

def generate_alarms_master():
    lines = [
        "-- ══════════════════════════════════════════════════════════════════",
        "-- SYNTHETIC ALARM MASTER — AUTO-GENERATED (DIGITAL TWIN)",
        "-- ══════════════════════════════════════════════════════════════════",
        "TRUNCATE TABLE public.ldi_alarm_ms_code;",
        "INSERT INTO public.ldi_alarm_ms_code (alarm_code, alarm_msg, alarm_type, eqp_type, process) VALUES"
    ]
    
    values = []
    for code, details in ALARM_CODES.items():
        values.append(f"({code}, '{details['msg']}', '{details['type']}', 'LDI', 'EXPOSURE')")
    
    lines.append(",\n".join(values) + ";\n")
    
    with open(OUTPUT_ALARM_SQL, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines))
    print(f"Generated {OUTPUT_ALARM_SQL}")


def generate_telemetry():
    print(f"Generating telemetry for {len(MACHINES)} machines over {TOTAL_STEPS} steps...")
    
    # Pre-calculate time series
    time_series = [START_TIME + timedelta(seconds=i*INTERVAL_SEC) for i in range(TOTAL_STEPS)]
    
    data_sql_lines = [
        "-- ══════════════════════════════════════════════════════════════════",
        "-- SYNTHETIC TELEMETRY (LDI_DATA) — AUTO-GENERATED (DIGITAL TWIN)",
        "-- ══════════════════════════════════════════════════════════════════",
        "TRUNCATE TABLE public.ldi_data;",
        "TRUNCATE TABLE public.ldi_alarm_log;"
    ]
    
    alarm_sql_lines = []
    
    for machine in MACHINES:
        # Base distributions
        # Machine state: 0 = RUNNING, 1 = DEGRADED, 2 = FAULT
        state = 0
        degradation_counter = 0
        
        # We will batch inserts to avoid massive memory usage or huge SQL lines
        batch_size = 5000
        current_batch = []
        current_alarms = []
        
        log_id = 1000
        
        for i in range(TOTAL_STEPS):
            t = time_series[i]
            
            # State Transitions
            if state == 0:
                if random.random() < 0.0001:  # 0.01% chance to degrade per 10s
                    state = 1
                    degradation_counter = random.randint(100, 500)
            elif state == 1:
                degradation_counter -= 1
                if degradation_counter <= 0:
                    state = 2  # Fault
                    fault_counter = random.randint(30, 180) # Down for 5-30 minutes
                    
                    # Trigger Critical Alarm
                    alarm_code = random.choice([1001, 2000, 2001, 5000])
                    current_alarms.append(f"('{machine}_{t.strftime('%Y%m%d%H%M%S')}', '{t.strftime('%Y-%m-%d %H:%M:%S')}', '{alarm_code}', '{t.strftime('%Y-%m-%d %H:%M:%S')}', '{machine}', 'F', 'EXPOSURE')")
            elif state == 2:
                fault_counter -= 1
                if fault_counter <= 0:
                    state = 0 # Repaired
            
            # Telemetry logic
            if state == 0:
                pe_1 = np.random.normal(0, 1.5)  # Normal distribution, target 0, stddev 1.5
                temp = np.random.normal(22.0, 0.5)
                air_vac = np.random.normal(0.8, 0.05)
                je = np.random.normal(450.0, 10.0)
                is_running = True
            elif state == 1:
                pe_1 = np.random.normal(5, 4.0)  # Drift and high variance
                temp = np.random.normal(24.5, 1.5)
                air_vac = np.random.normal(0.6, 0.1)
                je = np.random.normal(400.0, 25.0)
                is_running = True
                
                # Chance of warning alarm
                if random.random() < 0.05:
                    alarm_code = random.choice([1000, 3000, 4000])
                    current_alarms.append(f"('{machine}_{t.strftime('%Y%m%d%H%M%S')}', '{t.strftime('%Y-%m-%d %H:%M:%S')}', '{alarm_code}', '{t.strftime('%Y-%m-%d %H:%M:%S')}', '{machine}', 'F', 'EXPOSURE')")
            else:
                pe_1 = 0
                temp = np.random.normal(20.0, 0.1)
                air_vac = 0
                je = 0
                is_running = False
                
            # Formatting values for ldi_data
            # We map: eqp_id, time, pe_1, pe_setting, air_vacuum, resist_dosage, scale_x, scale_y, je_1, state
            # The schema has 34 columns. We will provide the most critical ones for the dashboard.
            val = f"('log_{machine}_{i}', '{t.strftime('%Y-%m-%d %H:%M:%S')}', '{machine}', 'F', 'EXPOSURE', 'MO-1000', 'L-01', {is_running}, {pe_1:.3f}, 0, {air_vac:.3f}, 120, 1.0, 1.0, {je:.3f})"
            current_batch.append(val)
            
            if len(current_batch) >= batch_size:
                data_sql_lines.append(f"INSERT INTO public.ldi_data (log_id, \"time\", eqp_id, factory, process, mo, layer_name, state, pe_1, pe_setting, air_vacuum, resist_dosage, scale_x, scale_y, je_1) VALUES\n" + ",\n".join(current_batch) + ";")
                current_batch = []
            
            if len(current_alarms) >= batch_size:
                alarm_sql_lines.append(f"INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process) VALUES\n" + ",\n".join(current_alarms) + ";")
                current_alarms = []

        if current_batch:
            data_sql_lines.append(f"INSERT INTO public.ldi_data (log_id, \"time\", eqp_id, factory, process, mo, layer_name, state, pe_1, pe_setting, air_vacuum, resist_dosage, scale_x, scale_y, je_1) VALUES\n" + ",\n".join(current_batch) + ";")
        if current_alarms:
            alarm_sql_lines.append(f"INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process) VALUES\n" + ",\n".join(current_alarms) + ";")
            
    with open(OUTPUT_MOCK_SQL, 'w', encoding='utf-8') as f:
        f.write("\n".join(data_sql_lines))
        f.write("\n\n-- ALARM LOG DATA\n")
        f.write("\n".join(alarm_sql_lines))
        
    print(f"Generated {OUTPUT_MOCK_SQL}")

if __name__ == '__main__':
    generate_alarms_master()
    generate_telemetry()
    print("Done.")
