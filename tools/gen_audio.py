#!/usr/bin/env python3
"""生成听写词的发音音频：data/dictation.json → web/audio/*.mp3 + web/audio/index.js

为什么不用浏览器自带朗读：
  speechSynthesis 走系统 TTS（iPad 上是 Ting-Ting），单念一个双字词时
  音节糊在一起，"勺子 / 秋千 / 转动"这类词孩子根本听不出来。
  改成预生成神经 TTS 音频（微软 Edge 的 zh-CN 声音），静态托管：
  清晰度稳定、离线可缓存、每次播放完全一致，也不花一分钱 API 费。

用法：
  python3 tools/gen_audio.py                  # 全量生成（已存在的跳过）
  python3 tools/gen_audio.py --force          # 全部重生成
  python3 tools/gen_audio.py --voice zh-CN-YunyangNeural
  python3 tools/gen_audio.py --check          # 只检查缺哪些，不生成
"""
import argparse
import asyncio
import json
import os
import sys

try:
    import edge_tts
except ImportError:
    sys.exit('需要 edge-tts：pip3 install edge-tts')

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, 'data', 'dictation.json')
OUT = os.path.join(BASE, 'web', 'audio')
MAP_JS = os.path.join(OUT, 'index.js')

DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'
RATE = '-8%'      # 比默认稍慢，给孩子反应时间
CONCURRENCY = 3   # 太高会被服务端限流


def all_words():
    """按课本顺序收集词，（词 → 文件名）去重"""
    with open(SRC, encoding='utf-8') as f:
        d = json.load(f)
    seen, words = set(), []
    for u in d.get('units', []):
        for l in u.get('lessons', []) or []:
            for w in l.get('words', []) or []:
                w = w.strip()
                if w and w not in seen:
                    seen.add(w)
                    words.append(w)
        for w in u.get('words', []) or []:   # 老格式兜底
            w = w.strip()
            if w and w not in seen:
                seen.add(w)
                words.append(w)
    return words


async def one(text, path, voice, sem, tries=3):
    async with sem:
        for i in range(tries):
            try:
                c = edge_tts.Communicate(text, voice, rate=RATE)
                await c.save(path)
                if os.path.getsize(path) > 1200:
                    return True, ''
                err = '文件太小'
            except Exception as e:      # 网络抖动重试
                err = type(e).__name__ + ': ' + str(e)[:80]
            await asyncio.sleep(1.2 * (i + 1))
        return False, err


async def run(force, voice):
    words = all_words()
    os.makedirs(OUT, exist_ok=True)
    sem = asyncio.Semaphore(CONCURRENCY)
    mapping, todo = {}, []
    for i, w in enumerate(words):
        name = 'd%03d' % i
        mapping[w] = name
        p = os.path.join(OUT, name + '.mp3')
        if force or not os.path.exists(p) or os.path.getsize(p) < 1200:
            todo.append((w, p))

    print('共 %d 个词，需要生成 %d 个' % (len(words), len(todo)))
    fails = []
    done = 0
    for chunk in range(0, len(todo), 20):
        batch = todo[chunk:chunk + 20]
        res = await asyncio.gather(*[one(w, p, voice, sem) for w, p in batch])
        for (w, p), (ok, err) in zip(batch, res):
            if ok:
                done += 1
            else:
                fails.append((w, err))
        print('  进度 %d/%d' % (min(chunk + 20, len(todo)), len(todo)), flush=True)

    with open(MAP_JS, 'w', encoding='utf-8') as f:
        f.write('/* 由 tools/gen_audio.py 生成，勿手改 */\n')
        f.write('window.AUDIO_MAP = ')
        f.write(json.dumps(mapping, ensure_ascii=False, separators=(',', ':')))
        f.write(';\n')

    total = sum(os.path.getsize(os.path.join(OUT, n + '.mp3'))
                for n in mapping.values()
                if os.path.exists(os.path.join(OUT, n + '.mp3')))
    print('生成 %d 个，失败 %d 个；音频合计 %.1f MB' % (done, len(fails), total / 1048576))
    for w, e in fails[:10]:
        print('  失败:', w, e)
    return 1 if fails else 0


def check():
    words = all_words()
    missing = []
    for i, w in enumerate(words):
        p = os.path.join(OUT, 'd%03d.mp3' % i)
        if not os.path.exists(p) or os.path.getsize(p) < 1200:
            missing.append(w)
    print('共 %d 个词，缺 %d 个' % (len(words), len(missing)))
    if missing:
        print('缺:', ' '.join(missing[:30]))
    return 0 if not missing else 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--voice', default=DEFAULT_VOICE)
    a = ap.parse_args()
    if a.check:
        sys.exit(check())
    sys.exit(asyncio.run(run(a.force, a.voice)))
