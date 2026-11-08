#!/usr/bin/env python3
"""生成拼音练习题库：data/pinyin.json → web/pinyin.js

为什么要自己算变调：
  pypinyin 对「一/不」的处理不可靠（一个=yí 对，一天/一样/一起 都错），
  所以基础标音用 pypinyin，变调按《现代汉语词典》规则自己算。

内部统一用「声调编号」记音（yi2 ge4），生成选项时再转成带调符号（yí gè）。
这样 JS 侧做干扰项（改声调 / 换声母 / 换鼻韵母）时不用解析带调符号。
"""
import json
import os
import re
import sys

try:
    from pypinyin import pinyin, Style
except ImportError:
    sys.exit('需要 pypinyin：pip3 install pypinyin')

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, 'data', 'dictation.json')
DST_JSON = os.path.join(BASE, 'data', 'pinyin.json')
DST_JS = os.path.join(BASE, 'web', 'pinyin.js')

# ---------------------------------------------------------------- 基础标音

# pypinyin 在这些词上会错（多音字取错、轻声没标），手工订正
OVERRIDE = {
    '肚子': 'du4 zi5',        # pypinyin 给 dǔ
    '告诉': 'gao4 su5',
    '名字': 'ming2 zi5',
    '妈妈': 'ma1 ma5',
    '爸爸': 'ba4 ba5',
    '哥哥': 'ge1 ge5',
    '爷爷': 'ye2 ye5',
    '奶奶': 'nai3 nai5',
    '星星': 'xing1 xing5',
    '晚上': 'wan3 shang5',
    '地方': 'di4 fang5',
    '朋友': 'peng2 you5',
    '转动': 'zhuan4 dong4',   # 转动 = zhuàndòng
    # 儿化：合并成一个音节
    '一块儿': 'yi2 kuair4',
    '一点儿': 'yi4 dianr3',
    '一会儿': 'yi2 huir4',
    '哪儿': 'nar3',
}

TONE_MARK = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4}


def split_syl(s):
    """'zhang3' -> ('zhang', 3)；'er5' -> ('er', 5)"""
    m = re.match(r'^([a-zA-Zv]+)([1-5])$', s)
    if not m:
        return s, 5
    return m.group(1), int(m.group(2))


def join_syl(base, tone):
    return '%s%d' % (base, tone)


def apply_yi_bu(syls):
    """一 / 不 变调。只处理后面还有音节的情况。
    一：后字 4 声 → yí(2)；后字 1/2/3 声 → yì(4)；后字轻声 → yi(5)
    不：后字 4 声 → bú(2)；其余 bù(4)
    """
    out = list(syls)
    for i, s in enumerate(out):
        base, tone = split_syl(s)
        if base == 'yi' and tone == 1 and i + 1 < len(out):
            nb, nt = split_syl(out[i + 1])
            if nt == 4:
                out[i] = join_syl('yi', 2)
            elif nt in (1, 2, 3):
                out[i] = join_syl('yi', 4)
            elif nt == 5:
                out[i] = join_syl('yi', 5)
        elif base == 'bu' and tone == 4 and i + 1 < len(out):
            nb, nt = split_syl(out[i + 1])
            if nt == 4:
                out[i] = join_syl('bu', 2)
    return out


def base_pinyin(word):
    if word in OVERRIDE:
        return OVERRIDE[word]
    syls = [x[0] for x in pinyin(word, style=Style.TONE3, neutral_tone_with_five=True)]
    return ' '.join(apply_yi_bu(syls))


# ---------------------------------------------------------------- 分类标签

PING_INIT = ('z', 'c', 's')
QIAO_INIT = ('zh', 'ch', 'sh')


def initial_of(base):
    for x in ('zh', 'ch', 'sh'):
        if base.startswith(x):
            return x
    return base[0] if base else ''


def auto_cats(word, t3):
    cats = set()
    syls = t3.split(' ')
    if len(syls) != len(word):
        syls_for_char = None
    else:
        syls_for_char = list(zip(word, syls))

    if any(split_syl(s)[1] == 5 for s in syls):
        cats.add('light')
    for s in syls:
        b, _ = split_syl(s)
        if initial_of(b) in ('z', 'zh', 'c', 'ch', 's', 'sh'):
            cats.add('flat')
            break
    for s in syls:
        b, _ = split_syl(s)
        if b.endswith('ng') or b.endswith('n'):
            cats.add('nasal')
            break
    if '儿' in word and len(word) >= 2:
        cats.add('erhua')
    return cats


# ---------------------------------------------------------------- 手工补充题

# (词, 声调编号, 标签, 变调题的目标音节下标, 读法声调, 专用干扰项, 只出读法题)
# sy/rt 只对变调类有意义；d 是给定干扰项（比自动生成更像真的错法）
EXTRA = [
    # ---- 一 的变调 ----
    ('一个', 'yi2 ge4', 'sandhi', 0, 2, ['yi1 ge4', 'yi4 ge4', 'yi3 ge4'], 0),
    ('一样', 'yi2 yang4', 'sandhi', 0, 2, ['yi1 yang4', 'yi4 yang4', 'yi2 yang2'], 0),
    ('一次', 'yi2 ci4', 'sandhi', 0, 2, ['yi1 ci4', 'yi4 ci4', 'yi2 ci2'], 0),
    ('一定', 'yi2 ding4', 'sandhi', 0, 2, ['yi1 ding4', 'yi4 ding4', 'yi2 ding2'], 0),
    ('一半', 'yi2 ban4', 'sandhi', 0, 2, ['yi1 ban4', 'yi4 ban4', 'yi2 ban2'], 0),
    ('一共', 'yi2 gong4', 'sandhi', 0, 2, ['yi1 gong4', 'yi4 gong4', 'yi2 gong1'], 0),
    ('一边', 'yi4 bian1', 'sandhi', 0, 4, ['yi1 bian1', 'yi2 bian1', 'yi4 bian4'], 0),
    ('一天', 'yi4 tian1', 'sandhi', 0, 4, ['yi1 tian1', 'yi2 tian1', 'yi4 tian4'], 0),
    ('一年', 'yi4 nian2', 'sandhi', 0, 4, ['yi1 nian2', 'yi2 nian2', 'yi4 nian1'], 0),
    ('一起', 'yi4 qi3', 'sandhi', 0, 4, ['yi1 qi3', 'yi2 qi3', 'yi4 qi1'], 0),
    ('一点', 'yi4 dian3', 'sandhi', 0, 4, ['yi1 dian3', 'yi2 dian3', 'yi4 dian1'], 0),
    ('一直', 'yi4 zhi2', 'sandhi', 0, 4, ['yi1 zhi2', 'yi2 zhi2', 'yi4 zhi1'], 0),
    ('第一', 'di4 yi1', 'sandhi', 1, 1, ['di4 yi2', 'di4 yi4', 'di1 yi1'], 0),
    ('十一', 'shi2 yi1', 'sandhi', 1, 1, ['shi2 yi2', 'shi2 yi4', 'shi1 yi1'], 0),
    # ---- 不 的变调 ----
    ('不是', 'bu2 shi4', 'sandhi', 0, 2, ['bu4 shi4', 'bu1 shi4', 'bu2 shi1'], 0),
    ('不要', 'bu2 yao4', 'sandhi', 0, 2, ['bu4 yao4', 'bu1 yao4', 'bu2 yao1'], 0),
    ('不会', 'bu2 hui4', 'sandhi', 0, 2, ['bu4 hui4', 'bu1 hui4', 'bu2 hui1'], 0),
    ('不对', 'bu2 dui4', 'sandhi', 0, 2, ['bu4 dui4', 'bu1 dui4', 'bu2 dui1'], 0),
    ('不错', 'bu2 cuo4', 'sandhi', 0, 2, ['bu4 cuo4', 'bu1 cuo4', 'bu2 cuo1'], 0),
    ('不过', 'bu2 guo4', 'sandhi', 0, 2, ['bu4 guo4', 'bu1 guo4', 'bu2 guo1'], 0),
    ('不用', 'bu2 yong4', 'sandhi', 0, 2, ['bu4 yong4', 'bu1 yong4', 'bu2 yong1'], 0),
    ('不能', 'bu4 neng2', 'sandhi', 0, 4, ['bu2 neng2', 'bu1 neng2', 'bu4 neng1'], 0),
    ('不好', 'bu4 hao3', 'sandhi', 0, 4, ['bu2 hao3', 'bu1 hao3', 'bu4 hao1'], 0),
    ('不行', 'bu4 xing2', 'sandhi', 0, 4, ['bu2 xing2', 'bu1 xing2', 'bu4 xing1'], 0),
    # ---- 三声连读（注音仍标本调，只能出「读第几声」题）----
    ('你好', 'ni3 hao3', 'sandhi', 0, 2, [], 1),
    ('小鸟', 'xiao3 niao3', 'sandhi', 0, 2, [], 1),
    ('水果', 'shui3 guo3', 'sandhi', 0, 2, [], 1),
    ('可以', 'ke3 yi3', 'sandhi', 0, 2, [], 1),
    ('雨伞', 'yu3 san3', 'sandhi', 0, 2, [], 1),
    ('老虎', 'lao3 hu3', 'sandhi', 0, 2, [], 1),
    ('蚂蚁', 'ma3 yi3', 'sandhi', 0, 2, [], 1),
    ('粉笔', 'fen3 bi3', 'sandhi', 0, 2, [], 1),
    ('表演', 'biao3 yan3', 'sandhi', 0, 2, [], 1),
    ('洗澡', 'xi3 zao3', 'sandhi', 0, 2, [], 1),
    ('勇敢', 'yong3 gan3', 'sandhi', 0, 2, [], 1),
    ('想法', 'xiang3 fa3', 'sandhi', 0, 2, [], 1),
    ('手表', 'shou3 biao3', 'sandhi', 0, 2, [], 1),
    ('管理', 'guan3 li3', 'sandhi', 0, 2, [], 1),
    ('只好', 'zhi3 hao3', 'sandhi', 0, 2, [], 1),
    # ---- 轻声 ----
    ('孩子', 'hai2 zi5', 'light', 0, 0, [], 0),
    ('石头', 'shi2 tou5', 'light', 0, 0, [], 0),
    ('尾巴', 'wei3 ba5', 'light', 0, 0, [], 0),
    ('眼睛', 'yan3 jing5', 'light', 0, 0, [], 0),
    ('事情', 'shi4 qing5', 'light', 0, 0, [], 0),
    ('漂亮', 'piao4 liang5', 'light', 0, 0, [], 0),
    ('明白', 'ming2 bai5', 'light', 0, 0, [], 0),
    ('舒服', 'shu1 fu5', 'light', 0, 0, [], 0),
    ('衣裳', 'yi1 shang5', 'light', 0, 0, [], 0),
    ('脑袋', 'nao3 dai5', 'light', 0, 0, [], 0),
    ('喜欢', 'xi3 huan5', 'light', 0, 0, [], 0),
    ('休息', 'xiu1 xi5', 'light', 0, 0, [], 0),
    ('照顾', 'zhao4 gu5', 'light', 0, 0, [], 0),
    ('认识', 'ren4 shi5', 'light', 0, 0, [], 0),
    ('姐姐', 'jie3 jie5', 'light', 0, 0, [], 0),
    ('弟弟', 'di4 di5', 'light', 0, 0, [], 0),
    ('妹妹', 'mei4 mei5', 'light', 0, 0, [], 0),
    # ---- 多音字（配对出现，选项里放另一种读音）----
    ('长大', 'zhang3 da4', 'poly', 0, 0, ['chang2 da4', 'zhang4 da4', 'chang3 da4'], 0),
    ('长短', 'chang2 duan3', 'poly', 0, 0, ['zhang3 duan3', 'chang3 duan3', 'zhang4 duan3'], 0),
    ('快乐', 'kuai4 le4', 'poly', 0, 0, ['kuai4 yue4', 'kuai1 le4', 'kuai4 le1'], 0),
    ('音乐', 'yin1 yue4', 'poly', 0, 0, ['yin1 le4', 'ying1 yue4', 'yin1 yue1'], 0),
    ('觉得', 'jue2 de5', 'poly', 0, 0, ['jiao4 de5', 'jue4 de5', 'jue2 de2'], 0),
    ('睡觉', 'shui4 jiao4', 'poly', 0, 0, ['shui4 jue2', 'shui4 jiao1', 'shui3 jiao4'], 0),
    ('种子', 'zhong3 zi5', 'poly', 0, 0, ['zhong4 zi5', 'chong2 zi5', 'zhong1 zi5'], 0),
    ('种花', 'zhong4 hua1', 'poly', 0, 0, ['zhong3 hua1', 'chong2 hua1', 'zhong4 hua4'], 0),
    ('头发', 'tou2 fa5', 'poly', 0, 0, ['tou2 fa1', 'tou1 fa5', 'tou2 fa4'], 0),
    ('发现', 'fa1 xian4', 'poly', 0, 0, ['fa4 xian4', 'fa1 xian2', 'fa3 xian4'], 0),
    ('着火', 'zhao2 huo3', 'poly', 0, 0, ['zhe5 huo3', 'zhao1 huo3', 'zhao2 huo1'], 0),
    ('看着', 'kan4 zhe5', 'poly', 0, 0, ['kan4 zhao2', 'kan4 zhuo2', 'kan1 zhe5'], 0),
    ('只有', 'zhi3 you3', 'poly', 0, 0, ['zhi1 you3', 'zhi3 you4', 'zhi4 you3'], 0),
    ('一只', 'yi4 zhi1', 'poly', 0, 0, ['yi4 zhi3', 'yi1 zhi1', 'yi2 zhi1'], 0),
    ('无数', 'wu2 shu4', 'poly', 0, 0, ['wu2 shu3', 'wu1 shu4', 'wu2 shu2'], 0),
    ('数一数', 'shu3 yi1 shu3', 'poly', 0, 0, ['shu4 yi1 shu4', 'shu3 yi2 shu3', 'shu4 yi2 shu4'], 0),
    ('中间', 'zhong1 jian1', 'poly', 0, 0, ['zhong4 jian1', 'zhong1 jian4', 'zhong4 jian4'], 0),
    ('好客', 'hao4 ke4', 'poly', 0, 0, ['hao3 ke4', 'hao4 ke3', 'hao3 ke3'], 0),
    ('空气', 'kong1 qi4', 'poly', 0, 0, ['kong4 qi4', 'kong1 qi1', 'kong4 qi1'], 0),
    ('空地', 'kong4 di4', 'poly', 0, 0, ['kong1 di4', 'kong4 di1', 'kong1 di1'], 0),
    ('干净', 'gan1 jing4', 'poly', 0, 0, ['gan4 jing4', 'gan1 jing1', 'gan4 jing1'], 0),
    ('干活', 'gan4 huo2', 'poly', 0, 0, ['gan1 huo2', 'gan4 huo4', 'gan1 huo4'], 0),
    ('水分', 'shui3 fen4', 'poly', 0, 0, ['shui3 fen1', 'shui4 fen4', 'shui3 fen5'], 0),
    ('分开', 'fen1 kai1', 'poly', 0, 0, ['fen4 kai1', 'fen1 kai4', 'fen4 kai4'], 0),
    ('当作', 'dang4 zuo4', 'poly', 0, 0, ['dang1 zuo4', 'dang4 zuo1', 'dang1 zuo1'], 0),
    ('教室', 'jiao4 shi4', 'poly', 0, 0, ['jiao1 shi4', 'jiao4 shi3', 'jiao1 shi3'], 0),
    ('转动', 'zhuan4 dong4', 'poly', 0, 0, ['zhuan3 dong4', 'zhuan4 dong1', 'zhuan3 dong1'], 0),
    ('转身', 'zhuan3 shen1', 'poly', 0, 0, ['zhuan4 shen1', 'zhuan3 shen4', 'zhuan4 shen4'], 0),
]


# ---------------------------------------------------------------- 组装

def build():
    src = json.load(open(SRC, encoding='utf-8'))
    items, seen = [], set()

    for u in src['units']:
        for lesson in u.get('lessons', []):
            for w in lesson['words']:
                if w in seen:
                    continue
                seen.add(w)
                t3 = base_pinyin(w)
                cats = auto_cats(w, t3)
                if '一' in w or '不' in w:
                    cats.add('sandhi')
                it = {'w': w, 't3': t3, 'cats': sorted(cats),
                      'u': u['id'], 'l': lesson.get('no')}
                # 变调题的目标字
                if '一' in w and 'sandhi' in cats:
                    i = list(w).index('一')
                    syls = t3.split(' ')
                    if i < len(syls):
                        it['sy'] = i
                        it['rt'] = split_syl(syls[i])[1]
                if '不' in w and 'sandhi' in cats:
                    i = list(w).index('不')
                    syls = t3.split(' ')
                    if i < len(syls):
                        it['sy'] = i
                        it['rt'] = split_syl(syls[i])[1]
                items.append(it)

    for (w, t3, cat, sy, rt, d, ro) in EXTRA:
        row = next((x for x in items if x['w'] == w), None)
        if row is None:
            row = {'w': w, 't3': t3, 'cats': [cat], 'extra': 1}
            items.append(row)
        else:
            row['t3'] = t3
            if cat not in row['cats']:
                row['cats'].append(cat)
            row['extra'] = 1
        row['cats'] = sorted(set(row['cats']))
        if sy or rt:
            row['sy'] = sy
            row['rt'] = rt
        if d:
            row['d'] = d
        if ro:
            row['ro'] = 1

    out = {
        'note': '教材词 239 个 + 变调/轻声/多音字专项。标音按《现代汉语词典》，'
                '「一、不」变调按规则计算（拼音库在这一项上不可靠）。',
        'items': items,
    }
    json.dump(out, open(DST_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    # 生成 web/pinyin.js
    body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    with open(DST_JS, 'w', encoding='utf-8') as f:
        f.write('/* pinyin.js — 拼音题库。由 tools/gen_pinyin.py 从 data/pinyin.json 生成。\n')
        f.write(' * t3 = 声调编号记音（yi2 ge4），运行时转成 yí gè 显示。\n')
        f.write(' * cats: sandhi 变调 / light 轻声 / poly 多音字 / nasal 前后鼻音 / flat 平翘舌 / erhua 儿化\n')
        f.write(' * sy = 变调字位置，rt = 读法声调，d = 手工干扰项，ro = 只出读法题\n')
        f.write(' */\n')
        f.write('window.PINYIN = ' + body + ';\n')

    # 汇总
    from collections import Counter
    c = Counter()
    for it in items:
        for x in it['cats']:
            c[x] += 1
    print('词组总数 %d' % len(items))
    print('分类：', dict(c))
    print('有手工干扰项：', sum(1 for x in items if x.get('d')))
    print('可出变调判断题：', sum(1 for x in items if 'rt' in x))
    print('只出读法题：', sum(1 for x in items if x.get('ro')))
    return items


if __name__ == '__main__':
    build()
