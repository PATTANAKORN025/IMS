import re

with open('README.md', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('5 dashboards', '9 dashboards')
text = text.replace('4 cyberpunk HUD dashboards', '9 cyberpunk HUD dashboards')
text = text.replace('Grafana 11', 'Grafana 13.1.1')

# Fix panel counts
text = text.replace('| **NOC Overview** | 15 |', '| **NOC Overview** | 11 |')
text = text.replace('| **Engineering Drill-Down** | 25 |', '| **Engineering Drill-Down** | 19 |')
text = text.replace('| **Capacity Planning** | 16 |', '| **Capacity Planning** | 12 |')
text = text.replace('| **Meta-Monitoring** | 15 |', '| **Meta-Monitoring** | 11 |')

# Add missing 5 LDI dashboards
ldi_rows = '''| **LDI Engineering Analytics** | 14 | Deep dive analytics for LDI yield and machine performance |
| **LDI Machine Snapshot** | 13 | Real-time state of an individual LDI machine (recipes, temperatures) |
| **LDI Manufacturing** | 17 | Production metrics, output rates, and manufacturing floor status |
| **LDI Operator Andon** | 8 | Simple visual alerts and call-for-help screens for operators |
| **LDI Data Readiness** | 12 | Verification of data ingestion completeness and pipeline health |'''

if 'LDI Operator Andon' not in text:
    text = text.replace('| **Meta-Monitoring** | 11 | Pipeline throughput, deadman alerts, circuit breaker state, device poll rates |', '| **Meta-Monitoring** | 11 | Pipeline throughput, deadman alerts, circuit breaker state, device poll rates |\n' + ldi_rows)

with open('README.md', 'w', encoding='utf-8') as f:
    f.write(text)
print('README updated')
