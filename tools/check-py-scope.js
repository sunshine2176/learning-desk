/* check-py-scope.js — 验证拼音「按课出题」：选第三单元第 6 课，出的词必须都在这一课里 */
'use strict';
const { chromium } = require('./pw');

const B = process.env.BASE || 'http://127.0.0.1:8808';
const LESSON_WORDS = ['星星', '晚上', '无数', '奶奶', '中间', '总是', '爷爷', '北边', '勺子', '转动', '这个', '后来'];

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 834, height: 1112 } });
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });

  await p.goto(B + '/?go=pinyin', { waitUntil: 'networkidle' });
  await p.waitForSelector('#unitSel', { timeout: 5000 });

  const opts = await p.$$eval('#lessonSel option', ns => ns.map(n => n.value + ' ' + n.textContent.trim()));
  console.log('单元未选时的课选项:', opts.join(' | '));

  await p.selectOption('#unitSel', 'u3');
  await p.waitForTimeout(200);
  const opts3 = await p.$$eval('#lessonSel option', ns => ns.map(n => n.value + ' ' + n.textContent.trim()));
  console.log('选第三单元后课选项:', opts3.join(' | '));

  await p.selectOption('#lessonSel', '6');
  await p.waitForTimeout(200);
  const setupTxt = await p.textContent('.setup');
  const m = setupTxt.match(/这个范围里有\s*(\d+)\s*个词/);
  console.log('范围词数提示:', m ? m[1] : '(没找到)');

  await p.click('button.chip:has-text("8 道")');
  await p.click('button[data-act="startPy"]');
  await p.waitForSelector('.py-word', { timeout: 5000 });

  const got = new Set();
  for (let i = 0; i < 8; i++) {
    const w = (await p.textContent('.py-word')).trim();
    got.add(w);
    if (await p.locator('.py-opt').count()) { await p.click('.py-opt'); await p.waitForTimeout(1200); }
    else break;
  }
  const outside = [...got].filter(w => LESSON_WORDS.indexOf(w) < 0);
  console.log('出的词:', [...got].join(' '));
  console.log('不在本课的:', outside.length ? outside.join(' ') : '无 ✓');
  console.log(outside.length === 0 && m && m[1] === '12' ? 'PASS 按课出题' : 'FAIL');

  await p.goto(B + '/?go=pinyin', { waitUntil: 'networkidle' });
  await p.waitForSelector('#unitSel');
  await p.screenshot({ path: '/tmp/shots/py-scope.png' });

  await b.close();
})();
