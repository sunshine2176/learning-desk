'use strict';
/* 验证：出题按记忆曲线加权——刚错的词高频、一个月没错的词低频
 * 用法：node tools/check-srs.js    （BASE 可指向线上）
 */
const { chromium } = require('./pw');
const BASE = process.env.BASE || 'http://127.0.0.1:8808';
const pad = n => String(n).padStart(2, '0');
const dayStr = off => { const d = new Date(); d.setDate(d.getDate() - off); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };

const fails = [];
function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); fails.push(msg); }
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  p.on('pageerror', e => { console.log('[pageerror]', e.message); fails.push('pageerror: ' + e.message); });

  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(({ d1, d30 }) => {
    // 词表前 30 个词分三组：yesterday 错 / old 对 / 无记录
    const words = (LD.getDict().units[0].lessons[0].words || []).slice(0, 9);
    const A = [];
    words.slice(0, 3).forEach(w => A.push({ ts: d1 + ' 10:00:00', day: d1, subject: 'dictation', kind: 'word', ref: 'word:' + w, question: w, answer: w, given: '写错', ok: 0, self: 0 }));
    words.slice(3, 6).forEach(w => A.push({ ts: d30 + ' 10:00:00', day: d30, subject: 'dictation', kind: 'word', ref: 'word:' + w, question: w, answer: w, given: w, ok: 1, self: 0 }));
    words.slice(6, 9).forEach(w => A.push({ ts: d1 + ' 10:00:00', day: d1, subject: 'pinyin', kind: 'py', ref: 'pinyin:' + w, question: w, answer: w, given: '?', ok: 0, self: 0 }));
    localStorage.setItem('desk.attempts.v1', JSON.stringify(A));
  }, { d1: dayStr(1), d30: dayStr(30) });

  const r = await p.evaluate(async () => {
    const words = LD.getDict().units[0].lessons[0].words.slice(0, 9);
    const g = { wrong: words.slice(0, 3), old: words.slice(3, 6), fresh: words.slice(6, 9) };  // 同一单元内对照
    const tally = { wrong: 0, old: 0, fresh: 0, pyWrong: 0 };
    const N = 8;
    for (let i = 0; i < N; i++) {
      const d = await LD.api('/api/quiz/dictation?count=6&unit=u1');
      d.items.forEach(x => {
        if (g.wrong.includes(x.word)) tally.wrong++;
        else if (g.old.includes(x.word)) tally.old++;
        else if (g.fresh.includes(x.word)) tally.fresh++;
      });
      const p2 = await LD.api('/api/quiz/pinyin?count=4&cat=all&unit=u1');
      p2.items.forEach(x => { if (g.fresh.includes(x.w)) tally.pyWrong++; });
    }
    return { tally, N };
  });

  const perRun = r.tally.wrong / r.N;
  const oldPerRun = r.tally.old / r.N;
  console.log(`  每次听写 6 道：刚错的词平均出现 ${perRun.toFixed(1)} 次；一个月前对的词平均 ${oldPerRun.toFixed(1)} 次`);
  ok(perRun >= 0.8, `刚错的词高频出现（${perRun.toFixed(1)}/次，均匀期望 0.5）`);
  ok(oldPerRun <= perRun / 5, `老词（一个月前对过）频率被压到五分之一以下（${oldPerRun.toFixed(2)} vs ${perRun.toFixed(1)}）`);
  const pyPer = r.tally.pyWrong / r.N;
  console.log(`  拼音 4 道：昨天错的专项词平均出现 ${pyPer.toFixed(1)} 次（均匀期望 0.53）`);
  ok(pyPer >= 0.5, '拼音出题同样偏向刚错的词');

  await b.close();
  console.log(fails.length ? `\nFAIL ${fails.length} 项` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
