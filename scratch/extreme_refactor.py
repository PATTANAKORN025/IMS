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
  <br/>
  <img src="assets/ims-logo.jpg" alt="IMS Logo" width="140" style="border-radius: 24px; box-shadow: 0 12px 40px rgba(0, 242, 254, 0.5);" />
  <h1 align="center" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 4px; margin-top: 20px;">{title}</h1>
</div>

<div align="center">
  <p style="font-size: 16px;">
    <a href="README.md">🇬🇧 <b>English</b></a> &nbsp;&nbsp;•&nbsp;&nbsp;
    <a href="README-th.md">🇹🇭 <b>ไทย</b></a> &nbsp;&nbsp;•&nbsp;&nbsp;
    <a href="README-zh-CN.md">🇨🇳 <b>中文</b></a>
  </p>
</div>

<br/>

<div align="center">
  <blockquote style="border-left: 4px solid #00F2FE; background: rgba(0, 242, 254, 0.05); padding: 16px; border-radius: 8px;">
    <b style="font-size: 18px;">{desc}</b><br/>
    <i style="color: #10B981;">{sub_desc}</i>
  </blockquote>
</div>

<br/>

<div align="center">
  <!-- Status Badges -->
  <a href="https://github.com/PATTANAKORN025/IMS/releases"><img src="https://img.shields.io/badge/Release-v1.0-00F2FE?style=for-the-badge&logo=github&logoColor=white" alt="Release"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-00F2FE?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License"/></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Build-100%25_Passing-10B981?style=for-the-badge&logo=githubactions&logoColor=white" alt="Build" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/K6_Stress_Test-Passed-7B61FF?style=for-the-badge&logo=k6&logoColor=white" alt="K6" /></a>
  <br/><br/>
  <!-- Tech Badges -->
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/></a>
  <a href="https://nodered.org/"><img src="https://img.shields.io/badge/Node--RED-v4.x-8F0000?style=for-the-badge&logo=nodered&logoColor=white" alt="Node-RED"/></a>
  <a href="https://www.timescale.com/"><img src="https://img.shields.io/badge/TimescaleDB-2.x-F59E0B?style=for-the-badge&logo=postgresql&logoColor=white" alt="TimescaleDB"/></a>
  <a href="https://grafana.com/"><img src="https://img.shields.io/badge/Grafana-v11+-F46800?style=for-the-badge&logo=grafana&logoColor=white" alt="Grafana"/></a>
</div>

<br/>

<div align="center">
  <table style="border:none; border-collapse:collapse; width: 600px;">
    <tr>
      <td align="center" style="padding: 10px; border:none; width: 50%;">
        <a href="docs/architecture/IMS_PLATFORM_BOOK.md"><img src="https://img.shields.io/badge/ENTER_PLATFORM_BOOK-030407?style=for-the-badge&logo=gitbook&logoColor=00F2FE&labelColor=030407&color=00F2FE"></a>
      </td>
      <td align="center" style="padding: 10px; border:none; width: 50%;">
        <a href="docs/architecture/ARCHITECTURE.md"><img src="https://img.shields.io/badge/READ_ARCHITECTURE-030407?style=for-the-badge&logo=amazonaws&logoColor=10B981&labelColor=030407&color=10B981"></a>
      </td>
    </tr>
  </table>
</div>

<br/>
<hr style="height: 1px; border: none; background: linear-gradient(to right, transparent, #3B82F6, transparent);" />
<br/>"""

def get_grid():
    return """<div align="center">
  <img src="assets/noc-overview.png" alt="NOC Overview" width="95%" style="border-radius:16px; box-shadow: 0 16px 48px rgba(0,0,0,0.5);" />
  <br/><br/>
  <kbd style="font-size: 14px; padding: 4px 12px; background: rgba(0, 242, 254, 0.1); color: #00F2FE; border: 1px solid #00F2FE;">NOC Overview</kbd><br/>
  <sub style="color: #9CA3AF;">Flagship Fleet Health Envelope</sub>
</div>

<br/><br/>

<table style="border:none; border-collapse:collapse; width:100%;">
<tr>
<td align="center" style="border:none; padding:16px; width:50%; vertical-align: top;">
 <img src="assets/engineering-drilldown.png" alt="Engineering Drill-Down" width="100%" style="border-radius:12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);" /><br/><br/>
 <kbd>Engineering Drill-Down</kbd><br/><sub style="color: #9CA3AF;">Per-Machine Diagnostics</sub>
</td>
<td align="center" style="border:none; padding:16px; width:50%; vertical-align: top;">
 <img src="assets/ldi-manufacturing.png" alt="LDI Command Center" width="100%" style="border-radius:12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);" /><br/><br/>
 <kbd>LDI Manufacturing</kbd><br/><sub style="color: #9CA3AF;">Command Center</sub>
</td>
</tr>
<tr>
<td align="center" style="border:none; padding:16px; width:50%; vertical-align: top;">
 <img src="assets/capacity-planning.png" alt="Capacity Planning" width="100%" style="border-radius:12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);" /><br/><br/>
 <kbd>Capacity Planning</kbd><br/><sub style="color: #9CA3AF;">Predictive Forecasting</sub>
</td>
<td align="center" style="border:none; padding:16px; width:50%; vertical-align: top;">
 <img src="assets/ldi-andon.png" alt="Operator Andon Board" width="100%" style="border-radius:12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);" /><br/><br/>
 <kbd>Operator Andon</kbd><br/><sub style="color: #9CA3AF;">Real-time Line Alerts</sub>
</td>
</tr>
</table>"""

files_to_process = {
    'README.md': ('EN', '## System Overview'),
    'README-th.md': ('TH', '## ภาพรวมของระบบ (System Overview)'),
    'README-zh-CN.md': ('ZH', '## 系统概述')
}

for filename, (lang, delimiter) in files_to_process.items():
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Replace header
    parts = content.split(delimiter)
    if len(parts) == 2:
        new_content = get_header(lang) + "\n" + delimiter + parts[1]
    else:
        continue
    
    # 2. Replace Grid (Find the first table in the body after delimiter)
    # The first table should be the grid we want to replace
    grid_pattern = re.compile(r'<table.*?>.*?</table>', re.DOTALL)
    
    # We only want to replace the FIRST occurrence of the table, because there are other tables later.
    new_content = grid_pattern.sub(get_grid(), new_content, count=1)
    
    # 3. Inject Mermaid styling
    mermaid_injection = """```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#030407', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#3B82F6', 'lineColor': '#00F2FE', 'secondaryColor': '#1a1f2e', 'tertiaryColor': '#030407'}}}%%
flowchart LR"""
    new_content = new_content.replace('```mermaid\nflowchart LR', mermaid_injection)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Refactored {filename}")
