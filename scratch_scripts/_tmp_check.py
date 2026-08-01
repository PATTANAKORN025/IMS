import json
with open('c:/Projects/IMS/.gemini/antigravity/brain/2fe0384c-962c-40e4-b353-01d67fd3e995/scratch/queries.json', 'r', encoding='utf-8') as f:
    queries = json.load(f)
for q in queries:
    if q['panel'] == 'RAM Usage Trend (30-Day Average)' or q['panel'] == 'Machine ID Match':
        print(f"Panel: {q['panel']}\nSQL: {q['sql']}\n")
