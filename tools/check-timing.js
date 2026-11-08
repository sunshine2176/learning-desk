/* check-timing.js — 计时功能：走完一组口算，看用时卡、破纪录、家长面板最快纪录 */
'use strict';
const { chromium } = require('./pw');

const B = process.env.BASE || 'http://127.0.0.1:8808';

function calc(q) {
  const m = q.match(/^(\d+)\s*([+−\-×÷])\s*(\d+)/);
  if (!m) return 0;
  const a = +m[1], b = +m[3], op = m[2];
  if (op === '+') return a + b;
  if (op === '×') return a * b;
  if (op === '÷') return a / b;
  return a - b;
}

async function playOne(p, slow) {
  await p.waitForSelector('.qtext', { timeout: 8000 });
  const q = (await p.textContent('.qtext')).trim();
  const ans = String(calc(q));
  for (const ch of ans) await p.click(`.key[data-k="${ch}"]`);
  if (slow) await p.waitForTimeout(2600);
  await p.click('.key[data-k="enter"]');
  await p.waitForTimeout(700);
}

async function runSet(p, slow, first) {
  if (first) await p.click('button[data-act="startMath"]');
  for (let i = 0; i < 10; i++) {
    if (await p.locator('.time-box').count()) break;
    if (!(await p.locator('.qtext').count())) break;
    await playOne(p, slow);
  }
  await p.waitForSelector('.time-box', { timeout: 8000 });
  return (await p.textContent('.time-box')).replace(/\s+/g, ' ').trim();
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 834, height: 1112 } });
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });

  await p.goto(B + '/?go=math', { waitUntil: 'networkidle' });
  await p.waitForSelector('#unitSel, button[data-act="startMath"]');

  // 固定口径：10 道 · 简单
  await p.click('button.chip:has-text("10 道")');
  await p.click('button.chip:has-text("简单")');

  // 第 1 组：第一次
  const first = await runSet(p, false, true);
  console.log('第 1 组:', first);

  // 第 2 组：故意慢
  await p.click('button[data-act="again"]');
  const second = await runSet(p, true);
  console.log('第 2 组:', second);

  // 第 3 组：快 → 应该破纪录
  await p.click('button[data-act="again"]');
  const third = await runSet(p, false);
  console.log('第 3 组:', third);

  // 答题中是否在走秒
  await p.click('button[data-act="again"]');
  await p.waitForSelector('.qtext');
  const t1 = (await p.textContent('#tk')).trim();
  await p.waitForTimeout(1300);
  const t2 = (await p.textContent('#tk')).trim();
  console.log('计时器:', t1, '→', t2, t1 !== t2 ? '(在走)' : '(没动!)');

  // 家长面板
  await p.goto(B + '/?go=parent', { waitUntil: 'networkidle' });
  await p.waitForSelector('.card', { timeout: 8000 });
  const rows = await p.$$eval('table.wrongs tr', ns => ns.map(n => n.innerText.replace(/\s+/g, ' ').trim()));
  console.log('家长面板表格行:', rows.filter(r => /口算/.test(r)).join(' || ') || '(没找到口算行)');
  await p.screenshot({ path: '/tmp/shots/timing-parent.png', fullPage: true });

  const ok =
    /第一次计时/.test(first) &&
    /最快/.test(second) && /慢/.test(second) &&
    /新纪录/.test(third) &&
    t1 !== t2;
  console.log(ok ? 'PASS 计时' : 'FAIL 计时');
  await b.close();
})();
