
import os

informal_words = ['อ่ะ', 'เค้า', 'ดุ้นๆ', 'ถีบทิ้ง', 'ก้อ', 'แหล่ะ', 'ลีลาระดับ', 'เอ๊งเลย', 'บัก', 'ซะ', 'ล่ะ', 'ดื้อๆ']

def scan_file(filepath):
    print(f'--- Scanning {filepath} ---')
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    for i, line in enumerate(lines):
        for word in informal_words:
            if word in line:
                print(f'Line {i+1}: {line[:150]}...')
                break

scan_file('docs/architecture/ARCHITECTURE-th.md')
scan_file('docs/admin/ADMIN_MANUAL.md')

