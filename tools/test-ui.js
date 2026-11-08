/* test-ui.js — 用 Playwright 真点一遍关键交互
 * 用法：node tools/test-ui.js   （需要本地静态服务在 8899）
 */
const path = require('path');
const PW = require('./pw');
const { chromium } = PW;

const BASE = process.env.BASE || 'http://127.0.0.1:8899';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 834, height: 1112 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  let pass = 0, fail = 0;
  const ok = (cond, label, extra) => {
    if (cond) { pass++; console.log('  ✓', label); }
    else { fail++; console.log('  ✗', label, extra === undefined ? '' : JSON.stringify(extra)); }
  };

  /* ---------- 口算：选项必须能点 ---------- */
  console.log('口算设置页');
  await page.goto(BASE + '/?go=math', { waitUntil: 'networkidle' });
  await page.waitForSelector('.chip');

  // 点「30 道」
  await page.click('button.chip:has-text("30 道")');
  await page.waitForTimeout(150);
  ok(await page.getAttribute('button.chip:has-text("30 道")', 'aria-pressed') === 'true', '选 30 道生效（aria-pressed）');

  // 点「挑战」
  await page.click('button.chip:has-text("挑战")');
  await page.waitForTimeout(150);
  ok(await page.getAttribute('button.chip:has-text("挑战")', 'aria-pressed') === 'true', '选难度「挑战」生效');
  ok(await page.getAttribute('button.chip:has-text("30 道")', 'aria-pressed') === 'true', '改难度后题数选择不丢');

  // 点「简单」再确认互斥
  await page.click('button.chip:has-text("简单")');
  await page.waitForTimeout(150);
  ok(await page.getAttribute('button.chip:has-text("简单")', 'aria-pressed') === 'true'
    && await page.getAttribute('button.chip:has-text("挑战")', 'aria-pressed') === 'false', '难度单选互斥');

  /* ---------- 口算：开始 → 键盘 → 判分 ---------- */
  console.log('口算答题');
  await page.click('button.chip:has-text("10 道")');
  await page.click('button[data-act="startMath"]');
  await page.waitForSelector('.key', { timeout: 5000 });
  const q = await page.textContent('.qtext').catch(() => '');
  ok(!!q, '题目已出现', q);

  // 数字键能输入
  await page.click('.key[data-k="1"]');
  await page.click('.key[data-k="2"]');
  await page.waitForTimeout(100);
  const ans1 = await page.textContent('#abox');
  ok(ans1 === '12', '数字键输入 12', ans1);

  // 退格能删
  await page.click('.key[data-k="del"]');
  await page.waitForTimeout(80);
  ok((await page.textContent('#abox')) === '1', '⌫ 退格生效');

  // 确定按钮推进（答错会停留 1.45s 展示答案，所以要多等）
  const before = await page.textContent('.counter');
  await page.click('.key[data-k="enter"]');
  await page.waitForTimeout(1900);
  const after = await page.textContent('.counter').catch(() => '');
  ok(before !== after, '点「确定」能进入下一题', { before, after });

  /* ---------- 听写：「听几个」必须能点 ---------- */
  console.log('听写设置页');
  await page.goto(BASE + '/?go=dict', { waitUntil: 'networkidle' });
  await page.waitForSelector('#unitSel');
  ok(true, '词表加载出单元下拉');
  const optCount = await page.locator('#unitSel option').count();
  ok(optCount === 9, '单元下拉 1 个全部 + 8 个单元', optCount);

  // 选第三单元 → 课文下拉应变成 3 课
  await page.selectOption('#unitSel', 'u3');
  await page.waitForTimeout(200);
  const lessonLabels = await page.locator('#lessonSel option').allTextContents();
  ok(lessonLabels.some(t => t.includes('彩虹')) && lessonLabels.some(t => t.includes('去外婆家')) && lessonLabels.some(t => t.includes('数星星的孩子')),
    '第三单元课文：彩虹/去外婆家/数星星的孩子', lessonLabels);

  // 选第 5 课 → 听写只出这课的词
  await page.selectOption('#lessonSel', '5');
  await page.click('button.chip:has-text("8 个")');
  await page.waitForTimeout(150);
  ok(await page.getAttribute('button.chip:has-text("8 个")', 'aria-pressed') === 'true', '「听几个」8 个可选');

  /* ---------- 复习入口（曾因 view 名不一致点不动） ---------- */
  console.log('复习入口');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.click('.tile.m-rev');
  await page.waitForTimeout(600);
  const topTitle = await page.textContent('#topbar .title').catch(() => '');
  ok(topTitle === '复习', '点首页「复习」能进入复习页', topTitle);
  ok(!(await page.textContent('body')).includes('我的学习台'), '确实离开了首页');

  /* ---------- 听写：没有对错按钮，只能「写完了」或「不会」 ---------- */
  console.log('听写答题');
  await page.goto(BASE + '/?go=dict', { waitUntil: 'networkidle' });
  await page.waitForSelector('#unitSel');
  await page.selectOption('#unitSel', 'u3');
  await page.waitForTimeout(200);
  await page.selectOption('#lessonSel', '4');
  await page.click('button.chip:has-text("8 个")');
  await page.click('button[data-act="startDict"]');
  await page.waitForSelector('.play-btn', { timeout: 5000 });

  const bodyTxt = await page.textContent('body');
  ok(!bodyTxt.includes('看答案'), '不出现「看答案」');
  ok(!bodyTxt.includes('写对了') && !bodyTxt.includes('写错了'), '没有「写对了/写错了」对错按钮');
  ok(await page.locator('button[data-act="judge"]').count() === 0, '答题页没有任何判对错按钮');
  ok(await page.locator('button[data-act="wordDone"]').count() === 1, '有「写完了，下一个」');
  ok(await page.locator('button[data-act="wordDunno"]').count() === 1, '有「不会，跳过」');

  const placeholder = await page.textContent('#bw');
  ok(/^○+$/.test(placeholder.trim()), '大字区只显示 ○ 占位，不泄露答案', placeholder);

  const total0 = parseInt((await page.textContent('.counter')).split('/')[1], 10);
  ok(total0 > 0, '拿到本组词数', total0);

  // 点「不会」推进
  await page.click('button[data-act="wordDunno"]');
  await page.waitForTimeout(800);
  ok((await page.textContent('.counter')).trim().startsWith('2'), '点「不会」进下一个词');

  // 点「写完了」推进
  await page.click('button[data-act="wordDone"]');
  await page.waitForTimeout(800);
  ok((await page.textContent('.counter')).trim().startsWith('3'), '点「写完了」进下一个词');

  // 剩下的全点「写完了」
  for (let i = 2; i < total0; i++) {
    await page.click('button[data-act="wordDone"]');
    await page.waitForTimeout(450);
  }

  const resTxt = await page.textContent('body');
  ok(resTxt.includes('不会的 1 个'), '结果页只报「不会」的词', resTxt.slice(0, 90));
  ok(!/\d+\s*\/\s*\d+\s*个词/.test(resTxt), '结果页不给对错分数');


  console.log('家长面板');
  await page.goto(BASE + '/?go=parent', { waitUntil: 'networkidle' });
  await page.waitForSelector('#dictWords');

  /* ---------- 听写核对：家长对着本子补判 ---------- */
  const chkRows = await page.locator('.chk-row').count();
  ok(chkRows === total0, '听写核对列出刚才那组的全部词', { chkRows, total0 });
  ok(await page.locator('.chk-tag.dunno').count() === 1, '孩子标「不会」的词显示为不会');
  ok(await page.locator('button.chk-btn.bad').count() === total0 - 1, '其余词都有「错」按钮待核', await page.locator('button.chk-btn.bad').count());

  // 点第一个「错」→ 该词进待攻克
  await page.locator('button.chk-btn.bad').first().click();
  await page.waitForTimeout(600);
  ok(await page.locator('.chk-tag.bad').count() === 1, '点「错」后标成待攻克');
  const kindRow = await page.evaluate(() => {
    // 「每天做了什么」的明细表里也有"听写"字样，要锁定 thead 带"正确率"的那张表
    const t = [...document.querySelectorAll('table.wrongs')].find(x => x.querySelector('thead') && x.querySelector('thead').textContent.includes('正确率'));
    const tr = t && [...t.querySelectorAll('tbody tr')].find(r => r.textContent.includes('听写'));
    return tr ? tr.innerText.replace(/\s+/g, ' ') : '';
  });
  ok(/\d+%/.test(kindRow), '家长核对后听写行出现真实正确率', kindRow);

  // 「剩下的都写对了」
  await page.click('button[data-act="markRest"]');
  await page.waitForTimeout(700);
  ok(await page.locator('button[data-act="markRest"]').count() === 0, '核完后不再显示「剩下的都写对了」');
  ok((await page.textContent('body')).includes('已核完'), '组头显示「已核完」');

  const parentTxt = await page.textContent('body');
  // v7 口径：家长核对过的词计入正确率 → 听写行标「已核对」；核完前才是「自评」
  ok(parentTxt.includes('已核对'), '正确率表把听写标为「已核对」（家长核对过的）');
  ok(parentTxt.includes('以你对本子为准'), '有「听写不算正确率」的说明');
  const ta = await page.inputValue('#dictWords');
  ok(ta.split('\n').filter(Boolean).length > 0, '词表编辑器有内容', ta.split('\n').slice(0, 3));

  await page.selectOption('#dictLessonSel', 'u3:5');
  await page.waitForTimeout(300);
  const ta2 = await page.inputValue('#dictWords');
  ok(ta2.includes('宝贝') && ta2.includes('去外婆家') === false, '切到第三单元第5课显示对应词', ta2.slice(0, 40));

  // 改一个词并保存 → 再回听写页确认
  await page.fill('#dictWords', '宝贝\n干活\n测试专用词');
  await page.click('button[data-act="saveDictLesson"]');
  await page.waitForTimeout(500);
  await page.goto(BASE + '/?go=dict', { waitUntil: 'networkidle' });
  await page.selectOption('#unitSel', 'u3');
  await page.waitForTimeout(200);
  const labels2 = await page.locator('#lessonSel option').allTextContents();
  ok(labels2.some(t => t.includes('（3）')), '保存后第5课词数变 3', labels2);

  // 恢复默认
  await page.goto(BASE + '/?go=parent', { waitUntil: 'networkidle' });
  page.on('dialog', d => d.accept());
  await page.click('button[data-act="resetDict"]');
  await page.waitForTimeout(600);
  await page.goto(BASE + '/?go=dict', { waitUntil: 'networkidle' });
  await page.selectOption('#unitSel', 'u3');
  await page.waitForTimeout(200);
  const labels3 = await page.locator('#lessonSel option').allTextContents();
  ok(labels3.some(t => t.includes('（10）')), '恢复默认后第5课回到 10 词', labels3);

  ok(errs.length === 0, '无 JS 报错', errs.slice(0, 3));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩了:', e); process.exit(2); });
