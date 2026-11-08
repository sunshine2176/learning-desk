#!/usr/bin/env python3
"""gen_english.py — 生成英语跟读句包的发音音频和前端数据。

- 读 data/english.json
- 每句用 edge-tts 生成 web/audio/eNNN.mp3（默认 en-US-AnaNeural 儿童声）
- 产出 web/english.js（window.ENGLISH），index.html 里引用

用法：
  python3 tools/gen_english.py           # 只生成缺的音频
  python3 tools/gen_english.py --force   # 全部重新生成（换音色后用）
  python3 tools/gen_english.py --check   # 只检查文件是否齐全
"""
import asyncio
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data', 'english.json')
AUDIO_DIR = os.path.join(ROOT, 'web', 'audio')
OUT_JS = os.path.join(ROOT, 'web', 'english.js')


def load():
    with open(DATA, encoding='utf-8') as f:
        return json.load(f)


def flat(d):
    out = []
    seq = 0
    for p in d['packs']:
        for s in p['s']:
            sid = 'e%03d' % seq
            out.append({**s, 'id': sid, 'pack': p['id']})
            seq += 1
    return out


def check(d, quiet=False):
    missing = [s['id'] for s in flat(d)
               if not os.path.exists(os.path.join(AUDIO_DIR, s['id'] + '.mp3'))]
    if not quiet:
        total = len(flat(d))
        print('音频 %d/%d 齐全' % (total - len(missing), total))
        if missing:
            print('缺:', ' '.join(missing))
    return missing


async def gen(d, force):
    import edge_tts
    voice, rate = d.get('voice', 'en-US-AnaNeural'), d.get('rate', '-4%')
    os.makedirs(AUDIO_DIR, exist_ok=True)
    todo = [s for s in flat(d) if force or not os.path.exists(os.path.join(AUDIO_DIR, s['id'] + '.mp3'))]
    print('生成 %d 句（%s %s）' % (len(todo), voice, rate))
    for i, s in enumerate(todo):
        path = os.path.join(AUDIO_DIR, s['id'] + '.mp3')
        for attempt in (1, 2, 3):
            try:
                await edge_tts.Communicate(s['text'], voice, rate=rate).save(path)
                break
            except Exception as e:
                if attempt == 3:
                    raise
                await asyncio.sleep(2 * attempt)
        if (i + 1) % 10 == 0 or i + 1 == len(todo):
            print('  %d/%d' % (i + 1, len(todo)))


def write_js(d):
    packs = []
    seq = 0
    for p in d['packs']:
        ss = []
        for s in p['s']:
            ss.append({'id': 'e%03d' % seq, 'text': s['text'], 'zh': s['zh'],
                       'audio': 'audio/e%03d.mp3' % seq})
            seq += 1
        packs.append({'id': p['id'], 'title': p['title'], 'frame': p.get('frame', ''), 's': ss})
    js = (
        '/* english.js — 由 tools/gen_english.py 生成，勿手改。改句子去 data/english.json 再重跑。 */\n'
        "window.ENGLISH = " + json.dumps({'packs': packs}, ensure_ascii=False, indent=2) + ";\n"
    )
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write(js)
    print('写出', os.path.relpath(OUT_JS, ROOT), '(%d 句)' % seq)


def main():
    d = load()
    if '--check' in sys.argv:
        missing = check(d)
        sys.exit(1 if missing else 0)
    asyncio.run(gen(d, '--force' in sys.argv))
    missing = check(d, quiet=True)
    if missing:
        print('生成失败:', ' '.join(missing))
        sys.exit(1)
    write_js(d)


if __name__ == '__main__':
    main()
