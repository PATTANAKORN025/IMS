import os
import re

def get_header(lang):
    title = "Industrial Monitoring System (IMS)"
    desc = "High-Precision Manufacturing Telemetry & Statistical Process Control"
    
    if lang == "TH":
        desc = "ระบบโทรมาตรความแม่นยำสูงสำหรับการผลิตและควบคุมกระบวนการทางสถิติ"
    elif lang == "ZH":
        desc = "高精度制造遥测与统计过程控制"

    return f"""<div align="center">
  <img src="assets/meowrch.png" alt="IMS Logo" width="120" style="margin-bottom: 16px;" />
</div>

<h1 align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; letter-spacing: -0.5px;">{title}</h1>

<div align="center">
  <p style="font-size: 15px; color: #6B7280;">
    <a href="README.md" style="text-decoration: none;">🇬🇧 <b>English</b></a> &nbsp;&nbsp;|&nbsp;&nbsp;
    <a href="README-th.md" style="text-decoration: none;">🇹🇭 <b>ไทย</b></a> &nbsp;&nbsp;|&nbsp;&nbsp;
    <a href="README-zh-CN.md" style="text-decoration: none;">🇨🇳 <b>中文</b></a>
  </p>
</div>

<div align="center" style="margin: 24px 0;">
  <strong style="font-size: 18px; font-weight: 500;">{desc}</strong>
</div>

<div align="center">
  <a href="https://git.io/typing-svg"><img src="https://readme-typing-svg.demolab.com?font=Orbitron&weight=600&size=36&duration=4000&pause=2000&color=00F2FE&center=true&repeat=true&width=1000&height=60&lines=APEX+Circuit+IMS+|+System+Initializing...;Advanced+Manufacturing+Intelligence+%26+NOC;Zero-Latency+Digital+Twin+Architecture" alt="Typing SVG" /></a>
</div>

<br/>

<div align="center">
  <!-- Status Badges -->
  <a href="https://github.com/PATTANAKORN025/IMS/releases"><img src="https://img.shields.io/badge/Release-v1.0-030407?style=flat-square&logo=github&logoColor=10B981" alt="Release"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-030407?style=flat-square&logo=opensourceinitiative&logoColor=00F2FE" alt="License"/></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Build-Passing-10B981?style=flat-square&logoColor=white" alt="Tests" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/K6_Stress_Test-Passed-030407?style=flat-square&logo=k6&logoColor=7B61FF" alt="K6" /></a>
  <br/><br/>
  <!-- Tech Badges -->
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Ready-030407?style=flat-square&logo=docker&logoColor=2496ED" alt="Docker"/></a>
  <a href="https://grafana.com/"><img src="https://img.shields.io/badge/Grafana-v11+-030407?style=flat-square&logo=grafana&logoColor=F46800" alt="Grafana"/></a>
  <a href="https://nodered.org/"><img src="https://img.shields.io/badge/Node--RED-v4+-030407?style=flat-square&logo=nodered&logoColor=8F0000" alt="Node-RED"/></a>
  <a href="https://www.timescale.com/"><img src="https://img.shields.io/badge/TimescaleDB-2.x-030407?style=flat-square&logo=postgresql&logoColor=F59E0B" alt="TimescaleDB"/></a>
</div>

<br/>

<div align="center">
  <table style="border:none; border-collapse:collapse; background: transparent;">
    <tr>
      <td align="center" style="padding: 8px; border:none;">
        <a href="docs/architecture/IMS_PLATFORM_BOOK.md"><img src="https://img.shields.io/badge/PLATFORM_BOOK-ENTER-blue?color=00F2FE&labelColor=030407&style=flat-square"></a>
      </td>
      <td align="center" style="padding: 8px; border:none;">
        <a href="docs/architecture/ARCHITECTURE.md"><img src="https://img.shields.io/badge/ARCHITECTURE-READ-blue?color=10B981&labelColor=030407&style=flat-square"></a>
      </td>
    </tr>
  </table>
</div>

<br/>
<hr style="height: 1px; border: none; background: #E5E7EB;" />
<br/>"""

def get_grid():
    return """<table style="border:none; border-collapse:collapse; width:100%;">
<tr>
<td align="center" style="border:none; padding:16px; width:50%; vertical-align: top;">
 <img src="assets/noc-overview.png" alt="NOC Overview" width="100%" style="border-radius:12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);" /><br/><br/>
 <b style="font-size: 15px;">Global NOC Overview</b><br/><sub style="color: #6B7280;">Real-time Fleet Health Envelope</sub>
</td>
<td align="center" style="border:none; padding:16px; width:50%; vertical-align: top;">
 <img src="assets/ldi-manufacturing.png" alt="LDI Command Center" width="100%" style="border-radius:12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);" /><br/><br/>
 <b style="font-size: 15px;">LDI Manufacturing</b><br/><sub style="color: #6B7280;">Production Command Center</sub>
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
    
    parts = content.split(delimiter)
    if len(parts) >= 2:
        new_content = get_header(lang) + "\n" + delimiter + parts[1]
    
    grid_pattern = re.compile(r'<table.*?>.*?</table>', re.DOTALL)
    new_content = grid_pattern.sub(get_grid(), new_content, count=1)
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Minimalist applied to {filename}")
