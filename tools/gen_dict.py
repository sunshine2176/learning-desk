#!/usr/bin/env python3
"""从 data/dictation.json 生成 web/dict.js（听写词表唯一真源是 data/dictation.json）

每课 words 会同时汇总到 units[].words，保证旧逻辑仍可用。
"""
import json, os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(BASE, 'data', 'dictation.json')
dst = os.path.join(BASE, 'web', 'dict.js')

d = json.load(open(src, encoding='utf-8'))

total = 0
for u in d.get('units', []):
    flat = []
    for ls in u.get('lessons', []):
        flat.extend(ls.get('words', []))
    u['words'] = flat
    total += len(flat)

with open(dst, 'w', encoding='utf-8') as f:
    f.write("/* dict.js — 听写词表。由 tools/gen_dict.py 从 data/dictation.json 生成，勿手改。 */\n")
    f.write("window.DICT = ")
    f.write(json.dumps(d, ensure_ascii=False, indent=2))
    f.write(";\n")

print(f"生成 {dst}：{len(d['units'])} 个单元 {total} 个词")
for u in d['units']:
    print(f"  {u['id']} {u['name'][:22]}… {len(u['words'])} 词 / {len(u['lessons'])} 课")
