/* test-local.js — 用模拟 localStorage 跑通 local.js 数据层 */
'use strict';
const store = {};
global.localStorage = {
  setItem: (k, v) => { store[k] = String(v); },
  getItem: k => (k in store ? store[k] : null),
  removeItem: k => { delete store[k]; },
};
global.window = {};
const fs = require('fs');
let code = fs.readFileSync(__dirname + '/../web/dict.js', 'utf8');
code += fs.readFileSync(__dirname + '/../web/local.js', 'utf8');
code += `
;(async () => {
  const m = await api('/api/quiz/math?count=8&level=2');
  console.log('口算 8 题:', m.items.map(x => x.question + ' ' + x.answer).join(' | '));
  const lv1 = await api('/api/quiz/math?count=6&level=1');
  const lv3 = await api('/api/quiz/math?count=6&level=3');
  console.log('难度1:', lv1.items.map(x => x.question).join(' | '));
  console.log('难度3:', lv3.items.map(x => x.question).join(' | '));

  // 难度阶梯校验
  const L = {};
  for (const lv of [1, 2, 3]) L[lv] = (await api('/api/quiz/math?count=300&level=' + lv)).items;

  const ops = q => {
    const m = q.match(/^(\\d+)\\s*([+−×÷])\\s*(\\d+)\\s*=$/);
    if (!m) return null;
    return { a: +m[1], b: +m[3], op: m[2] };
  };

  // 简单档：加减首数必须两位数、结果 0~100；乘法因子 ≤5；不出现除法
  const l1bad = L[1].filter(x => x.kind === 'add_sub').map(x => ({ q: x.question, o: ops(x.question), ans: x.answer }))
    .filter(x => !x.o || x.o.a < 10 || x.ans < 0 || x.ans > 100);
  console.log('简单档 加减异常(应0):', l1bad.length, l1bad.slice(0, 3));
  const l1mulBad = L[1].filter(x => x.kind === 'mul' && ops(x.question).a > 5);
  console.log('简单档 乘法因子>5(应0):', l1mulBad.length);
  console.log('简单档 出现除法(应0):', L[1].filter(x => x.kind === 'div').length);
  console.log('简单档 出现元角分(应0):', L[1].filter(x => x.kind === 'money').length);

  // 适中档：有 100 以内容量、有进位或退位、无除法、乘法覆盖到 9
  console.log('适中档 出现除法(应0):', L[2].filter(x => x.kind === 'div').length);
  const l2add = L[2].filter(x => x.kind === 'add_sub');
  const carry = l2add.filter(x => { const o = ops(x.question); return o && ((o.a % 10) + (o.b % 10) >= 10); }).length;
  const borrow = l2add.filter(x => { const o = ops(x.question); return o && o.op === '−' && (o.a % 10) < (o.b % 10); }).length;
  const from100 = l2add.filter(x => x.question.startsWith('100 − ')).length;
  console.log('适中档 进位加:', carry, '退位减:', borrow, '100减两位数:', from100, '(都应有)');
  const l2mulMax = Math.max(...L[2].filter(x => x.kind === 'mul').map(x => Math.max(ops(x.question).a, ops(x.question).b)));
  console.log('适中档 乘法最大因子(应9):', l2mulMax);

  // 挑战档：必须有除法 / 乘加乘减 / 三元连算
  const k3 = L[3].map(x => x.kind);
  console.log('挑战档 种类:', [...new Set(k3)].join(','), '| 除法数:', k3.filter(k => k === 'div').length);


  const d = await api('/api/dict/units');
  console.log('词表单元数:', d.units.length, '| 自定义:', d.custom);
  console.log('u3 课文:', d.units.find(u => u.id === 'u3').lessons.map(l => l.no + '#' + l.title + '(' + l.count + ')').join(' '));

  const dd = await api('/api/quiz/dictation?unit=u5&count=3');
  console.log('听写 u5:', dd.items.map(x => x.word).join('/'));

  // 课级筛选必须只出这一课的词
  const one = await api('/api/quiz/dictation?unit=u3&lesson=5&count=20');
  const l5 = ['宝贝', '干活', '回来', '一些', '天气', '欢快', '它们', '告诉', '名字', '出门'];
  const bad = one.items.filter(x => !l5.includes(x.word));
  console.log('第三单元第5课 出词数(应10):', one.items.length, '越界词(应0):', bad.length);

  // 改词表 → 覆盖生效 → 恢复默认
  const dcopy = JSON.parse(JSON.stringify(LD.getDict()));
  dcopy.units.find(u => u.id === 'u3').lessons.find(l => l.no === '5').words = ['测试词甲', '测试词乙'];
  LD.saveDict(dcopy);
  const after = await api('/api/quiz/dictation?unit=u3&lesson=5&count=5');
  console.log('改后第5课(应2个测试词):', after.items.map(x => x.word).join('/'), '| custom:', LD.isDictCustom());
  LD.resetDict();
  const back = await api('/api/quiz/dictation?unit=u3&lesson=5&count=5');
  console.log('恢复默认后(应回到10词):', (await api('/api/dict/units')).units.find(u => u.id === 'u3').lessons.find(l => l.no === '5').count);

  const ref = 'math:42 ÷ 7 =';
  const s1 = await post('/api/submit', { subject: 'math', items: [
    { kind: 'div', ref, question: '42 ÷ 7 =', answer: '6', given: '5', ok: 0 },
  ]});
  console.log('提交错题:', JSON.stringify(s1));

  let rv = await api('/api/review');
  console.log('今日待复习(应0):', rv.items.length);

  // 模拟到期：把 due 改成今天（等价于时间走到明天）
  const W = JSON.parse(localStorage.getItem('desk.wrong.v1'));
  const td = new Date();
  W[ref].due = td.getFullYear() + '-' + String(td.getMonth() + 1).padStart(2, '0') + '-' + String(td.getDate()).padStart(2, '0');
  localStorage.setItem('desk.wrong.v1', JSON.stringify(W));
  rv = await api('/api/review');
  console.log('明日待复习(应1):', rv.items.length, rv.items[0] && rv.items[0].question);

  await post('/api/submit', { subject: 'math', items: [
    { kind: 'div', ref, question: '42 ÷ 7 =', answer: '6', given: '6', ok: 1 },
  ]});
  const st = await api('/api/stats?days=7');
  console.log('stats kinds:', JSON.stringify(st.kinds));
  console.log('streak(应1):', st.streak);
  console.log('答对一次后 stage(应1):', st.wrong.length ? st.wrong[0].stage : '(无)');

  // 再错一次 → 回到 stage0，明天再考
  await post('/api/submit', { subject: 'math', items: [
    { kind: 'div', ref, question: '42 ÷ 7 =', answer: '6', given: '3', ok: 0 },
  ]});
  const st2 = await api('/api/stats?days=7');
  console.log('再错后待攻克(应1):', st2.wrong.length, 'stage(应0):', st2.wrong[0].stage);

  // 听写中性记录：孩子"写完了"但没判对错 → 不进错题本、不算正确率
  await post('/api/submit', { subject: 'dictation', items: [
    { kind: 'word', ref: 'word:测试中性词', question: '测试中性词', answer: '测试中性词', given: '', ok: null, self: 1 },
  ]});
  const stN = await api('/api/stats?days=7');
  const wordRow = stN.kinds.find(k => k.kind === 'word');
  console.log('中性记录 进错题本(应0):', Object.keys(JSON.parse(localStorage.getItem('desk.wrong.v1'))).filter(k => k.includes('中性')).length);
  console.log('听写行:', JSON.stringify(wordRow), '| judged 应=0');
  const A = JSON.parse(localStorage.getItem('desk.attempts.v1'));
  const neutralRow = A.find(x => x.ref === 'word:测试中性词');
  console.log('中性记录 ok 字段(应null):', neutralRow && neutralRow.ok, '| self(应1):', neutralRow && neutralRow.self);

  // 听写自报不会 → 进错题本，但正确率仍不算
  await post('/api/submit', { subject: 'dictation', items: [
    { kind: 'word', ref: 'word:测试不会词', question: '测试不会词', answer: '测试不会词', given: '不会', ok: 0, self: 1 },
  ]});
  const stN2 = await api('/api/stats?days=7');
  console.log('自报不会 进待攻克(应含测试不会词):', stN2.wrong.some(w => w.ref === 'word:测试不会词'));
  console.log('自报不会 听写行 judged(应仍0):', stN2.kinds.find(k => k.kind === 'word').judged);

  // 家长核对补录：孩子点「写完了」是中性，家长在面板里补判
  LD.saveLastDict([
    { word: '核对词甲', unit: 'u1', mark: 'done', verdict: null },
    { word: '核对词乙', unit: 'u1', mark: 'dunno', verdict: null },
    { word: '核对词丙', unit: 'u1', mark: 'done', verdict: null },
  ]);
  console.log('听写存档组数(应1):', LD.lastDicts().length, '| 词数(应3):', LD.lastDicts()[0].items.length);
  LD.markLastWord(0, 0, 'bad');
  const stC = await api('/api/stats?days=7');
  console.log('家长标错 进待攻克(应true):', stC.wrong.some(w => w.ref === 'word:核对词甲'));
  console.log('家长标错 听写行 judged(应1):', stC.kinds.find(k => k.kind === 'word').judged);
  LD.markLastWord(0, 1, 'ok');   // 孩子标「不会」的词，家长不能再改判
  const gi = LD.lastDicts()[0].items[1];
  console.log('孩子标不会的词未被改判(应dunno/undefined):', gi.mark + '/' + gi.verdict);
  LD.markRestOk(0);
  console.log('剩余核对后 verdict:', JSON.stringify(LD.lastDicts()[0].items.map(x => x.verdict)));
  const nBefore = JSON.parse(localStorage.getItem('desk.attempts.v1')).length;
  LD.markLastWord(0, 0, 'bad');   // 重复点不应重复提交
  const nAfter = JSON.parse(localStorage.getItem('desk.attempts.v1')).length;
  console.log('重复标记不重复计(应相等):', nBefore === nAfter, nBefore, nAfter);

  const ex = LD.exportData();
  console.log('导出: attempts', ex.attempts.length, 'wrong', Object.keys(ex.wrong).length);
  LD.resetAll();
  const imp = LD.importData(JSON.parse(JSON.stringify(ex)));
  console.log('清空后导入回:', JSON.stringify(imp));

  console.log('ALL PASS');
})();`;
eval(code);
