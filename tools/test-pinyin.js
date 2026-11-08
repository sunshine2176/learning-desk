/* test-pinyin.js — 拼音模块的数据层校验（不需要浏览器） */
'use strict';
const store = {};
global.localStorage = {
  setItem: (k, v) => { store[k] = String(v); },
  getItem: k => (k in store ? store[k] : null),
  removeItem: k => { delete store[k]; },
};
global.window = {};
const fs = require('fs');
let code = fs.readFileSync(__dirname + '/../web/pinyin.js', 'utf8');
code += fs.readFileSync(__dirname + '/../web/local.js', 'utf8');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}

code += `
;(async () => {
  const P = LD.pinyin;
  const items = window.PINYIN.items;

  /* ---- 1. 声调符号 ---- */
  const cases = [
    ['yi2 ge4', 'yí gè'], ['zhang3', 'zhǎng'], ['nv3', 'nǚ'], ['lv4', 'lǜ'],
    ['dianr3', 'diǎnr'], ['huir4', 'huìr'], ['kuair4', 'kuàir'], ['nar3', 'nǎr'],
    ['liu2', 'liú'], ['dui4', 'duì'], ['men5', 'men'], ['xue2', 'xué'],
    ['jian4', 'jiàn'], ['shui3', 'shuǐ'], ['yao4', 'yào'],
  ];
  const bad = cases.filter(([a, b]) => P.text(a) !== b);
  ok(bad.length === 0, '声调符号转换（' + cases.length + ' 例，含 ü / 儿化 / 轻声）', bad);

  /* ---- 2. 题库标音格式 ---- */
  const dirty = items.filter(it => /[0-9v]/.test(P.text(it.t3)) || !P.text(it.t3).trim());
  ok(dirty.length === 0, '全部 ' + items.length + ' 个词都能转成无数字的拼音', dirty.slice(0, 3));

  /* ---- 3. 每个分类都能出题 ---- */
  for (const cat of ['all', 'sandhi', 'poly', 'nasal', 'flat', 'light']) {
    const r = await api('/api/quiz/pinyin?count=20&cat=' + cat);
    const n = r.items.length;
    ok(n === 20, '专项「' + cat + '」出 20 题', n);
  }

  /* ---- 4. 选项必须含正确答案、四个不重复 ---- */
  let optBad = [], ansBad = [], dupBad = [];
  for (const cat of ['all', 'sandhi', 'poly', 'nasal', 'flat', 'light']) {
    const r = await api('/api/quiz/pinyin?count=300&cat=' + cat);
    r.items.forEach(q => {
      if (!q.opts || q.opts.length !== 4) optBad.push([cat, q.w, q.opts]);
      if (new Set(q.opts).size !== 4) dupBad.push([cat, q.w, q.opts]);
      if (q.opts[q.ans] !== q.answer) ansBad.push([cat, q.w, q.opts, q.ans, q.answer]);
      if (q.form === 'choose' && q.opts[q.ans] !== P.text(q.t3)) optBad.push([cat, q.w, '答案与题库不符']);
      if (q.form === 'tone') {
        const it = P.byWord()[q.w];
        if (!it || !it.rt) optBad.push([cat, q.w, '变调题缺 rt']);
        else if (q.answer !== '第' + '一二三四'[it.rt - 1] + '声') optBad.push([cat, q.w, '声调答案不对']);
      }
    });
  }
  ok(optBad.length === 0, '每题恰好 4 个选项且答案来自题库', optBad.slice(0, 4));
  ok(ansBad.length === 0, 'ans 下标指向的就是正确答案', ansBad.slice(0, 4));
  ok(dupBad.length === 0, '四个选项互不重复', dupBad.slice(0, 4));

  /* ---- 5. 变调专项必须真考变调 ---- */
  const sand = (await api('/api/quiz/pinyin?count=200&cat=sandhi')).items;
  const hasYiBu = sand.filter(q => {
    const it = P.byWord()[q.w];
    return it && (it.w.includes('一') || it.w.includes('不'));
  });
  const toneQs = sand.filter(q => q.form === 'tone');
  console.log('    变调题里含一/不：' + hasYiBu.length + '/' + sand.length + '，读法题 ' + toneQs.length);

  // 一 在词首才是变调（第一 / 十一是序数，读原调）
  const yiFirst = hasYiBu.filter(q => P.byWord()[q.w].w[0] === '一');
  const wrongTone = yiFirst.filter(q => {
    const it = P.byWord()[q.w];
    const syl = it.t3.split(' ')[it.sy];
    return syl.slice(0, -1) === 'yi' && syl.slice(-1) === '1';
  });
  ok(yiFirst.length > 0 && wrongTone.length === 0,
     '词首的「一」都变调了（' + yiFirst.length + ' 个样本）', wrongTone.map(q => q.w));

  /* ---- 6. 干扰项必须像真的，不能是乱码 ---- */
  const all = (await api('/api/quiz/pinyin?count=300&cat=all')).items;
  const isToneOpt = o => /^第[一二三四]声$/.test(o);
  const looksPinyin = o => /^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü ]+$/.test(o);
  const junk = all.filter(q => q.opts.some(o => !isToneOpt(o) && !looksPinyin(o)));
  ok(junk.length === 0, '选项里没有乱码', junk.slice(0, 3).map(q => [q.w, q.opts]));

  /* ---- 7. 提交 → 统计 → 错题本 → 复习 ---- */
  const q1 = all.find(q => q.form === 'choose');
  const wrongPick = q1.opts.findIndex((o, i) => i !== q1.ans);
  const res = await post('/api/submit', {
    subject: 'pinyin',
    items: [{ kind: q1.kind, ref: 'pinyin:' + q1.w, question: q1.question, answer: q1.answer, given: q1.opts[wrongPick], ok: 0 }],
  });
  ok(res && res.ok, '拼音答题能提交');

  const st = await api('/api/stats?days=7');
  const pyKind = st.kinds.find(k => k.kind === 'py');
  ok(!!pyKind && pyKind.judged === 1 && pyKind.ok === 0, '统计里出现拼音且计入正确率（judged=1）', pyKind);
  ok(st.wrong.some(w => w.ref === 'pinyin:' + q1.w), '错词进待攻克');

  // 到期后复习能重建选项
  const W = JSON.parse(localStorage.getItem('desk.wrong.v1'));
  const today = new Date();
  const d = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  W['pinyin:' + q1.w].due = d;
  localStorage.setItem('desk.wrong.v1', JSON.stringify(W));

  const rv = await api('/api/review');
  const item = rv.items.find(x => x.ref === 'pinyin:' + q1.w);
  ok(!!item, '到期后复习能找到这个拼音词', rv.items.map(x => x.ref));
  const rebuilt = P.options(item.question);
  ok(!!rebuilt && rebuilt.opts.length === 4 && rebuilt.opts[rebuilt.ans] === item.answer,
     '复习时能按词重建选项且含正确答案', rebuilt);

  /* ---- 8. 复习答对 → 推进间隔 ---- */
  await post('/api/submit', { subject: 'pinyin', items: [{ kind: item.kind, ref: item.ref, question: item.question, answer: item.answer, given: item.answer, ok: 1 }] });
  const W2 = JSON.parse(localStorage.getItem('desk.wrong.v1'));
  ok(W2[item.ref].stage === 1, '答对后间隔推进到第 2 档', W2[item.ref].stage);

  console.log('');
  console.log(fail === 0 ? '全部通过 ' + pass + '/' + (pass + fail) : '失败 ' + fail + ' 项');
  process.exitCode = fail ? 1 : 0;
})();
`;

eval(code);
