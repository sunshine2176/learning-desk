'use strict';
/* 验证：家长补录学校听写错词 → 进错题本 → 复习里出现对应题型
 * 用法：node tools/check-school.js    （BASE 可指向线上）
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

  console.log('\n[1] 家长面板补录');
  await p.goto(BASE + '/?go=parent', { waitUntil: 'networkidle' });
  await p.waitForSelector('#schoolLessonSel');
  ok(await p.locator('.section-title:has-text("学校听写错词")').count() === 1, '面板有「学校听写错词」区块');

  // 选第三单元第 6 课
  await p.selectOption('#schoolLessonSel', 'u3:6');
  await p.waitForTimeout(400);
  const chips = await p.locator('button[data-act="schoolWord"]').count();
  ok(chips > 0, `该课列出 ${chips} 个可点的词`);

  const firstWord = await p.locator('button[data-act="schoolWord"]').first().textContent();
  const w1 = firstWord.trim();
  await p.locator('button[data-act="schoolWord"]').first().click();
  await p.waitForTimeout(600);

  const book = await p.evaluate(() => JSON.parse(localStorage.getItem('desk.wrong.v1') || '{}'));
  ok(!!book['word:' + w1], `「${w1}」进了错题本（写字）`);
  ok(!!book['py:' + w1], `「${w1}」也建了拼音条目`);
  const row = book['word:' + w1] || {};
  ok(row.src === 'school', '来源标为 school');
  ok(row.due === new Date().toISOString().slice(0, 10) || row.due <= new Date().toISOString().slice(0, 10), '当天就能复习（due = 今天）');
  ok((await p.locator('.chip.rec').count()) >= 2, '「补录过」区列出了已录条目');

  console.log('\n[2] 只练写字模式 + 课本外的词');
  await p.locator('button[data-act="schoolType"][data-v="word"]').click();
  await p.waitForTimeout(300);
  await p.fill('#schoolFree', '图书馆 显微镜');
  await p.locator('button[data-act="schoolFreeAdd"]').click();
  await p.waitForTimeout(600);
  const book2 = await p.evaluate(() => JSON.parse(localStorage.getItem('desk.wrong.v1') || '{}'));
  ok(!!book2['word:图书馆'] && !!book2['word:显微镜'], '课本外的词也录进来了');
  ok(!book2['py:图书馆'], '只练写字模式下不建拼音条目（无拼音数据）');

  console.log('\n[3] 复习里出现，且写字题要先写再看答案');
  await p.goto(BASE + '/?go=review', { waitUntil: 'networkidle' });
  await p.waitForSelector('.qtext, .dict-stage', { timeout: 8000 });
  const n = await p.evaluate(() => (typeof S !== 'undefined' && S.review && S.review.items ? S.review.items.length : 0));  // S 是顶层 const，不挂 window
  ok(n >= 2, `复习队列有 ${n} 道`);
  const kinds = await p.evaluate(() => (typeof S !== 'undefined' && S.review && S.review.items ? S.review.items.map(x => x.kind) : []));
  ok(kinds.indexOf('word') >= 0, '有写字题');
  ok(kinds.indexOf('py') >= 0, '有拼音题');

  // 找到第一道写字题（若当前不是，点过去不好控制，直接看当前）
  let sawReveal = false;
  for (let i = 0; i < 12; i++) {
    const isWord = await p.locator('button[data-act="playWord"]').count();
    if (isWord) {
      const hasBtn = await p.locator('button[data-act="reveal"]').count();
      ok(hasBtn === 1, '写字题有「写完了，对答案」按钮');
      ok((await p.locator('.big-word').first().textContent()).trim().indexOf('○') === 0, '未揭晓时显示 ○ 占位，不给答案');
      await p.locator('button[data-act="reveal"]').click();
      await p.waitForTimeout(300);
      const bw = (await p.locator('.big-word').first().textContent()).trim();
      ok(bw.indexOf('○') < 0 && bw.length > 0, `揭晓后显示答案「${bw}」`);
      ok(await p.locator('button[data-act="judge"]').count() === 2, '揭晓后才有「写对了 / 写错了」两个按钮');
      sawReveal = true;
      break;
    }
    // 不是写字题就答掉它
    if (await p.locator('.py-opt').count()) await p.locator('.py-opt').first().click();
    else if (await p.locator('.qtext').count()) {
      await p.click('.key[data-k="1"]'); await p.click('.key[data-k="enter"]');
    }
    await p.waitForTimeout(1200);
  }
  ok(sawReveal, '复习里确实走到了写字题');

  console.log('\n[4] 删掉 / 重复录入');
  await p.goto(BASE + '/?go=parent', { waitUntil: 'networkidle' });
  await p.waitForSelector('.chip.rec');
  const before = await p.locator('.chip.rec').count();
  await p.locator('.rec-x').first().click();
  await p.waitForTimeout(500);
  const after = await p.locator('.chip.rec').count();
  ok(after === before - 1, `点 × 删掉一条（${before} → ${after}）`);

  await b.close();
  console.log(fails.length ? `\nFAIL ${fails.length} 项` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
