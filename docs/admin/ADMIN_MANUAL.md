# 🛠️ System Administration & SRE Guide

Documentation for MIS-G team (IT Support / DevOps) for managing the APEX Circuit Monitoring System.

## 1. Infrastructure Management (Docker Management)
The entire system runs on Docker Compose. Frequently used commands include:

```bash
# Check the status of all services to see if they are 'Up'
docker-compose ps

# Restart only a specific service (e.g., pgbouncer)
docker-compose restart pgbouncer

# View Real-time Log (Last 50 lines) — Use when data is not being entered
docker logs -f --tail 50 node-red
```

## 2. Adding New Machines
Add the actual machine IP addresses to the system's Master List database. Node-RED will query the new IP list and automatically retrieve data in the next 10 seconds.

**For testing:** To add a custom OID, edit the Simulator file:
- **File:** `monitoring/snmpsim/Netk@.snmprec`
- **Format:**
```
1.3.6.1.4.1.9999.1.x.x|2:numeric|min=0,max=100,random=true
```

**Restart SNMPSim:**
```bash
docker restart ims-snmpsim
```

## 3. Alert Rule Configuration (Alert Settings)
Alert conditions are written in PromQL in the `monitoring/prometheus/rules/ims-alerts.yml` file.

**Example of modifying the Threshold value of Wi-Fi Signal Degradation:**
```yaml
- alert: WiFi_Signal_Degradation
  # To change from 50 drops to 100 drops, modify the number below:
  expr: rate(network_rx_drops{interface="wlan0"}[5m]) > 100
  for: 2m
  labels:
    severity: warning
```

> 💡 **Note:** After modifying the `.yml` file, you must reload Prometheus with the command:
> ```bash
> curl -X POST http://localhost:9090/-/reload
> ```

## 4. Troubleshooting Guide (Popular Solutions)

| Symptoms | Possible Root Cause | Solution (Resolution) |
|----------|---------------------|----------------------|
| Grafana graph shows No Data | PgBouncer running at full limit or database crash | Run `docker restart ims-pgbouncer` and check disk space |
| Alert not popping up in LINE/Teams | Alertmanager Webhook disconnected | Check Node-RED log for errors in `POST/alert-webhook` node |
| Bandwidth graph exceeds Tbps | 32-bit Counter Wrap | The SRE Parser system is handling it, but if still encountering issues, check if the device supports 64-bit HC (High Capacity) |
