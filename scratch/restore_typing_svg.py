import os
import re
import urllib.parse

def get_header(lang):
    title = "INDUSTRIAL MONITORING SYSTEM (IMS)"
    
    lines = [
        "High-Precision Manufacturing Telemetry",
        "Statistical Process Control",
        "Zero-Latency Digital Twin Architecture",
        "1000+ Node Fleet Health Envelope"
    ]
    
    if lang == "TH":
        lines = [
            "ระบบโทรมาตรการผลิตความแม่นยำสูง",
            "การควบคุมกระบวนการทางสถิติ (SPC)",
            "สถาปัตยกรรม Digital Twin ไร้รอยต่อ",
            "ตรวจสอบโหนดโครงสร้างพื้นฐานกว่า 1000+"
        ]
    elif lang == "ZH":
        lines = [
            "高精度制造遥测系统",
            "统计过程控制 (SPC)",
            "零延迟数字孪生架构",
            "1000+ 节点集群健康监控"
        ]

    encoded_lines = ";".join([urllib.parse.quote(line) for line in lines])

    return f"""<div align="center">
  <br/>
  <img src="assets/ims-logo.jpg" alt="IMS Logo" width="130" style="border-radius: 24px; box-shadow: 0 12px 40px rgba(0, 242, 254, 0.4);" />
  <h1 align="center" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 4px; margin-top: 24px; margin-bottom: 8px;">{title}</h1>
</div>

<div align="center">
  <a href="https://git.io/typing-svg"><img src="https://readme-typing-svg.demolab.com?font=Orbitron&weight=600&size=22&duration=4000&pause=2000&color=00F2FE&center=true&repeat=true&width=800&height=50&lines={encoded_lines}" alt="Typing SVG" /></a>
</div>

<div align="center">
  <p style="font-size: 14px; margin-top: -10px;">
    <a href="README.md" style="text-decoration: none;">🇬🇧 <b>English</b></a> &nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;
    <a href="README-th.md" style="text-decoration: none;">🇹🇭 <b>ไทย</b></a> &nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;
    <a href="README-zh-CN.md" style="text-decoration: none;">🇨🇳 <b>中文</b></a>
  </p>
</div>

<br/>

<div align="center">
  <!-- Minimalist Essential Badges -->
  <a href="https://github.com/PATTANAKORN025/IMS/releases"><img src="https://img.shields.io/badge/Release-v1.0-00F2FE?style=for-the-badge&logo=github&logoColor=white" alt="Release"/></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Build-100%25_Passing-10B981?style=for-the-badge&logo=githubactions&logoColor=white" alt="Build" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/K6_Stress_Test-Passed-7B61FF?style=for-the-badge&logo=k6&logoColor=white" alt="K6" /></a>
  <br/><br/>
  <!-- Elegant Call to Action Buttons -->
  <a href="docs/architecture/IMS_PLATFORM_BOOK.md"><img src="https://img.shields.io/badge/ENTER_PLATFORM_BOOK-030407?style=for-the-badge&logo=gitbook&logoColor=00F2FE&labelColor=030407&color=00F2FE"></a>
  &nbsp;
  <a href="docs/architecture/ARCHITECTURE.md"><img src="https://img.shields.io/badge/READ_ARCHITECTURE-030407?style=for-the-badge&logo=amazonaws&logoColor=10B981&labelColor=030407&color=10B981"></a>
</div>

<br/>
<hr style="height: 1px; border: none; background: linear-gradient(to right, transparent, rgba(59, 130, 246, 0.5), transparent);" />
<br/>"""

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
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Restored typing SVG and decluttered {filename}")
