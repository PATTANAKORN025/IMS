import json
with open('c:/Projects/IMS/nodered_data/scratch_sql.txt', 'r', encoding='utf-8') as f:
    text = f.read()
    print('date_bin count:', text.count('date_bin'))
    print('bucket AS time count:', text.count('bucket AS time'))
