'use strict';
/* 验证英语跟读模块：句包选择 → 录音跟读 → 对比回放 → 结果记录
 * 用法：node tools/check-english.js    （BASE 可指向线上）
 */
const { chromium } = require('./pw');
const BASE = process.env.BASE || 'http://127.0.0.1:8808';

const fails = [];
function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); fails.push(msg); }
}

(async () => {
  const b = await chromium.launch({
    channel: 'chrome',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const p = await b.newPage({ viewport: { width: 834, height: 1112 } });
  p.on('pageerror', e => { console.log('[pageerror]', e.message); fails.push('pageerror: ' + e.message); });

  console.log('\n[1] 首页入口与句包选择');
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  ok(await p.locator('button[data-v="english"]').count() === 1, '首页有「英语跟读」入口');
  await p.locator('button[data-v="english"]').click();
  await p.waitForSelector('.eng-preview');
  const chips = await p.locator('button[data-act="engPack"]').count();
  ok(chips === 8, `8 个句包 chips（实际 ${chips}）`);
  const rows = await p.locator('.eng-prev-row').count();
  ok(rows === 6, '当前包列出 6 句预览');
  ok(/还没练过|练过/.test(await p.textContent('.card')), '显示句包最近练习时间');

  console.log('\n[2] 跟读流程（假麦克风）');
  await p.locator('button[data-act="startEng"]').click();
  await p.waitForSelector('.eng-sent');
  const s1 = (await p.textContent('.eng-sent')).trim();
  ok(/^[A-Za-z]/.test(s1), `第一句显示英文「${s1}」`);
  ok((await p.textContent('.eng-zh')).trim().length > 0, '带中文意思');
  ok(await p.locator('button[data-act="engSlow"]').count() === 1, '有慢速播放按钮');

  // 录一句（假设备）→ 停止 → 自动出对比按钮
  await p.locator('button[data-act="engRec"]').click();
  await p.waitForTimeout(700);
  ok(await p.locator('button[data-act="engStop"]').count() === 1, '录音中有停止按钮');
  await p.waitForTimeout(800);
  await p.locator('button[data-act="engStop"]').click();
  await p.waitForSelector('button[data-act="engMine"]', { timeout: 6000 });
  ok(true, '录音停止后出现「听我的」对比按钮');
  ok(await p.locator('button[data-act="engGood"]').count() === 1 && await p.locator('button[data-act="engRetry"]').count() === 1, '有「读得不错 / 再来一遍」自评');

  console.log('\n[3] 走完整包');
  for (let i = 0; i < 6; i++) {
    if (!(await p.locator('button[data-act="engGood"]').count())) {
      // 还在录音前状态就补走一遍（理论上只有第 2 句起需要）
      await p.locator('button[data-act="engRec"]').click();
      await p.waitForTimeout(500);
      await p.locator('button[data-act="engStop"]').click();
      await p.waitForSelector('button[data-act="engGood"]', { timeout: 6000 });
    }
    await p.locator('button[data-act="engGood"]').click();
    await p.waitForTimeout(900);
  }
  await p.waitForSelector('.result-hero', { timeout: 6000 });
  const score = (await p.textContent('.result-hero .score')).replace(/\s+/g, '');
  ok(score === '6/6', `结果页 6 / 6（实际 ${score}）`);
  ok(await p.locator('.time-box').count() === 1, '结果页有计时卡');

  const saved = await p.evaluate(() => {
    const A = JSON.parse(localStorage.getItem('desk.attempts.v1') || '[]');
    return A.filter(x => x.subject === 'english');
  });
  ok(saved.length === 6, `英语记录进了 attempts（${saved.length} 条）`);
  ok(saved[0] && saved[0].ref === 'eng:e000' && saved[0].self === 1, 'ref 与自评标记正确');
  ok((saved[0].batch || '').length > 0, '带批次号（家长端能按组显示）');

  console.log('\n[4] 家长端显示');
  await p.goto(BASE + '/?go=parent', { waitUntil: 'networkidle' });
  await p.waitForSelector('.log-table', { timeout: 8000 });
  const logText = (await p.textContent('.log-table')).replace(/\s+/g, ' ');
  ok(/英语跟读/.test(logText), '家长端明细里出现「英语跟读」批次');
  ok(await p.locator('.stat:has-text("今天英语")').count() === 1, '统计格有「今天英语」卡片');

  await b.close();
  console.log(fails.length ? `\nFAIL ${fails.length} 项` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
