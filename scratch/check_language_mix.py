import os
import re

docs_dir = 'docs'
thai_pattern = re.compile(r'[\u0E00-\u0E7F]')
chinese_pattern = re.compile(r'[\u4E00-\u9FFF]')

for root, _, files in os.walk(docs_dir):
    for file in files:
        if file.endswith('.md'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Remove intentional cross-language links and currency symbols before checking
            content_cleaned = re.sub(r'\[🇹🇭 ไทย\]\(.*?\)', '', content)
            content_cleaned = re.sub(r'\[🇨🇳 中文\]\(.*?\)', '', content)
            content_cleaned = content_cleaned.replace('฿', '')
            
            has_thai = thai_pattern.search(content_cleaned) is not None
            has_chinese = chinese_pattern.search(content_cleaned) is not None
            
            if not file.endswith('-th.md') and not file.endswith('-zh-CN.md'):
                if has_thai:
                    print(f'ERROR: Thai text found in English file: {filepath}')
                if has_chinese:
                    print(f'ERROR: Chinese text found in English file: {filepath}')
            elif file.endswith('-th.md'):
                if has_chinese:
                    print(f'ERROR: Chinese text found in Thai file: {filepath}')
            elif file.endswith('-zh-CN.md'):
                if has_thai:
                    print(f'ERROR: Thai text found in Chinese file: {filepath}')
