/* check-audio.js — 听写发音：确认播的是预录 mp3（不是系统 TTS），且能解码、能重播 */
'use strict';
const { chromium } = require('./pw');

const B = process.env.BASE || 'http://127.0.0.1:8808';

(async () => {
  const b = await chromium.launch({
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const p = await b.newPage({ viewport: { width: 834, height: 1112 } });
  const mp3 = [];
  p.on('response', r => { if (/\/audio\/d\d+\.mp3/.test(r.url())) mp3.push(r.status() + ' ' + r.url().split('/').pop()); });  // 200/206 都算正常（206 = Audio 的 Range 请求）
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });

  // 音频映射表在前端是否加载
  await p.goto(B + '/?go=dict', { waitUntil: 'networkidle' });
  const mapInfo = await p.evaluate(() => ({
    hasMap: !!window.AUDIO_MAP,
    n: window.AUDIO_MAP ? Object.keys(window.AUDIO_MAP).length : 0,
    sample: window.AUDIO_MAP ? window.AUDIO_MAP['勺子'] : null,
  }));
  console.log('映射表:', JSON.stringify(mapInfo));

  // 选第三单元第 6 课，开始
  await p.selectOption('#unitSel', 'u3');
  await p.waitForTimeout(300);
  await p.selectOption('#lessonSel', '6');
  await p.waitForTimeout(300);
  await p.click('button[data-act="startDict"]');
  await p.waitForSelector('.play-btn', { timeout: 8000 });
  await p.waitForTimeout(1600);   // 等自动播放第一题

  // 再听一遍
  await p.click('.play-btn');
  await p.waitForTimeout(1200);
  console.log('mp3 请求:', mp3.length ? mp3.join(' | ') : '(没有！还在用系统 TTS)');

  // 解码检查
  const dec = await p.evaluate(() => new Promise(res => {
    const a = new Audio('audio/d087.mp3');
    a.onloadedmetadata = () => res({ ok: true, dur: a.duration, src: a.src.split('/').pop() });
    a.onerror = () => res({ ok: false });
    setTimeout(() => res({ ok: false, timeout: true }), 5000);
  }));
  console.log('解码:', JSON.stringify(dec));

  // 自定义词表里的新词（没有录音）应回退系统朗读：只验证不会抛错
  const fallback = await p.evaluate(() => {
    const pre = [];
    const old = window.speechSynthesis.speak;
    window.speechSynthesis.speak = u => pre.push(u.text);
    return new Promise(res => {
      // 直接调 playWord 不可见（闭包内），改用映射表判断
      const has = !!window.AUDIO_MAP['不存在的词'];
      window.speechSynthesis.speak = old;
      res({ hasAudio: has });
    });
  });
  console.log('生词是否误配音频:', JSON.stringify(fallback));

  const pass = mapInfo.hasMap && mapInfo.n === 239 && mp3.some(x => x.startsWith('200') || x.startsWith('206')) && dec.ok;
  console.log(pass ? 'PASS 发音' : 'FAIL 发音');
  await b.close();
})();
