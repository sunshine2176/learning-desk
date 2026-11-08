/* shot-pinyin.js — 截拼音模块的三张图：设置页 / 答题页 / 结果页 */
'use strict';
const { chromium } = require('./pw');

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 834, height: 1112 } });
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });

  const B = process.env.BASE || 'http://127.0.0.1:8899';

  // 1. 设置页
  await p.goto(B + '/?go=pinyin', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: '/tmp/shots/py-setup.png' });

  // 2. 选变调 + 8 道，开始
  await p.click('button.chip:has-text("变调")');
  await p.waitForTimeout(250);
  await p.click('button.chip:has-text("8 道")');
  await p.waitForTimeout(250);
  await p.screenshot({ path: '/tmp/shots/py-setup2.png' });
  await p.click('button[data-act="startPy"]');
  await p.waitForSelector('.py-opt');
  await p.waitForTimeout(600);
  await p.screenshot({ path: '/tmp/shots/py-run.png' });

  // 3. 答一题（点第一个选项，看反馈）
  const first = await p.textContent('.py-word');
  await p.click('.py-opt');
  await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/shots/py-picked.png' });
  console.log('第一题:', first.trim(), '选项:', (await p.$$eval('.py-opt', ns => ns.map(n => n.textContent))).join(' / '));

  // 4. 做完进结果页
  await p.waitForTimeout(1600);
  for (let i = 0; i < 12; i++) {
    if (await p.locator('.result-hero').count()) break;
    if (await p.locator('.py-opt').count()) {
      await p.click('.py-opt');
      await p.waitForTimeout(1900);
    } else break;
  }
  await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/shots/py-result.png' });
  const score = await p.textContent('.score').catch(() => '(无)');
  console.log('结果:', score.replace(/\s+/g, ''));

  // 5. 家长面板看统计
  await p.goto(B + '/?go=parent', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const kinds = await p.evaluate(() =>
    [...document.querySelectorAll('table.wrongs tr')].map(r => r.innerText.replace(/\s+/g, ' ')).join(' || '));
  console.log('家长面板表格:', kinds.slice(0, 300));
  await p.screenshot({ path: '/tmp/shots/py-parent.png', fullPage: true });

  await b.close();
})();
