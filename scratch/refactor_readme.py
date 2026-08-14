import os
import re

def get_header(lang):
    title = "INDUSTRIAL MONITORING SYSTEM (IMS)"
    desc = "High-Precision Manufacturing Telemetry & Statistical Process Control"
    sub_desc = "Zero-Latency Digital Twin Architecture for 1,000+ Nodes"
    
    if lang == "TH":
        desc = "ระบบโทรมาตรความแม่นยำสูงสำหรับการผลิตและควบคุมกระบวนการทางสถิติ"
        sub_desc = "สถาปัตยกรรม Digital Twin แบบไร้รอยต่อสำหรับโหนด 1,000+"
    elif lang == "ZH":
        desc = "高精度制造遥测与统计过程控制"
        sub_desc = "支持 1,000+ 节点的零延迟数字孪生架构"

    return f"""<div align="center">
  <img src="assets/ims-logo.jpg" alt="IMS Logo" width="160" style="border-radius: 20%; box-shadow: 0 10px 30px rgba(0, 242, 254, 0.4);" />
  <h1 align="center" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 2px;">{title}</h1>
</div>

<div align="center">
  <p>
    <a href="README.md">🇬🇧 <b>English</b></a> &nbsp;•&nbsp;
    <a href="README-th.md">🇹🇭 <b>ไทย</b></a> &nbsp;•&nbsp;
    <a href="README-zh-CN.md">🇨🇳 <b>中文</b></a>
  </p>
</div>

<div align="center">
  <blockquote>
    <b>{desc}</b><br/>
    <i>{sub_desc}</i>
  </blockquote>
</div>

<div align="center">
  <!-- Status Badges -->
  <a href="https://github.com/PATTANAKORN025/IMS/releases"><img src="https://img.shields.io/badge/Release-v1.0-00F2FE?style=for-the-badge&logo=github&logoColor=white" alt="Release"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-00F2FE?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License"/></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Build-100%25_Passing-10B981?style=for-the-badge&logo=githubactions&logoColor=white" alt="Build" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/K6_Stress_Test-Passed-7B61FF?style=for-the-badge&logo=k6&logoColor=white" alt="K6" /></a>
  <br/>
  <!-- Tech Badges -->
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/></a>
  <a href="https://nodered.org/"><img src="https://img.shields.io/badge/Node--RED-v4.x-8F0000?style=for-the-badge&logo=nodered&logoColor=white" alt="Node-RED"/></a>
  <a href="https://www.timescale.com/"><img src="https://img.shields.io/badge/TimescaleDB-2.x-F59E0B?style=for-the-badge&logo=postgresql&logoColor=white" alt="TimescaleDB"/></a>
  <a href="https://grafana.com/"><img src="https://img.shields.io/badge/Grafana-v11+-F46800?style=for-the-badge&logo=grafana&logoColor=white" alt="Grafana"/></a>
</div>

<br/>

<div align="center">
  <table style="border:none; border-collapse:collapse;">
    <tr>
      <td align="center" style="padding: 10px; border:none;">
        <a href="docs/architecture/IMS_PLATFORM_BOOK.md"><img src="https://img.shields.io/badge/ENTER_PLATFORM_BOOK-030407?style=for-the-badge&logo=gitbook&logoColor=00F2FE&labelColor=030407&color=00F2FE"></a>
      </td>
      <td align="center" style="padding: 10px; border:none;">
        <a href="docs/architecture/ARCHITECTURE.md"><img src="https://img.shields.io/badge/READ_ARCHITECTURE-030407?style=for-the-badge&logo=amazonaws&logoColor=10B981&labelColor=030407&color=10B981"></a>
      </td>
    </tr>
  </table>
</div>

<br/>"""

def get_grid():
    return """<table style="border:none; border-collapse:collapse; width:100%;">
<tr>
<td align="center" style="border:none; padding:12px; width:33%; vertical-align: top;">
 <img src="assets/noc-overview.png" alt="NOC Overview" width="100%" style="border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);" /><br/><br/>
 <kbd>NOC Overview</kbd><br/><sub>Fleet Health Envelope</sub>
</td>
<td align="center" style="border:none; padding:12px; width:33%; vertical-align: top;">
 <img src="assets/engineering-drilldown.png" alt="Engineering Drill-Down" width="100%" style="border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);" /><br/><br/>
 <kbd>Engineering Drill-Down</kbd><br/><sub>Per-Machine Diagnostics</sub>
</td>
<td align="center" style="border:none; padding:12px; width:33%; vertical-align: top;">
 <img src="assets/capacity-planning.png" alt="Capacity Planning" width="100%" style="border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);" /><br/><br/>
 <kbd>Capacity Planning</kbd><br/><sub>Predictive Forecasting</sub>
</td>
</tr>
<tr>
<td align="center" style="border:none; padding:12px; width:33%; vertical-align: top;">
 <img src="assets/ldi-manufacturing.png" alt="LDI Command Center" width="100%" style="border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);" /><br/><br/>
 <kbd>LDI Manufacturing</kbd><br/><sub>Command Center</sub>
</td>
<td align="center" style="border:none; padding:12px; width:33%; vertical-align: top;">
 <img src="assets/ldi-andon.png" alt="Operator Andon Board" width="100%" style="border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);" /><br/><br/>
 <kbd>Operator Andon</kbd><br/><sub>Real-time Alerts</sub>
</td>
<td align="center" style="border:none; padding:12px; width:33%; vertical-align: top;">
 <img src="assets/ldi-data-readiness.png" alt="Data Readiness Matrix" width="100%" style="border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);" /><br/><br/>
 <kbd>Data Readiness Matrix</kbd><br/><sub>SPC Data Completeness</sub>
</td>
</tr>
</table>"""

files_to_process = {
    'README.md': ('EN', '## System Overview'),
    'README-th.md': ('TH', '## ภาพรวมของระบบ (System Overview)'),
    'README-zh-CN.md': ('ZH', '## 系统概述 (System Overview)')
}

for filename, (lang, delimiter) in files_to_process.items():
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Replace everything from start up to System Overview
    parts = content.split(delimiter)
    if len(parts) == 2:
        new_content = get_header(lang) + "\n" + delimiter + parts[1]
    else:
        continue
    
    # 2. Replace the HTML table grid with the new grid
    # We find the table using regex
    table_pattern = re.compile(r'<table.*?>.*?</table>', re.DOTALL)
    new_content = table_pattern.sub(get_grid(), new_content)
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated {filename}")
