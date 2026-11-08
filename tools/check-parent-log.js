'use strict';
/* 验证：家长端「今天做了什么」按模块 + 批次展示，复习和练习不混
 * 用法：node tools/check-parent-log.js     （BASE 可指向线上）
 */
const { chromium } = require('./pw');
const BASE = process.env.BASE || 'http://127.0.0.1:8808';

const fails = [];
function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); fails.push(msg); }
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 834, height: 1112 } });
  p.on('pageerror', e => { console.log('[pageerror]', e.message); fails.push('pageerror: ' + e.message); });

  console.log('\n[1] 造一组复习：先补录学校错词（当天到期）');
  await p.goto(BASE + '/?go=parent', { waitUntil: 'networkidle' });
  await p.waitForSelector('#schoolLessonSel');
  await p.selectOption('#schoolLessonSel', 'u3:6');
  await p.waitForTimeout(400);
  await p.locator('button[data-act="schoolWord"]').first().click();
  await p.waitForTimeout(600);

  await p.goto(BASE + '/?go=review', { waitUntil: 'networkidle' });
  await p.waitForSelector('.dict-stage, .py-opt, .qtext', { timeout: 8000 });
  for (let i = 0; i < 8; i++) {
    if (await p.locator('.py-opt').count()) { await p.locator('.py-opt').first().click(); await p.waitForTimeout(1200); }
    else if (await p.locator('button[data-act="reveal"]').count()) {
      await p.locator('button[data-act="reveal"]').click();
      await p.waitForTimeout(300);
      await p.locator('button[data-act="judge"][data-ok="1"]').click();
      await p.waitForTimeout(700);
    } else if (await p.locator('.qtext').count()) {
      await p.click('.key[data-k="1"]'); await p.click('.key[data-k="enter"]'); await p.waitForTimeout(1500);
    } else break;
  }
  ok(true, '复习做完了');

  console.log('\n[2] 造一组练习：口算 10 道');
  await p.goto(BASE + '/?go=math', { waitUntil: 'networkidle' });
  await p.click('button.chip:has-text("10 道")');
  await p.click('button[data-act="startMath"]');
  await p.waitForSelector('.qtext');
  for (let i = 0; i < 10; i++) {
    if (!(await p.locator('.qtext').count())) break;
    await p.click('.key[data-k="1"]');
    await p.click('.key[data-k="enter"]');
    await p.waitForTimeout(1500);
  }
  ok(true, '口算 10 道做完了');

  console.log('\n[3] 家长端检查');
  await p.goto(BASE + '/?go=parent', { waitUntil: 'networkidle' });
  await p.waitForSelector('.log-table', { timeout: 8000 });

  const st = await p.evaluate(() => {
    const d = (S.stats.dayList || []).find(x => x.day === dayStr(0));
    return {
      batches: (d && d.batches) || [],
      today: S.stats.today || [],
    };
  });
  const practice = st.batches.filter(x => x.src === 'practice');
  const review = st.batches.filter(x => x.src === 'review');
  ok(practice.length === 1, `练习批次 1 个（实际 ${practice.length}）`);
  ok(review.length === 1, `复习批次合并且只有 1 个（实际 ${review.length}）—— 多科目不拆行`);
  ok(review[0] && Object.keys(review[0].subjects).length >= 2, '复习批次里带了多个科目（口算/拼音/听写合在一起）');
  ok(practice[0] && practice[0].n === 10 && practice[0].subjects.math === 10, '练习批次记录 10 道口算');

  const mod = s => st.today.filter(x => x.subject === s).reduce((a, x) => ({ n: a.n + x.n, pr: a.pr + (x.src === 'practice' ? x.n : 0), rv: a.rv + (x.src === 'review' ? x.n : 0) }), { n: 0, pr: 0, rv: 0 });
  const mm = mod('math'), mp = mod('pinyin'), md = mod('dictation');
  ok(mm.n === 10 && mm.pr === 10 && mm.rv === 0, `口算：练习 10 / 复习 0（实际 ${mm.pr}/${mm.rv}）`);
  ok(mp.rv > 0 && mp.pr === 0, `拼音：只有复习（实际 练${mp.pr}/复${mp.rv}）`);
  ok(md.rv > 0 && md.pr === 0, `听写：只有复习（实际 练${md.pr}/复${md.rv}）`);

  const text = await p.textContent('.log-table');
  ok(/练习/.test(text) && /复习/.test(text), '明细表里同时出现「练习」「复习」标签');
  ok((await p.locator('.log-table tbody tr').count()) === st.batches.length, `表格行数 = 批次数（${st.batches.length}）`);

  const cards = await p.textContent('.stat-grid');
  ok(/今天口算/.test(cards) && /练习 10 · 复习 0/.test(cards.replace(/\s+/g, ' ')), '口算卡片显示「练习 10 · 复习 0」');

  console.log('\n[4] 切到昨天');
  await p.locator('button[data-act="pday"][data-d="1"]').click();
  await p.waitForTimeout(800);
  const y = await p.textContent('.card:has(.chips)');
  ok(/没有做题记录|没有做题/.test(y) || (await p.locator('.log-table').count()) === 0, '昨天没有记录时有空状态提示');

  await b.close();
  console.log(fails.length ? `\nFAIL ${fails.length} 项` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
