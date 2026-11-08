/* 小满学习台 · 前端 */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const main = document.getElementById('main');
const topbar = document.getElementById('topbar');
const toastEl = document.getElementById('toast');

const S = {
  view: 'home',
  math: null,
  dict: null,
  py: null,
  review: null,
  stats: null,
  units: null,
  today: { done: 0, due: 0, streak: 0 },
  pday: 0,                 // 家长端「每天做了什么」看的是几天前：0=今天
  cfg: Object.assign({ count: 20, level: 1, unit: 'all', lesson: 'all', dcount: 10, pcount: 12, pcat: 'all' }, load('cfg')),
};

/* ---------------- 工具 ---------------- */

function load(k) {
  try { return JSON.parse(localStorage.getItem('desk.' + k) || '{}'); } catch (e) { return {}; }
}
function save(k, v) {
  try { localStorage.setItem('desk.' + k, JSON.stringify(v)); } catch (e) {}
}
function saveCfg() { save('cfg', S.cfg); }

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

let actx = null;
function beep(ok) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    [0, 0.075].forEach((d, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.connect(g); g.connect(actx.destination);
      o.type = 'sine';
      o.frequency.value = ok ? (i ? 1320 : 880) : (i ? 240 : 320);
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.linearRampToValueAtTime(0.11, t + d + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
      o.start(t + d); o.stop(t + d + 0.18);
    });
  } catch (e) {}
}

let voiceReady = false;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices();
  return vs.find(v => /zh[-_]CN/i.test(v.lang)) || vs.find(v => /zh/i.test(v.lang)) || null;
}
function speak(text) {
  if (!('speechSynthesis' in window)) { toast('这个浏览器不支持朗读'); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.82;
    u.pitch = 1.02;
    const v = pickVoice();
    if (v) u.voice = v;
    speechSynthesis.speak(u);
    voiceReady = true;
  } catch (e) { toast('朗读失败'); }
}
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => { pickVoice(); };
}

/* ---------- 词语发音：预录 mp3 优先，系统 TTS 兜底 ----------
 * web/audio/*.mp3 由 tools/gen_audio.py 用神经 TTS 生成（239 个课本词）。
 * 系统 TTS 单念一个双字词时容易糊在一起，"勺子 / 秋千 / 转动"孩子听不出来，
 * 换成录音后每个词都清楚、每次播放完全一致，离线也能放。
 * 家长在面板里改词表后新加的词没有录音，自动回退到 speak()。
 */
const SILENT_MP3 = 'data:audio/mp3;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjcuMTAwAAAAAAAAAAAAAAD/84TAAAAAAAAAAAAASW5mbwAAAA8AAAAHAAABaACZmZmZmZmZmZmZmZmZmaqqqqqqqqqqqqqqqqqqu7u7u7u7u7u7u7u7u7vMzMzMzMzMzMzMzMzMzMzd3d3d3d3d3d3d3d3d3e7u7u7u7u7u7u7u7u7u//////////////////8AAAAATGF2YzYxLjE5AAAAAAAAAAAAAAAAJAJAAAAAAAAAAWjdYAorAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8xTEAAAAA0gAAAAATEFNRTMuMTAwVVX/8xTECwAAA0gAAAAAVVVVVVVVVVVVVVX/8xTEFgAAA0gAAAAAVVVVVVVVVVVVVVX/8xTEIQAAA0gAAAAAVVVVVVVVVVVVVVX/8xTELAAAA0gAAAAAVVVVVVVVVVVVVVX/8xTENwAAA0gAAAAAVVVVVVVVVVVVVVX/8xTEQgAAA0gAAAAAVVVVVVVVVVVVVVU=';
let audioEl = null;

function wordAudioUrl(word) {
  const m = window.AUDIO_MAP || {};
  return m[word] ? 'audio/' + m[word] + '.mp3' : '';
}
function ensureAudio() {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
  return audioEl;
}
// iOS 只在用户手势里放行首次播放：点「开始听写」时先播 0.1 秒静音把播放器解锁
function unlockAudio() {
  const el = ensureAudio();
  if (el.dataset.unlocked) return;
  el.dataset.unlocked = '1';
  try { el.src = SILENT_MP3; el.play().catch(() => {}); } catch (e) {}
}
// 默认连读两遍：第一遍没听清不用再点
function playWord(word, times) {
  const url = wordAudioUrl(word);
  if (!url) { speak(word); return; }
  const el = ensureAudio();
  let left = times || 2;
  el.onended = () => {
    left -= 1;
    if (left > 0) { try { el.currentTime = 0; el.play().catch(() => {}); } catch (e) {} }
  };
  el.onerror = () => { el.onerror = null; speak(word); };
  try {
    el.pause();
    el.src = url;
    el.currentTime = 0;
    const pr = el.play();
    if (pr && pr.catch) pr.catch(() => speak(word));
  } catch (e) { speak(word); }
}

// 播任意音频地址（英语句子的录音 / 孩子自己的跟读录音），rate<1 是慢速
function playUrl(url, rate) {
  const el = ensureAudio();
  el.onended = null;
  el.onerror = null;
  try {
    el.pause();
    el.src = url;
    el.currentTime = 0;
    el.playbackRate = rate || 1;
    const pr = el.play();
    if (pr && pr.catch) pr.catch(() => {});
  } catch (e) {}
}

/* ---------- 计时 ----------
 * 做题时右上角走秒；一组做完把总时长存下来（localStorage），
 * 和同口径（同科目、同难度、同题数、同范围）的历史最快比。
 * 5 道题和 20 道题比时间没意义，所以 key 里带全参数。
 */
let tickTimer = null;

function clockStr(ms) {
  // 秒表写法 0:03 / 1:05：不会和「3 / 8 道」的数字连在一起看错
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function durStr(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + ' 秒';
  return Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒';
}
function deltaStr(ms) {
  return ms < 1000 ? '1 秒以内' : durStr(ms);
}
function syncTicker() {
  clearInterval(tickTimer);
  tickTimer = null;
  const o = ({ math: S.math, pinyin: S.py, dict: S.dict, review: S.review, english: S.eng })[S.view];
  if (!o || o.phase !== 'run' || !o.t0) return;
  const tick = () => {
    const n = document.getElementById('tk');
    if (n) n.textContent = '· ' + clockStr(Date.now() - o.t0);
  };
  tick();
  tickTimer = setInterval(tick, 500);
}

// 结果页的计时卡：破纪录 / 首次 / 没破
function timeCard(t) {
  if (!t) return '';
  if (t.first) {
    return `<div class="time-box"><span class="tb-row">这次用了 <b>${durStr(t.ms)}</b></span>
      <span class="tb-note">第一次计时，已经记成这个项目的最好成绩</span></div>`;
  }
  if (t.isBest) {
    return `<div class="time-box best"><span class="tb-row">🏆 新纪录 <b>${durStr(t.ms)}</b></span>
      <span class="tb-note">比上次最快快了 ${deltaStr(t.delta)}（原 ${durStr(t.prevBest)}）</span></div>`;
  }
  return `<div class="time-box"><span class="tb-row">这次用了 <b>${durStr(t.ms)}</b></span>
    <span class="tb-note">最快 ${durStr(t.best)} · 慢了 ${deltaStr(-t.delta)}${t.n > 1 ? ` · 第 ${t.n} 次` : ''}</span></div>`;
}

function fmtDate() {
  const d = new Date();
  const w = '日一二三四五六'[d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${w}`;
}
function greet() {
  const h = new Date().getHours();
  if (h < 6) return '还没睡呀';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------------- 路由 ---------------- */

function go(view) {
  if (view === 'rev') view = 'review';   // 首页卡片传的是 rev
  S.view = view;
  if (view === 'home') refreshHome();
  else render();
  window.scrollTo(0, 0);
}

function setTop(title, back, hideParent) {
  topbar.innerHTML =
    (back ? `<button class="tb-btn" data-act="back">← 返回</button>` : `<div class="tb-btn ghost"></div>`) +
    `<div class="title">${esc(title)}</div>` +
    (hideParent ? `<div class="tb-btn ghost"></div>` : `<button class="tb-btn right" data-act="parent">家长</button>`);
}

function render() {
  if (S.view === 'home') renderHome();
  else if (S.view === 'math') renderMath();
  else if (S.view === 'dict') renderDict();
  else if (S.view === 'pinyin') renderPinyin();
  else if (S.view === 'english') renderEnglish();
  else if (S.view === 'review') renderReview();
  else if (S.view === 'parent') renderParent();
  syncTicker();
}

/* ---------------- 首页 ---------------- */

async function refreshHome() {
  renderHome();
  try {
    const [st, rv] = await Promise.all([api('/api/stats?days=7'), api('/api/review')]);
    S.stats = st;
    const done = (st.today || []).reduce((a, x) => a + x.n, 0);
    S.today = { done, due: (rv.items || []).length, streak: st.streak || 0 };
    fillHomeStats();
  } catch (e) { /* 静默：离线也该能进页面 */ }
}

function renderHome() {
  setTop('我的学习台', false);
  main.innerHTML = `
  <div class="page">
    <div class="h1">${greet()}</div>
    <div class="sub">${fmtDate()} · 今天练 10 分钟就很好</div>

    <div class="home-grid">
      <button class="tile m-math" data-act="go" data-v="math">
        <span class="ico">🧮</span>
        <div class="name">口算</div>
        <div class="desc">两位数加减 · 表内乘法 · 三档难度</div>
      </button>
      <button class="tile m-dict" data-act="go" data-v="dict">
        <span class="ico">✍️</span>
        <div class="name">听写</div>
        <div class="desc">听词写纸上，不会的点一下</div>
      </button>
      <button class="tile m-py" data-act="go" data-v="pinyin">
        <span class="ico">🔤</span>
        <div class="name">拼音</div>
        <div class="desc">选拼音 · 变调 · 多音字</div>
      </button>
      <button class="tile m-eng2" data-act="go" data-v="english">
        <span class="ico">🗣️</span>
        <div class="name">英语跟读</div>
        <div class="desc">听一句 · 跟读一句 · 对比回放</div>
      </button>
      <button class="tile m-rev" data-act="go" data-v="rev">
        <span class="ico">🔁</span>
        <div class="name">复习</div>
        <div class="desc">以前错的，今天再来一遍</div>
        <span class="badge" id="dueBadge" style="display:none">0</span>
      </button>
    </div>

    <div class="streak-row" id="homeStats"></div>
  </div>`;
  fillHomeStats();
}

function fillHomeStats() {
  const box = $('#homeStats');
  if (!box) return;
  const t = S.today || { done: 0, due: 0, streak: 0 };
  box.innerHTML = `
    <div class="pill">🔥 连续 <b>${t.streak || 0}</b> 天</div>
    <div class="pill">今日已做 <b>${t.done || 0}</b> 题</div>
    ${t.due ? `<div class="pill">待复习 <b>${t.due}</b> 题</div>` : `<div class="pill">没有待复习的</div>`}
  `;
  const b = $('#dueBadge');
  if (b) {
    if (t.due > 0) { b.style.display = 'block'; b.textContent = t.due; }
    else b.style.display = 'none';
  }
}

/* ---------------- 口算 ---------------- */

function renderMath() {
  const m = S.math;
  if (!m) return mathSetup();
  if (m.phase === 'done') return mathResult();
  return mathRun();
}

function mathSetup() {
  setTop('口算', true);
  const c = S.cfg;
  main.innerHTML = `
  <div class="page">
    <div class="h1">口算练习</div>
    <div class="sub">按北师大版二年级上册的范围出题</div>

    <div class="card" style="padding:22px">
      <div class="setup">
        <div class="field">
          <div class="label">做几道</div>
          <div class="chips">
            ${[10, 20, 30].map(n => `<button class="chip" data-act="cfg" data-k="count" data-v="${n}" aria-pressed="${c.count === n}">${n} 道</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <div class="label">难度</div>
          <div class="chips">
            ${[[1, '简单'], [2, '适中'], [3, '挑战']].map(([v, t]) => `<button class="chip" data-act="cfg" data-k="level" data-v="${v}" aria-pressed="${c.level === v}">${t}</button>`).join('')}
          </div>
        </div>
        <div style="color:var(--muted);font-size:13.5px;line-height:1.6">
          简单：两位数加减（含进位退位）+ 2~5 的乘法<br>
          适中：100 以内加减（含进位退位、100 减两位数）+ 全部口诀<br>
          挑战：连加连减、乘加乘减、除法、元角分
        </div>
        <button class="btn wide" data-act="startMath" style="margin-top:4px">开始</button>
      </div>
    </div>
  </div>`;
}

async function startMath() {
  try {
    const r = await api(`/api/quiz/math?count=${S.cfg.count}&level=${S.cfg.level}`);
    S.math = {
      items: r.items, i: 0, given: '', results: [], phase: 'run', locked: false, t0: Date.now(),
      runKey: 'math:' + S.cfg.level + ':' + r.items.length,
      runLabel: '口算 · ' + (LEVEL_NAME[S.cfg.level] || '') + ' · ' + r.items.length + ' 道',
    };
    render();
  } catch (e) { toast(e.message); }
}

function mathRun() {
  const m = S.math;
  const it = m.items[m.i];
  const pct = (m.i / m.items.length) * 100;
  setTop('口算', true);
  main.innerHTML = `
  <div class="page" style="max-width:520px;margin:0 auto">
    <div class="quiz-head">
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="counter">${m.i + 1} / ${m.items.length}<span class="tk" id="tk"></span></div>
    </div>

    <div class="qwrap">
      <div class="qtext">${esc(it.question)}</div>
      <div class="answer-box empty" id="abox">点数字</div>
      <div class="hintline" id="hint"></div>
    </div>

    <div class="keypad" id="pad">
      ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="key" data-k="${n}">${n}</button>`).join('')}
      <button class="key fn" data-k="del">⌫</button>
      <button class="key" data-k="0">0</button>
      <button class="key enter" data-k="enter">确定</button>
    </div>

    <div class="skip-row">
      <button class="btn ghost" data-act="skip">不会，看答案</button>
    </div>
  </div>`;
}

function paintAnswer() {
  const m = S.math;
  const box = $('#abox');
  if (!box || !m) return;
  if (m.given === '') {
    box.textContent = '点数字';
    box.className = 'answer-box empty';
  } else {
    box.textContent = m.given;
    box.className = 'answer-box';
  }
}

function keyPress(k) {
  const m = S.math;
  if (!m || m.phase !== 'run' || m.locked) return;
  if (k === 'del') m.given = m.given.slice(0, -1);
  else if (k === 'enter') return checkMath();
  else if (m.given.length < 4) m.given = (m.given === '0' ? '' : m.given) + k;
  paintAnswer();
}

function checkMath(forceSkip) {
  const m = S.math;
  if (m.locked) return;
  if (!forceSkip && m.given === '') return;
  m.locked = true;

  const it = m.items[m.i];
  const ok = !forceSkip && String(it.answer) === m.given;
  m.results.push({
    kind: it.kind, question: it.question, answer: it.answer,
    given: m.given || '—', ok, ref: 'math:' + it.question,
  });

  const box = $('#abox'), hint = $('#hint');
  if (box) {
    box.className = 'answer-box ' + (ok ? 'ok' : 'err');
    if (forceSkip && m.given === '') box.textContent = '—';
  }
  if (hint) {
    hint.className = 'hintline ' + (ok ? 'ok' : 'err');
    hint.textContent = ok ? '✓ 对了' : '正确答案是 ' + it.answer;
  }
  beep(ok);

  setTimeout(() => {
    m.i += 1;
    m.given = '';
    m.locked = false;
    if (m.i >= m.items.length) finishMath();
    else render();
  }, ok ? 560 : 1450);
}

function finishMath() {
  const m = S.math;
  m.phase = 'done';
  const ms = Date.now() - m.t0;
  m.elapsed = Math.round(ms / 1000);
  m.time = LD.saveRun(m.runKey || ('math:' + S.cfg.level + ':' + m.items.length), ms, m.runLabel);
  render();
  const items = m.results.map(r => ({
    kind: r.kind, ref: r.ref, question: r.question,
    answer: String(r.answer), given: String(r.given), ok: r.ok,
  }));
  post('/api/submit', { subject: 'math', items }).catch(() => toast('结果没能保存'));
}

function mathResult() {
  const m = S.math;
  const right = m.results.filter(r => r.ok).length;
  const total = m.results.length;
  const miss = m.results.filter(r => !r.ok);

  setTop('结果', true);
  main.innerHTML = `
  <div class="page" style="max-width:520px;margin:0 auto">
    <div class="card result-hero">
      <div class="score">${right}<span class="slash"> / ${total}</span></div>
      <div class="score-label">${miss.length ? `${miss.length} 道进了错题本` : '全对'}</div>
    </div>
    ${timeCard(m.time)}

    ${miss.length ? `
      <div class="miss-list">
        ${miss.map(r => `<div class="miss-item">
          <span class="q">${esc(r.question)}</span>
          <span class="g">${esc(r.given)}</span>
          <span class="a">${esc(r.answer)}</span>
        </div>`).join('')}
      </div>` : `<div class="empty-note">一道都没错，厉害。</div>`}

    <div class="actions">
      <button class="btn sec" data-act="go" data-v="home">回首页</button>
      <button class="btn" data-act="again">再来一组</button>
    </div>
  </div>`;
}

/* ---------------- 听写 ---------------- */

async function renderDict() {
  if (!S.dict) return await dictSetup();
  if (S.dict.phase === 'done') return dictResult();
  return dictRun();
}

function lessonOptions(units, unitId, cur) {
  const u = (units || []).find(x => x.id === unitId);
  const ls = (u && u.lessons) || [];
  const usable = ls.filter(l => l.count > 0);
  if (!usable.length) return `<option value="all">全部课</option>`;
  return `<option value="all" ${cur === 'all' ? 'selected' : ''}>全部课（${u.count} 个词）</option>` +
    usable.map(l => `<option value="${l.id}" ${cur === l.id ? 'selected' : ''}>第 ${l.no} 课 ${esc(l.title)}（${l.count}）</option>`).join('');
}

async function dictSetup() {
  setTop('听写', true);
  main.innerHTML = `<div class="page"><div class="h1">听写</div><div class="sub">加载词表中…</div></div>`;
  try {
    if (!S.units) S.units = await api('/api/dict/units');
    const c = S.cfg;
    const units = S.units.units || [];
    const curUnit = units.some(u => u.id === c.unit) ? c.unit : 'all';
    const total = units.reduce((a, u) => a + u.count, 0);
    main.innerHTML = `
    <div class="page">
      <div class="h1">听写</div>
      <div class="sub">点播放听词，写在纸上。不会的点「不会」，最后再听一遍</div>

      <div class="card" style="padding:22px">
        <div class="setup">
          <div class="field">
            <div class="label">选单元</div>
            <select class="unit" id="unitSel">
              <option value="all" ${curUnit === 'all' ? 'selected' : ''}>全部单元（${total} 个词）</option>
              ${units.map(u => `<option value="${u.id}" ${curUnit === u.id ? 'selected' : ''}>${esc(u.name)}（${u.count}）</option>`).join('')}
            </select>
          </div>
          <div class="field" id="lessonField">
            <div class="label">选课文</div>
            <select class="unit" id="lessonSel">${lessonOptions(units, curUnit, c.lesson || 'all')}</select>
          </div>
          <div class="field">
            <div class="label">听几个</div>
            <div class="chips">
              ${[8, 10, 15, 20].map(n => `<button class="chip small" data-act="cfg" data-k="dcount" data-v="${n}" aria-pressed="${c.dcount === n}">${n} 个</button>`).join('')}
            </div>
          </div>
          <div style="color:var(--muted);font-size:13.5px;line-height:1.6">
            ${esc(S.units.note || '')}${S.units.custom ? '<br><b>当前用的是家长面板里改过的词表。</b>' : ''}<br>每个词会连读两遍；没听清随时点上面的喇叭重听。
          </div>
          <button class="btn wide" data-act="startDict" style="margin-top:4px">开始听写</button>
        </div>
      </div>
    </div>`;
  } catch (e) {
    main.innerHTML = `<div class="page"><div class="h1">听写</div><div class="empty-note">词表读不到：${esc(e.message)}</div></div>`;
  }
}

async function startDict() {
  const sel = $('#unitSel');
  if (sel) S.cfg.unit = sel.value;
  const ls = $('#lessonSel');
  if (ls) S.cfg.lesson = ls.value;
  if (S.cfg.unit === 'all') S.cfg.lesson = 'all';
  saveCfg();
  try {
    const r = await api(`/api/quiz/dictation?unit=${encodeURIComponent(S.cfg.unit)}&lesson=${encodeURIComponent(S.cfg.lesson || 'all')}&count=${S.cfg.dcount}`);
    if (!r.items.length) return toast('这个单元没有词');
    const unitObj = ((S.units && S.units.units) || []).find(u => u.id === S.cfg.unit);
    const uName = S.cfg.unit === 'all' ? '整册' : String((unitObj && unitObj.name || S.cfg.unit)).split(' · ')[0];
    const lName = S.cfg.lesson && S.cfg.lesson !== 'all' ? ' 第' + S.cfg.lesson + '课' : '';
    S.dict = {
      items: r.items, i: 0, results: [], phase: 'run', locked: false, t0: Date.now(),
      runKey: 'dict:' + S.cfg.unit + '/' + (S.cfg.lesson || 'all') + ':' + r.items.length,
      runLabel: '听写 · ' + uName + lName + ' · ' + r.items.length + ' 个词',
    };
    // iOS 需要用户手势解锁语音
    unlockAudio();   // 在这个点击手势里把播放器解锁，后面自动播才不会被 iOS 拦
    setTimeout(() => { if (S.dict && S.dict.phase === 'run') playWord(S.dict.items[0].word); }, 500);
    render();
  } catch (e) { toast(e.message); }
}

function dictRun() {
  const d = S.dict;
  const it = d.items[d.i];
  const pct = (d.i / d.items.length) * 100;
  setTop('听写', true);
  main.innerHTML = `
  <div class="page" style="max-width:520px;margin:0 auto">
    <div class="quiz-head">
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="counter">${d.i + 1} / ${d.items.length}<span class="tk" id="tk"></span></div>
    </div>

    <div class="dict-stage">
      <button class="play-btn" data-act="play">
        <span class="spk">🔊</span>
        <span>再听一遍</span>
      </button>

      <div class="big-word" id="bw">${'○'.repeat(it.word.length)}</div>
      <div style="color:var(--muted);font-size:14px;text-align:center;margin-top:8px">写在纸上，写完点下面</div>

      <button class="btn wide" data-act="wordDone" style="margin-top:24px">写完了，下一个</button>
      <div style="margin-top:12px;text-align:center">
        <button class="btn ghost" data-act="wordDunno" style="font-size:15px;padding:10px 20px">不会，跳过</button>
      </div>
    </div>
  </div>`;
}

/* mark: 'done' 中性（既不算对也不算错）| 'dunno' 孩子自报不会，进待攻克 */
function wordNext(mark) {
  const d = S.dict;
  if (!d || d.locked) return;
  d.locked = true;
  const it = d.items[d.i];
  d.results.push({
    word: it.word, mark,
    ok: mark === 'dunno' ? 0 : null,
    ref: 'word:' + it.word, unit: it.unit_name || '',
  });
  if (mark === 'dunno') beep(false);
  setTimeout(() => {
    d.i += 1;
    d.locked = false;
    if (d.i >= d.items.length) finishDict();
    else { render(); setTimeout(() => playWord(d.items[d.i].word), 220); }
  }, 260);
}

function finishDict() {
  const d = S.dict;
  d.phase = 'done';
  const ms = Date.now() - d.t0;
  d.elapsed = Math.round(ms / 1000);
  d.time = LD.saveRun(d.runKey || 'dict', ms, d.runLabel);
  // 留一份给家长核对本子：孩子点「写完了」是中性记录，机器不知道写没写对
  LD.saveLastDict(d.results.map(r => ({
    word: r.word, unit: r.unit || '', mark: r.mark, verdict: null,
  })));
  render();
  const items = d.results.map(r => ({
    kind: 'word', ref: r.ref, question: r.word, answer: r.word,
    given: r.mark === 'dunno' ? '不会' : '',
    ok: r.mark === 'dunno' ? 0 : null,   // 中性：不参与正确率
    self: 1,                              // 自评，家长核对才算数
  }));
  post('/api/submit', { subject: 'dictation', items }).catch(() => toast('结果没能保存'));
}

function dictResult() {
  const d = S.dict;
  const total = d.results.length;
  const dunno = d.results.filter(r => r.mark === 'dunno');

  setTop('结果', true);
  main.innerHTML = `
  <div class="page" style="max-width:520px;margin:0 auto">
    <div class="card result-hero">
      <div class="score">${total}<span class="slash"> 个词</span></div>
      <div class="score-label">${dunno.length ? `你标了 ${dunno.length} 个不会，这些词过两天再听一遍` : '这组都写完了'}</div>
    </div>
    ${timeCard(d.time)}

    ${dunno.length ? `
      <div class="section-title">不会的 ${dunno.length} 个</div>
      <div class="miss-list">
        ${dunno.map(r => `<div class="miss-item"><span class="q">${esc(r.word)}</span><span class="tag d">${esc(r.unit || '')}</span></div>`).join('')}
      </div>` : `<div class="empty-note" style="margin-top:20px">拿不准的等爸爸妈妈对一下本子。</div>`}

    <div class="actions">
      <button class="btn sec" data-act="go" data-v="home">回首页</button>
      <button class="btn" data-act="againDict">再听一组</button>
    </div>
  </div>`;
}

/* ---------------- 拼音 ---------------- */

const LEVEL_NAME = { 1: '简单', 2: '适中', 3: '挑战' };

const PY_CATS = [
  ['all', '全部', '这学期课本里的词，随机'],
  ['medial', '介音', '边 biān 别读成班 bān（ian/uan 漏了介音）'],
  ['sandhi', '变调', '「一、不」变调，两个三声相连'],
  ['poly', '多音字', '同一个字，两种读法'],
  ['nasal', '前后鼻音', 'an/ang · en/eng · in/ing'],
  ['flat', '平翘舌', 'z/zh · c/ch · s/sh · n/l'],
  ['light', '轻声', '第二个字读得又轻又短'],
];

function renderPinyin() {
  const p = S.py;
  if (!p) return pySetup();
  if (p.phase === 'done') return pyResult();
  return pyRun();
}

function pyScopeItems(unit, lesson) {
  return (typeof LD !== 'undefined' && LD.pinyin) ? LD.pinyin.scope(unit, lesson) : [];
}

async function pySetup() {
  setTop('拼音', true);
  main.innerHTML = `<div class="page"><div class="h1">拼音练习</div><div class="sub">加载课本词表…</div></div>`;
  try { if (!S.units) S.units = await api('/api/dict/units'); } catch (e) { S.units = null; }
  const c = S.cfg;
  const cur = PY_CATS.find(x => x[0] === c.pcat) || PY_CATS[0];
  const units = (S.units && S.units.units) || [];
  const curUnit = units.some(u => u.id === c.unit) ? c.unit : 'all';
  const curLesson = curUnit === 'all' ? 'all' : (c.lesson || 'all');
  const nScope = pyScopeItems(curUnit, curLesson).length;
  const nAll = pyScopeItems('all', 'all').length;
  const nBook = pyScopeItems('all', 'all').filter(x => x.u).length;
  main.innerHTML = `
  <div class="page">
    <div class="h1">拼音练习</div>
    <div class="sub">点一下就选，机器判分</div>

    <div class="card" style="padding:22px">
      <div class="setup">
        <div class="field">
          <div class="label">练哪些词</div>
          <select class="unit" id="unitSel">
            <option value="all" ${curUnit === 'all' ? 'selected' : ''}>整册课本（${nBook} 个词 + ${nAll - nBook} 条变调专项）</option>
            ${units.map(u => `<option value="${u.id}" ${curUnit === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <div class="label">哪一课</div>
          <select class="unit" id="lessonSel">${lessonOptions(units, curUnit, curLesson)}</select>
        </div>
        <div class="field">
          <div class="label">练什么</div>
          <div class="chips">
            ${PY_CATS.map(([k, t]) => `<button class="chip" data-act="cfg" data-k="pcat" data-v="${k}" data-str="1" aria-pressed="${c.pcat === k}">${t}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <div class="label">做几道</div>
          <div class="chips">
            ${[8, 12, 20].map(n => `<button class="chip" data-act="cfg" data-k="pcount" data-v="${n}" aria-pressed="${c.pcount === n}">${n} 道</button>`).join('')}
          </div>
        </div>
        <div style="color:var(--muted);font-size:13.5px;line-height:1.6">
          <b style="color:var(--ink)">${esc(cur[1])}</b>：${esc(cur[2])}<br>
          两个三声连在一起时，前一个字读成二声，但写拼音还写原来的调——这种题只问「读第几声」。
          ${nScope ? `<br>这个范围里有 <b style="color:var(--ink)">${nScope}</b> 个词${nScope < c.pcount ? '，题数比词多时会重复出' : ''}。` : ''}
          ${S.units && S.units.custom ? '<br>拼音题是按原版课本生成的，家长改过的词表不影响拼音。' : ''}
        </div>
        <button class="btn wide" data-act="startPy" style="margin-top:4px">开始</button>
      </div>
    </div>
  </div>`;
}

async function startPy() {
  const us = $('#unitSel');
  if (us) S.cfg.unit = us.value;
  const ls = $('#lessonSel');
  if (ls) S.cfg.lesson = ls.value;
  if (S.cfg.unit === 'all') S.cfg.lesson = 'all';
  saveCfg();
  try {
    const r = await api(`/api/quiz/pinyin?count=${S.cfg.pcount}&cat=${encodeURIComponent(S.cfg.pcat)}&unit=${encodeURIComponent(S.cfg.unit)}&lesson=${encodeURIComponent(S.cfg.lesson || 'all')}`);
    if (!r.items || !r.items.length) return toast('题库读不到');
    const catName = (PY_CATS.find(x => x[0] === S.cfg.pcat) || PY_CATS[0])[1];
    const unitObj = ((S.units && S.units.units) || []).find(u => u.id === S.cfg.unit);
    const uName = S.cfg.unit === 'all' ? '整册' : String((unitObj && unitObj.name || S.cfg.unit)).split(' · ')[0];
    const lName = S.cfg.lesson && S.cfg.lesson !== 'all' ? ' 第' + S.cfg.lesson + '课' : '';
    S.py = {
      items: r.items, i: 0, results: [], phase: 'run', picked: null, locked: false, t0: Date.now(), opts: null,
      runKey: 'py:' + S.cfg.pcat + ':' + r.items.length + ':' + S.cfg.unit + '/' + (S.cfg.lesson || 'all'),
      runLabel: '拼音 · ' + catName + ' · ' + r.items.length + ' 道 · ' + uName + lName,
    };
    render();
  } catch (e) { toast(e.message); }
}

function markWord(w, idx) {
  return Array.from(w).map((ch, i) =>
    i === idx ? `<em>${esc(ch)}</em>` : esc(ch)).join('');
}

function pyOptClass(i) {
  const p = S.py;
  if (!p || p.picked === null || p.picked === undefined) return '';
  const q = p.items[p.i];
  if (i === q.ans) return 'ok';
  if (i === p.picked) return 'err';
  return 'dim';
}

function pyRun() {
  const p = S.py;
  const q = p.items[p.i];
  const isTone = q.form === 'tone';
  setTop('拼音', true);
  main.innerHTML = `
  <div class="page" style="max-width:560px;margin:0 auto">
    <div class="quiz-head">
      <div class="bar"><i style="width:${(p.i / p.items.length) * 100}%"></i></div>
      <div class="counter">${p.i + 1} / ${p.items.length}<span class="tk" id="tk"></span></div>
    </div>

    <div class="py-stage">
      <div class="py-tip">${isTone ? '读的时候，这个字读第几声？' : '下面哪个拼音是对的？'}</div>
      <div class="py-word">${markWord(q.w, isTone ? q.sy : -1)}</div>
    </div>

    <div class="py-opts">
      ${q.opts.map((t, i) =>
        `<button class="py-opt ${pyOptClass(i)}" data-act="pyPick" data-i="${i}">${esc(t)}</button>`).join('')}
    </div>
  </div>`;
}

function pyPick(i) {
  const p = S.py;
  if (!p || p.locked || p.phase !== 'run') return;
  const q = p.items[p.i];
  p.locked = true;
  p.picked = i;
  const ok = i === q.ans;
  p.results.push({
    kind: q.kind, ref: 'pinyin:' + q.w,
    question: q.question, answer: q.answer, given: q.opts[i], ok,
  });
  beep(ok);
  render();
  setTimeout(() => {
    p.i += 1;
    p.picked = null;
    p.locked = false;
    if (p.i >= p.items.length) finishPy();
    else render();
  }, ok ? 620 : 1700);
}

function finishPy() {
  const p = S.py;
  p.phase = 'done';
  const ms = Date.now() - p.t0;
  p.elapsed = Math.round(ms / 1000);
  p.time = LD.saveRun(p.runKey || 'py', ms, p.runLabel);
  render();
  post('/api/submit', { subject: 'pinyin', items: p.results }).catch(() => toast('结果没能保存'));
}

function pyResult() {
  const p = S.py;
  const right = p.results.filter(r => r.ok).length;
  const total = p.results.length;
  const miss = p.results.filter(r => !r.ok);

  setTop('结果', true);
  main.innerHTML = `
  <div class="page" style="max-width:560px;margin:0 auto">
    <div class="card result-hero">
      <div class="score">${right}<span class="slash"> / ${total}</span></div>
      <div class="score-label">${miss.length ? `${miss.length} 道进了错题本` : '全对'}</div>
    </div>
    ${timeCard(p.time)}

    ${miss.length ? `
      <div class="py-miss-list">
        ${miss.map(r => `<div class="py-miss">
          <span class="w">${esc(r.question)}</span>
          <span class="a">${esc(r.answer)}</span>
          <span class="g">你选了 ${esc(r.given)}</span>
        </div>`).join('')}
      </div>` : `<div class="empty-note">全对，拼音很稳。</div>`}

    <div class="actions">
      <button class="btn sec" data-act="go" data-v="home">回首页</button>
      <button class="btn" data-act="againPy">再来一组</button>
    </div>
  </div>`;
}

/* ---------------- 英语跟读 ----------------
 * 设计：整句输出优先于背单词（业内儿童口语训练的主流做法）：
 * 听原句 → 自己读一遍并录音 → 回放对比 → 自评。
 * 不用语音识别打分——机器给儿童发音打分太苛刻，容易打击开口意愿；
 * 自己听自己的录音和原音对比，比一个分数有用得多。
 * 句包按句型组织（I like ___ / Where is ___），一次一包六句。
 */

const ENG_REC_OK = typeof MediaRecorder !== 'undefined';

function engPackSeen() {
  // 每个句包最近一次练的时间，用于推荐「最久没练的」
  return LD.lastSeenByPack ? LD.lastSeenByPack() : {};
}

function renderEnglish() {
  if (!S.eng) return engSetup();
  const e = S.eng;
  if (e.phase === 'done') return engResult();
  return engRun();
}

function engSetup() {
  setTop('英语跟读', true);
  const packs = (window.ENGLISH && ENGLISH.packs) || [];
  const seen = engPackSeen();
  // 默认选最久没练的包（从没练过的排最前）
  const order = packs.slice().sort((a, b) => {
    const ta = seen[a.id] || '', tb = seen[b.id] || '';
    return (ta || '0').localeCompare(tb || '0');
  });
  if (!S.engPack || !packs.find(p => p.id === S.engPack)) S.engPack = order.length ? order[0].id : null;
  const cur = packs.find(p => p.id === S.engPack);
  const seenLabel = ts => {
    if (!ts) return '还没练过';
    const days = Math.round((Date.now() - new Date(ts.replace(' ', 'T'))) / 86400000);
    return days <= 0 ? '今天练过' : days === 1 ? '昨天练过' : days + ' 天前练过';
  };
  main.innerHTML = `
  <div class="page" style="max-width:560px;margin:0 auto">
    <div class="h1">英语跟读</div>
    <div class="sub">听一句，自己读一遍，再听录音对比——句子说出来才算会</div>

    <div class="chips" style="margin-top:18px">
      ${packs.map(p => `<button class="chip small" data-act="engPack" data-v="${p.id}" aria-pressed="${p.id === S.engPack}">${esc(p.title)}</button>`).join('')}
    </div>

    ${cur ? `
    <div class="card" style="margin-top:18px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="font-size:19px;font-weight:700">${esc(cur.title)}</div>
        <div style="font-size:12.5px;color:var(--muted);white-space:nowrap">${seenLabel(seen[cur.id])}</div>
      </div>
      <div style="font-size:15px;color:var(--accent);font-weight:600;margin-top:6px">${esc(cur.frame)}</div>
      <div class="eng-preview">
        ${cur.s.map(x => `<div class="eng-prev-row"><span>${esc(x.text)}</span><i>${esc(x.zh)}</i></div>`).join('')}
      </div>
      <div style="font-size:13px;color:var(--muted);line-height:1.7;margin-top:12px">
        ① 点开始，自动读第一句　② 跟着读一遍并录音　③ 回放自己的录音和原音对比，读得像就过，不像就再来一遍。
      </div>
      <div style="margin-top:16px">
        <button class="btn wide" data-act="startEng">开始，共 ${cur.s.length} 句</button>
      </div>
      ${!ENG_REC_OK ? '<div style="font-size:12.5px;color:var(--err);margin-top:10px">这台设备的浏览器不支持录音，只能听和跟读，没有对比回放。</div>' : ''}
    </div>` : ''}
  </div>`;
}

function startEng() {
  const pack = ((window.ENGLISH && ENGLISH.packs) || []).find(p => p.id === S.engPack);
  if (!pack) return;
  S.eng = {
    pack, items: pack.s, i: 0, results: [], phase: 'run', locked: false,
    t0: Date.now(), blob: null, recording: false, rec: null, noRec: !ENG_REC_OK,
  };
  setTop('英语跟读', true);
  unlockAudio();          // 在这个点击手势里解锁播放器，自动播第一句不被 iOS 拦
  render();
  setTimeout(() => playUrl(pack.s[0].audio), 450);
}

function engRun() {
  const e = S.eng;
  const it = e.items[e.i];
  const pct = (e.i / e.items.length) * 100;
  setTop('英语跟读', true);
  main.innerHTML = `
  <div class="page" style="max-width:560px;margin:0 auto">
    <div class="quiz-head">
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="counter">${e.i + 1} / ${e.items.length}<span class="tk" id="tk"></span></div>
    </div>
    <div class="eng-stage">
      <div class="eng-frame">${esc(e.pack.frame)}</div>
      <div class="big-word eng-sent">${esc(it.text)}</div>
      <div class="eng-zh">${esc(it.zh)}</div>
      <div class="eng-btns">
        <button class="play-btn" data-act="engPlay"><span class="spk">🔊</span><span>原音</span></button>
        <button class="play-btn" data-act="engSlow"><span class="spk">🐢</span><span>慢速</span></button>
      </div>
      ${e.recording ? `
        <button class="btn wide rec-on" data-act="engStop">⏹ 说完了，点一下</button>
        <div style="color:var(--muted);font-size:13.5px;text-align:center;margin-top:10px">正在录音…读完点上面</div>
      ` : e.blob ? `
        <div class="eng-btns">
          <button class="play-btn" data-act="engMine"><span class="spk">🎧</span><span>听我的</span></button>
        </div>
        <div class="judge-row">
          <button class="judge yes" data-act="engGood">读得不错</button>
          <button class="judge no" data-act="engRetry">再来一遍</button>
        </div>
      ` : `
        <button class="btn wide" data-act="engRec" ${e.noRec ? 'disabled style="opacity:.5"' : ''}>🎙 跟着读一遍（点一下开始录音）</button>
        ${e.noRec ? '<div style="color:var(--muted);font-size:13px;text-align:center;margin-top:8px">不支持录音，读完直接点「读得不错」</div>' : '<div style="color:var(--muted);font-size:13.5px;text-align:center;margin-top:10px">先听 1-2 遍原音，再录</div>'}
      `}
    </div>
  </div>`;
}

function finishEng() {
  const e = S.eng;
  e.phase = 'done';
  const ms = Date.now() - e.t0;
  e.elapsed = Math.round(ms / 1000);
  e.time = LD.saveRun('eng:' + e.pack.id + ':' + e.items.length, ms, '英语跟读 · ' + e.pack.title);
  render();
  post('/api/submit', {
    subject: 'english',
    items: e.results.map(r => ({
      kind: 'talk', ref: r.ref, question: r.text, answer: r.text,
      given: r.ok ? '跟读' : '', ok: r.ok ? 1 : null, self: 1,
    })),
  }).catch(() => {});
}

function engResult() {
  const e = S.eng;
  setTop('英语跟读', true);
  main.innerHTML = `
  <div class="page" style="max-width:520px;margin:0 auto">
    <div class="card result-hero">
      <div class="score">${e.results.length}<span class="slash"> / ${e.items.length}</span></div>
      <div class="score-label">${e.results.length === e.items.length ? '整包读完了，句子要常说才顺' : '练了 ' + e.results.length + ' 句'}</div>
    </div>
    ${timeCard(e.time)}
    <div class="actions" style="display:flex;flex-direction:column;gap:10px;max-width:420px;margin:0 auto">
      <button class="btn wide" data-act="engAgainPack">这一包再来一遍</button>
      <button class="btn sec wide" data-act="engOther">换一包</button>
      <button class="btn ghost wide" data-act="go" data-v="home">回首页</button>
    </div>
  </div>`;
}

async function engRec() {
  const e = S.eng;
  if (!e || e.recording || e.blob) return;
  if (!ENG_REC_OK) return toast('这台设备不支持录音');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    e.noRec = true;
    render();
    return toast('拿不到麦克风，检查一下权限');
  }
  try {
    e.rec = new MediaRecorder(stream);
  } catch (err) {
    stream.getTracks().forEach(t => t.stop());
    e.noRec = true;
    render();
    return toast('这台设备不支持录音');
  }
  e.chunks = [];
  e.rec.ondataavailable = ev => { if (ev.data && ev.data.size) e.chunks.push(ev.data); };
  e.rec.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    const type = (e.chunks[0] && e.chunks[0].type) || 'audio/webm';
    e.blob = new Blob(e.chunks, { type });
    // 立刻生成回放地址：等 350ms 再造的话，孩子可能已经点了下一句、blob 被清空
    e.blobUrl = URL.createObjectURL(e.blob);
    e.recording = false;
    render();
    setTimeout(() => { if (e.blobUrl) playUrl(e.blobUrl); }, 350);  // 录完自动放给他听
  };
  e.rec.start();
  e.recording = true;
  render();
}

function engStop() {
  const e = S.eng;
  if (e && e.rec && e.recording) { try { e.rec.stop(); } catch (x) { e.recording = false; render(); } }
}

function engNext(okFlag) {
  const e = S.eng;
  const it = e.items[e.i];
  e.results.push({ ref: 'eng:' + it.id, text: it.text, ok: okFlag });
  e.blob = null;
  e.blobUrl = null;
  e.rec = null;
  if (e.i + 1 >= e.items.length) return finishEng();
  e.i += 1;
  render();
  setTimeout(() => playUrl(e.items[e.i].audio), 400);
}

/* ---------------- 复习 ---------------- */

async function renderReview() {
  if (!S.review) {
    setTop('复习', false);
    main.innerHTML = `<div class="page"><div class="h1">复习</div><div class="sub">正在找今天该复习的…</div></div>`;
    try {
      const r = await api('/api/review');
      S.review = { items: r.items, i: 0, given: '', results: [], phase: r.items.length ? 'run' : 'empty', locked: false, t0: Date.now(), opts: null, picked: null };
    } catch (e) {
      main.innerHTML = `<div class="page"><div class="h1">复习</div><div class="empty-note">${esc(e.message)}</div></div>`;
      return;
    }
  }
  const r = S.review;
  if (r.phase === 'empty') return reviewEmpty();
  if (r.phase === 'done') return reviewResult();
  return reviewRun();
}

function reviewEmpty() {
  setTop('复习', false);
  main.innerHTML = `
  <div class="page">
    <div class="h1">今天没有要复习的</div>
    <div class="empty-note">错的题会按 1 天 / 3 天 / 7 天 / 15 天 的样子再来找你。<br>没有就说明都记住了。</div>
    <div class="actions" style="max-width:420px;margin:0 auto">
      <button class="btn wide" data-act="go" data-v="home">回首页</button>
    </div>
  </div>`;
}

function reviewRun() {
  const r = S.review;
  const it = r.items[r.i];
  const pct = (r.i / r.items.length) * 100;
  setTop('复习', true);

  if (it.subject === 'dictation') {
    main.innerHTML = `
    <div class="page" style="max-width:520px;margin:0 auto">
      <div class="quiz-head">
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="counter">${r.i + 1} / ${r.items.length}<span class="tk" id="tk"></span></div>
      </div>
      <div class="dict-stage">
        <div style="color:var(--muted);font-size:14px;margin-bottom:4px">${it.src === 'school' ? '学校听写时写错的' : `这个词之前错过 ${it.wrong} 次`}</div>
        <button class="play-btn" data-act="playWord" data-w="${esc(it.question)}">
          <span class="spk">🔊</span><span>播放</span>
        </button>
        ${r.revealed ? `
        <div class="big-word">${esc(it.question)}</div>
        <div style="color:var(--muted);font-size:14px;text-align:center;margin-top:8px">对着你写的字看一遍，一样吗</div>
        <div class="judge-row" style="margin-top:20px">
          <button class="judge yes" data-act="judge" data-ok="1">写对了</button>
          <button class="judge no"  data-act="judge" data-ok="0">写错了</button>
        </div>` : `
        <div class="big-word" id="bw">${'○'.repeat(it.question.length)}</div>
        <div style="color:var(--muted);font-size:14px;text-align:center;margin-top:8px">先写在纸上，写完再看答案</div>
        <div style="margin-top:22px;display:flex;justify-content:center">
          <button class="btn wide" data-act="reveal" style="max-width:260px">写完了，对答案</button>
        </div>`}
      </div>
    </div>`;
  } else if (it.kind === 'py' || it.kind === 'pytone') {
    if (!r.opts) r.opts = reviewPyOpts(it);
    const o = r.opts;
    main.innerHTML = `
    <div class="page" style="max-width:560px;margin:0 auto">
      <div class="quiz-head">
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="counter">${r.i + 1} / ${r.items.length}<span class="tk" id="tk"></span></div>
      </div>
      <div class="py-stage">
        <div class="py-tip">${it.kind === 'pytone' ? '读的时候，这个字读第几声？' : '哪个拼音是对的？'}</div>
        <div class="py-word">${markWord(it.question, -1)}</div>
        <div style="color:var(--muted);font-size:14px;margin-top:10px">${it.src === 'school' ? '学校听写时拼音写错的' : `之前错过 ${it.wrong} 次`}</div>
      </div>
      <div class="py-opts">
        ${o.opts.map((t, i) => `<button class="py-opt ${reviewOptClass(i)}" data-act="revPick" data-i="${i}">${esc(t)}</button>`).join('')}
      </div>
    </div>`;
  } else {
    main.innerHTML = `
    <div class="page" style="max-width:520px;margin:0 auto">
      <div class="quiz-head">
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="counter">${r.i + 1} / ${r.items.length}<span class="tk" id="tk"></span></div>
      </div>
      <div class="qwrap">
        <div style="color:var(--muted);font-size:14px;margin-bottom:14px">这道之前错过 ${it.wrong} 次</div>
        <div class="qtext">${esc(it.question)}</div>
        <div class="answer-box ${r.given ? '' : 'empty'}" id="abox">${r.given || '点数字'}</div>
        <div class="hintline" id="hint"></div>
      </div>
      <div class="keypad" id="pad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="key" data-k="${n}">${n}</button>`).join('')}
        <button class="key fn" data-k="del">⌫</button>
        <button class="key" data-k="0">0</button>
        <button class="key enter" data-k="enter">确定</button>
      </div>
    </div>`;
  }
}

function reviewKey(k) {
  const r = S.review;
  if (!r || r.phase !== 'run' || r.locked) return;
  if (k === 'del') r.given = r.given.slice(0, -1);
  else if (k === 'enter') return reviewCheck();
  else if (r.given.length < 4) r.given = (r.given === '0' ? '' : r.given) + k;
  const box = $('#abox');
  if (box) {
    box.textContent = r.given || '点数字';
    box.className = 'answer-box' + (r.given ? '' : ' empty');
  }
}

function reviewCheck() {
  const r = S.review;
  if (r.locked) return;
  const it = r.items[r.i];
  if (!r.given) return;
  r.locked = true;
  const ok = String(it.answer) === r.given;
  r.results.push({ subject: it.subject, kind: it.kind, ref: it.ref, question: it.question, answer: String(it.answer), given: r.given, ok });

  const box = $('#abox'), hint = $('#hint');
  if (box) box.className = 'answer-box ' + (ok ? 'ok' : 'err');
  if (hint) {
    hint.className = 'hintline ' + (ok ? 'ok' : 'err');
    hint.textContent = ok ? '✓ 这次对了' : '正确答案是 ' + it.answer;
  }
  beep(ok);
  setTimeout(() => reviewNext(), ok ? 620 : 1500);
}

function reviewPyOpts(it) {
  if (it.kind === 'pytone') {
    const opts = ['第一声', '第二声', '第三声', '第四声'];
    return { opts, ans: opts.indexOf(it.answer) };
  }
  const o = LD.pinyin.options(it.question);
  return o || { opts: [it.answer], ans: 0 };
}

function reviewOptClass(i) {
  const r = S.review;
  if (!r || r.picked === null || r.picked === undefined) return '';
  const o = r.opts;
  if (!o) return '';
  if (i === o.ans) return 'ok';
  if (i === r.picked) return 'err';
  return 'dim';
}

function reviewTap(i) {
  const r = S.review;
  if (!r || r.locked) return;
  const it = r.items[r.i];
  const o = r.opts || reviewPyOpts(it);
  r.locked = true;
  r.picked = i;
  const ok = i === o.ans;
  r.results.push({
    subject: 'pinyin', kind: it.kind, ref: it.ref,
    question: it.question, answer: it.answer, given: o.opts[i], ok,
  });
  beep(ok);
  render();
  setTimeout(() => reviewNext(), ok ? 620 : 1700);
}

function reviewJudge(ok) {
  const r = S.review;
  if (r.locked) return;
  const it = r.items[r.i];
  r.locked = true;
  r.results.push({ subject: 'dictation', kind: 'word', ref: it.ref, question: it.question, answer: it.answer, given: ok ? it.answer : '不会', ok: ok ? 1 : 0, self: 1 });
  beep(ok);
  setTimeout(() => reviewNext(), 300);
}

function reviewNext() {
  const r = S.review;
  r.i += 1;
  r.given = '';
  r.revealed = false;
  r.locked = false;
  r.opts = null;
  r.picked = null;
  if (r.i >= r.items.length) {
    r.phase = 'done';
    const ms = Date.now() - r.t0;
    r.time = LD.saveRun('review:' + r.items.length, ms, '复习 · ' + r.items.length + ' 道');
    render();
    // 按原科目分组提交，保证错题归属正确；一次复习共用一个批次号，
    // 家长端才会显示成「复习 6 道」一条，而不是拆成三行
    const batch = 'rv-' + Date.now();
    const bySub = {};
    r.results.forEach(x => { (bySub[x.subject] = bySub[x.subject] || []).push(x); });
    Object.keys(bySub).forEach(subj => {
      post('/api/submit', { subject: subj, items: bySub[subj], src: 'review', batch }).catch(() => {});
    });
  } else {
    render();
  }
}

function reviewResult() {
  const r = S.review;
  const right = r.results.filter(x => x.ok).length;
  const total = r.results.length;
  setTop('复习', false);
  main.innerHTML = `
  <div class="page" style="max-width:520px;margin:0 auto">
    <div class="card result-hero">
      <div class="score">${right}<span class="slash"> / ${total}</span></div>
      <div class="score-label">${right === total ? '全对了，这些题下次会隔更久才出现' : '错的那些明天还会再来'}</div>
    </div>
    ${timeCard(r.time)}
    <div class="actions">
      <button class="btn wide" data-act="go" data-v="home">回首页</button>
    </div>
  </div>`;
}

/* ---------------- 家长面板 ---------------- */

async function renderParent() {
  setTop('家长', true, true);
  main.innerHTML = `<div class="page"><div class="h1">学习情况</div><div class="sub">读数据中…</div></div>`;
  let st;
  try { st = await api('/api/stats?days=7'); } catch (e) {
    main.innerHTML = `<div class="page"><div class="h1">学习情况</div><div class="empty-note">${esc(e.message)}</div></div>`;
    return;
  }
  S.stats = st;

  // 补齐 7 天
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hit = (st.series || []).find(x => x.day === key);
    days.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}`, n: hit ? hit.n : 0, ok: hit ? hit.ok : 0 });
  }
  const max = Math.max(10, ...days.map(d => d.n));

  const weekN = days.reduce((a, d) => a + d.n, 0);
  const todayBatches = ((st.dayList || []).find(x => x.day === dayStr(0)) || { batches: [] }).batches;
  const todayN = todayBatches.reduce((a, b) => a + b.n, 0);
  const todayJudged = todayBatches.reduce((a, b) => a + b.judged, 0);
  const todayOk = todayBatches.reduce((a, b) => a + b.ok, 0);

  main.innerHTML = `
  <div class="page">
    <div class="h1">学习情况</div>
    <div class="sub">最近 7 天</div>

    <div class="stat-grid">
      ${[['math', '口算', '道'], ['pinyin', '拼音', '道'], ['dictation', '听写', '个词'], ['english', '英语', '句']].map(([sj, name, unit]) => {
        const m = todayMod(sj);
        return `<div class="stat">
          <div class="k">今天${name}</div>
          <div class="v">${m.n ? m.n + `<small>${unit}</small>` : '<span class="dash">—</span>'}</div>
          <div class="stat-sub">${m.n ? `练习 ${m.pr} · 复习 ${m.rv}` : '还没做'}</div>
        </div>`;
      }).join('')}
      <div class="stat">
        <div class="k">连续天数</div>
        <div class="v">${st.streak || 0}</div>
        <div class="stat-sub">7 天共 ${weekN} 道</div>
      </div>
    </div>

    <div class="section-title">每天做了什么 <span>点日期看那天</span></div>
    <div class="card" style="padding:18px">
      <div class="chips" style="margin-bottom:16px">
        ${[0, 1, 2, 3, 4, 5, 6].map(off => {
          const d = dayStr(off);
          const label = off === 0 ? '今天' : off === 1 ? '昨天' : d.slice(5).replace('-', '/');
          return `<button class="chip small" data-act="pday" data-d="${off}" aria-pressed="${S.pday === off}">${label}</button>`;
        }).join('')}
      </div>
      ${dayLogHtml(S.pday)}
    </div>

    <div class="card">
      <div class="chart">
        ${days.map(d => `
          <div class="col">
            <div class="stack">
              <div class="fill ${d.n ? '' : 'zero'}" style="height:${d.n ? Math.max(6, d.n / max * 100) : 3}%"></div>
            </div>
            <div class="lbl">${d.label}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="section-title">正确率（7 天）</div>
    <div class="card" style="padding:6px 16px 14px">
      ${(st.kinds || []).length ? `<table class="wrongs">
        <thead><tr><th>题型</th><th style="width:70px">题数</th><th style="width:80px">正确率</th></tr></thead>
        <tbody>
          ${st.kinds.map(k => `<tr>
            <td>${kindName(k.kind)}${k.kind === 'word' ? ` <span class="tag d">${k.judged ? '已核对' : '自评'}</span>` : ''}</td>
            <td class="num">${k.n}</td>
            <td class="num" style="color:${!k.judged ? 'var(--muted)' : k.ok / k.judged >= .9 ? 'var(--ok)' : k.ok / k.judged >= .7 ? 'var(--ink)' : 'var(--err)'}">${k.judged ? Math.round(k.ok / k.judged * 100) + '%' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="font-size:12.5px;color:var(--muted);line-height:1.6;margin-top:10px">
        听写是孩子自己点的，不算正确率——他写没写对以你对本子为准。
      </div>` : `<div class="empty-note">还没有数据</div>`}
    </div>

    <div class="section-title">学校听写错词 <span>点了就进待攻克</span></div>
    <div class="card" style="padding:18px">
      ${schoolPickHtml()}
    </div>

    <div class="section-title">待攻克 <span>${(st.wrong || []).length} 项</span></div>
    <div class="card" style="padding:6px 16px 14px">
      ${(st.wrong || []).length ? `<table class="wrongs">
        <thead><tr><th>内容</th><th style="width:60px">错次</th><th style="width:86px">下次复习</th></tr></thead>
        <tbody>
          ${st.wrong.map(w => `<tr>
            <td>${w.src === 'school' ? `<span class="tag s">学校</span> ` : ''}${w.subject === 'dictation' ? `<span class="tag d">词</span> ` : ''}${esc(w.question)}</td>
            <td class="num">${w.wrong}</td>
            <td style="color:var(--muted);font-size:13px">${esc(dueLabel(w.due))}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : `<div class="empty-note">没有错题，很好</div>`}
    </div>

    <div class="section-title">最快纪录 <span>同难度同题数才一起比</span></div>
    <div class="card" style="padding:6px 16px 14px">
      ${timeRowsHtml()}
    </div>

    <div class="section-title">听写核对 <span>对着本子核一遍</span></div>
    <div class="card" style="padding:16px 18px">
      <div style="font-size:13.5px;color:var(--muted);line-height:1.7;margin-bottom:14px">
        孩子点「写完了」的词，机器不知道他写没写对——对着本子核一遍，写错的点「错」，这个词就进待攻克。
      </div>
      ${recentDictHtml()}
    </div>

    <div class="section-title">听写词表 <span>${LD.isDictCustom() ? '已改过' : '按 2025 新版教材'}</span></div>
    <div class="card" style="padding:18px">
      ${dictEditorHtml()}
    </div>

    <div class="section-title">数据</div>
    <div class="card" style="padding:18px">
      <div style="font-size:13.5px;color:var(--muted);line-height:1.7;margin-bottom:14px">
        做题记录只存在这台设备的浏览器里，不上传任何服务器。${LD.isMemoryMode() ? '<br><b style="color:var(--err)">当前是隐私模式，关掉页面记录就会丢。</b>' : ''}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn sec" data-act="exportData" style="font-size:15px;padding:12px 18px">备份到文件</button>
        <button class="btn sec" data-act="importData" style="font-size:15px;padding:12px 18px">从文件恢复</button>
        <button class="btn ghost" data-act="resetData" style="font-size:15px;padding:12px 14px">清空记录</button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" style="display:none">
    </div>

    <div class="section-title">关于 <span>小满学习台</span></div>
    <div class="card" style="padding:18px">
      <div style="font-size:13.5px;color:var(--muted);line-height:1.8">
        这是一个开源项目，MIT 协议，数据不出设备。<br>
        别人想给自己孩子用：直接打开这个网址就行（分享 → 添加到主屏幕）；
        想改造的，源码在 <a href="https://github.com/sunshine2176/learning-desk" target="_blank" rel="noopener" style="color:var(--accent)">GitHub</a>。
      </div>
    </div>
  </div>`;
}

/* ---- 学校听写错词：家长点选补录 ---- */

let SCHOOL_LESSON = null;   // 'u3:4'
let SCHOOL_TYPE = 'both';   // both | word | py

function schoolPickHtml() {
  const list = dictLessonList(LD.getDict());
  if (!list.length) return '<div class="empty-note">词表为空</div>';
  const cur = list.find(l => l.key === SCHOOL_LESSON) || list[0];
  SCHOOL_LESSON = cur.key;
  const W = LD.wrongAll();
  const typeName = { both: '写字 + 拼音', word: '只练写字', py: '只练拼音' };
  return `
    <div style="font-size:13.5px;color:var(--muted);line-height:1.7;margin-bottom:12px">
      老师今天听写错了哪几个词？选到那一课，下面点一下词就进待攻克——从今天起按 1 天 / 3 天 / 7 天的样子复习，练熟了自己退出去。
    </div>
    <select class="unit" id="schoolLessonSel">
      ${list.map(l => `<option value="${l.key}" ${l.key === cur.key ? 'selected' : ''}>${esc(l.unitName.split(' · ')[0])} · 第 ${l.no} 课 ${esc(l.title)}（${l.words.length}）</option>`).join('')}
    </select>
    <div class="chips" style="margin-top:14px">
      ${['both', 'word', 'py'].map(v => `<button class="chip small" data-act="schoolType" data-v="${v}" aria-pressed="${SCHOOL_TYPE === v}">${typeName[v]}</button>`).join('')}
    </div>
    <div class="chips" style="margin-top:12px">
      ${cur.words.map(w => {
        const on = !!(W['word:' + w] || W['py:' + w]);
        return `<button class="chip small" data-act="schoolWord" data-w="${esc(w)}"${on ? ' disabled' : ''}>${on ? '✓ ' : ''}${esc(w)}</button>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <input class="txt-in" id="schoolFree" placeholder="课本外的词也行，多个用空格隔开" autocomplete="off" autocapitalize="off">
      <button class="btn sec" data-act="schoolFreeAdd" style="font-size:15px;padding:12px 16px;flex-shrink:0">加入</button>
    </div>
    ${schoolListHtml()}`;
}

function schoolListHtml() {
  const rows = LD.schoolWrongs();
  if (!rows.length) return '';
  return `
    <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px">
      <div style="font-size:13px;color:var(--muted);margin-bottom:10px">补录过 ${rows.length} 项（点 × 删掉）</div>
      <div class="chips">
        ${rows.map(r => `<span class="chip small rec">
          ${esc(r.question)}<span class="rec-k">${r.kind === 'py' ? '拼音' : '写字'}</span>
          <b data-act="schoolDel" data-r="${esc(r.ref)}" class="rec-x">×</b>
        </span>`).join('')}
      </div>
    </div>`;
}

function schoolAdd(words) {
  const [uid, no] = String(SCHOOL_LESSON || '').split(':');
  const added = [], noPy = [];
  words.forEach(w => {
    if (SCHOOL_TYPE === 'both' || SCHOOL_TYPE === 'word') {
      const r = LD.addWrongWord(w, 'word', uid, no);
      if (r.ok) added.push(r);
    }
    if (SCHOOL_TYPE === 'both' || SCHOOL_TYPE === 'py') {
      const r = LD.addWrongWord(w, 'py', uid, no);
      if (r.ok) added.push(r);
      else if (r.reason === 'no-py') noPy.push(w);
    }
  });
  if (!added.length) toast(noPy.length ? `${noPy.join('、')} 没有拼音数据，换个模式或只练写字` : '没有可加的词');
  else toast(`已加入 ${added.length} 项${noPy.length ? `（${noPy.join('、')} 没拼音数据，只练了写字）` : ''}`);
  renderParent();
}

/* ---- 每天做了什么：把批次还原成一行一行 ---- */

const SUBJ_NAME = { math: '口算', pinyin: '拼音', dictation: '听写', english: '英语跟读' };
const SRC_NAME = { practice: '练习', review: '复习', check: '家长核对' };

function dayStr(off) {
  const d = new Date();
  d.setDate(d.getDate() - (off || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 今天某科目的量，拆成「练习 / 复习 / 家长核对」
function todayMod(subj) {
  const rows = ((S.stats && S.stats.today) || []).filter(x => x.subject === subj);
  const sum = f => rows.filter(f).reduce((a, x) => a + x.n, 0);
  return {
    n: sum(() => true),
    pr: sum(x => x.src === 'practice'),
    rv: sum(x => x.src === 'review'),
    ck: sum(x => x.src === 'check'),
  };
}

function dayLogHtml(off) {
  const day = dayStr(off);
  const rec = ((S.stats && S.stats.dayList) || []).find(x => x.day === day);
  const list = (rec && rec.batches) || [];
  if (!list.length) {
    return `<div class="empty-note">${off === 0 ? '今天还没有做题记录。' : '这一天没有做题记录。'}</div>`;
  }
  const total = list.reduce((a, b) => a + b.n, 0);
  const judged = list.reduce((a, b) => a + b.judged, 0);
  const ok = list.reduce((a, b) => a + b.ok, 0);
  return `
    <div style="font-size:13.5px;color:var(--muted);line-height:1.7;margin-bottom:12px">
      这天一共 ${list.length} 组、${total} 题${judged ? `，能判对错的有 ${judged} 道，对了 ${ok} 道（${Math.round(ok / judged * 100)}%）` : ''}。
    </div>
    <table class="wrongs log-table">
      <thead><tr><th style="width:58px">时间</th><th>做了什么</th><th style="width:76px">数量</th><th style="width:104px">结果</th></tr></thead>
      <tbody>
        ${list.map(b => {
          const subs = Object.keys(b.subjects || {});
          const onlyDict = subs.length === 1 && subs[0] === 'dictation';
          const title = onlyDict ? '听写'
            : subs.length === 1 ? (SUBJ_NAME[subs[0]] || subs[0])
            : '混合（' + subs.map(x => SUBJ_NAME[x] || x).join(' · ') + '）';
          let res = '—';
          if (b.src === 'check') res = `错 ${b.n - b.ok}`;
          else if (onlyDict) res = b.dunno ? `标了 ${b.dunno} 个不会` : '都写完了';
          else if (b.judged) res = `对 ${b.ok}/${b.judged}`;
          return `<tr>
            <td style="color:var(--muted);font-variant-numeric:tabular-nums">${esc(String(b.ts).slice(11, 16))}</td>
            <td>${esc(title)} <span class="tag ${b.src === 'review' ? 'd' : b.src === 'check' ? 's' : ''}">${SRC_NAME[b.src] || '练习'}</span></td>
            <td class="num">${b.n} ${onlyDict ? '个词' : subs.length === 1 && subs[0] === 'english' ? '句' : '道'}</td>
            <td style="font-size:13px;color:var(--muted)">${res}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

/* ---- 最快纪录：按口径分组列出 ---- */

function timeRowsHtml() {
  const T = LD.timesAll ? LD.timesAll() : {};
  const rows = Object.keys(T).map(k => Object.assign({ key: k }, T[k])).filter(r => r.best != null);
  if (!rows.length) return '<div class="empty-note">还没有计时记录。孩子做完一组题就会自动记一次。</div>';
  // 练得多的排前面，最多露 8 行免得刷屏
  rows.sort((a, b) => (b.best != null) - (a.best != null) || (b.runs || []).length - (a.runs || []).length);
  const shown = rows.slice(0, 8);
  return `<table class="wrongs">
      <thead><tr><th>项目</th><th style="width:82px">最快</th><th style="width:58px">次数</th></tr></thead>
      <tbody>
        ${shown.map(r => `<tr>
          <td>${esc(r.label || r.key)}</td>
          <td class="num" style="font-variant-numeric:tabular-nums">${durStr(r.best)}</td>
          <td class="num">${(r.runs || []).length}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="font-size:12.5px;color:var(--muted);line-height:1.6;margin-top:10px">
      只有同一项目（同难度、同题数、同范围）的成绩才会互相比较；听写的用时包含你朗读和他写字的时间。
    </div>`;
}

/* ---- 最近几次听写：家长核对补录 ---- */

function recentDictHtml() {
  const groups = LD.lastDicts() || [];
  if (!groups.length) {
    return `<div class="empty-note">还没有听写记录。孩子做完一组听写后，这里会列出那组的词，你对着本子核一遍就行。</div>`;
  }
  return groups.map((g, gi) => {
    const words = g.items || [];
    const dunno = words.filter(w => w.mark === 'dunno').length;
    const pending = words.filter(w => w.mark === 'done' && !w.verdict).length;
    return `
    <div class="chk-group">
      <div class="chk-head">
        <span class="chk-when">${esc((g.ts || '').slice(5, 16))}</span>
        <span class="chk-meta">${words.length} 词${dunno ? ` · 标不会 ${dunno}` : ''}${pending ? ` · 待核对 ${pending}` : ' · 已核完'}</span>
      </div>
      <div class="chk-list">
        ${words.map((w, i) => chkWordHtml(w, gi, i)).join('')}
      </div>
      ${pending ? `<button class="btn sec" data-act="markRest" data-g="${gi}" style="font-size:14px;padding:9px 16px;margin-top:12px">剩下的都写对了</button>` : ''}
    </div>`;
  }).join('');
}

function chkWordHtml(w, gi, i) {
  let right;
  if (w.mark === 'dunno') {
    right = `<span class="chk-tag dunno">不会</span>`;
  } else if (w.verdict === 'ok') {
    right = `<span class="chk-tag ok">✓</span>`;
  } else if (w.verdict === 'bad') {
    right = `<span class="chk-tag bad">✗ 待攻克</span>`;
  } else {
    right = `<button class="chk-btn" data-act="markWord" data-g="${gi}" data-i="${i}" data-v="ok">对</button>
             <button class="chk-btn bad" data-act="markWord" data-g="${gi}" data-i="${i}" data-v="bad">错</button>`;
  }
  return `<div class="chk-row"><span class="chk-word">${esc(w.word)}</span><span class="chk-btns">${right}</span></div>`;
}

/* ---- 词表编辑 ---- */

let EDIT_LESSON = null;   // 'u3:4' 形式

function dictLessonList(d) {
  const out = [];
  (d.units || []).forEach(u => (u.lessons || []).forEach(l => out.push({
    key: u.id + ':' + l.no, unitId: u.id, no: String(l.no),
    title: l.title, unitName: u.name, words: l.words || [],
  })));
  return out;
}

function dictEditorHtml() {
  const d = LD.getDict();
  const list = dictLessonList(d);
  if (!list.length) return `<div class="empty-note">词表为空</div>`;
  const cur = list.find(l => l.key === EDIT_LESSON) || list[0];
  EDIT_LESSON = cur.key;
  return `
    <div style="font-size:13.5px;color:var(--muted);line-height:1.7;margin-bottom:12px">
      发现和课本『词语表』不一致的，选到那一课直接改，每行一个词。改完点保存，只影响这台设备。
    </div>
    <select class="unit" id="dictLessonSel">
      ${list.map(l => `<option value="${l.key}" ${l.key === cur.key ? 'selected' : ''}>${esc(l.unitName.split(' · ')[0])} · 第 ${l.no} 课 ${esc(l.title)}（${l.words.length}）</option>`).join('')}
    </select>
    <textarea id="dictWords" spellcheck="false" style="width:100%;margin-top:12px;min-height:190px;padding:14px;border:1px solid var(--line);border-radius:14px;font-family:inherit;font-size:17px;line-height:2;background:var(--card);color:var(--ink);resize:vertical">${esc(cur.words.join('\n'))}</textarea>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      <button class="btn" data-act="saveDictLesson" style="font-size:15px;padding:12px 18px">保存这一课</button>
      <button class="btn ghost" data-act="resetDict" style="font-size:15px;padding:12px 14px">恢复默认词表</button>
    </div>`;
}

function saveDictLesson() {
  const ta = $('#dictWords');
  const sel = $('#dictLessonSel');
  if (!ta || !sel) return;
  const [uid, no] = sel.value.split(':');
  const words = ta.value.split('\n').map(s => s.trim()).filter(Boolean)
    .filter((w, i, a) => a.indexOf(w) === i);
  const d = JSON.parse(JSON.stringify(LD.getDict()));
  const u = (d.units || []).find(x => x.id === uid);
  const l = u && (u.lessons || []).find(x => String(x.no) === no);
  if (!l) return toast('没找到这一课');
  l.words = words;
  LD.saveDict(d);
  S.units = null;             // 让听写页重新读
  toast(`已保存：${l.title} ${words.length} 个词`);
  renderParent();
}

function kindName(k) {
  return ({
    add_sub: '加减法', mul: '乘法', div: '除法',
    mul_add: '乘加乘减', money: '元角分', word: '听写',
    py: '拼音', pytone: '变调判断',
  })[k] || k;
}

function dueLabel(d) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const m = new Date(d + 'T00:00:00');
  const diff = Math.round((m - t) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  return `${m.getMonth() + 1}/${m.getDate()}`;
}

/* ---------------- 事件 ---------------- */

document.addEventListener('click', e => {
  // 数字键盘的按键只带 data-k；选项 chips 带 data-act="cfg" + data-k，不能让它们在这里被截走
  const key = e.target.closest('[data-k]:not([data-act])');
  if (key) {
    const k = key.dataset.k;
    if (S.view === 'math') keyPress(k);
    else if (S.view === 'review') reviewKey(k);
    return;
  }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  if (act === 'go') {
    const v = el.dataset.v;
    if (v === 'rev') S.review = null;
    go(v);
  } else if (act === 'back') {
    if (S.view === 'parent' || S.view === 'review') go('home');
    else go('home');
  } else if (act === 'parent') {
    go('parent');
  } else if (act === 'cfg') {
    const k = el.dataset.k;
    const v = el.dataset.str ? el.dataset.v : parseInt(el.dataset.v, 10);
    S.cfg[k] = v;
    saveCfg();
    render();
  } else if (act === 'startMath') {
    startMath();
  } else if (act === 'startPy') {
    startPy();
  } else if (act === 'pyPick') {
    pyPick(parseInt(el.dataset.i, 10));
  } else if (act === 'revPick') {
    reviewTap(parseInt(el.dataset.i, 10));
  } else if (act === 'againPy') {
    S.py = null;
    startPy();
  } else if (act === 'again') {
    S.math = null;
    startMath();
  } else if (act === 'skip') {
    checkMath(true);
  } else if (act === 'startDict') {
    startDict();
  } else if (act === 'play') {
    if (S.dict) playWord(S.dict.items[S.dict.i].word);
  } else if (act === 'playWord') {
    playWord(el.dataset.w);
  } else if (act === 'wordDone') {
    wordNext('done');
  } else if (act === 'wordDunno') {
    wordNext('dunno');
  } else if (act === 'reveal') {
    if (S.review && S.review.phase === 'run') { S.review.revealed = true; render(); }
  } else if (act === 'judge') {
    reviewJudge(el.dataset.ok === '1');
  } else if (act === 'engPack') {
    S.engPack = el.dataset.v;
    renderEnglish();
  } else if (act === 'startEng') {
    startEng();
  } else if (act === 'engPlay') {
    const e = S.eng;
    if (e) playUrl(e.items[e.i].audio);
  } else if (act === 'engSlow') {
    const e = S.eng;
    if (e) playUrl(e.items[e.i].audio, 0.7);
  } else if (act === 'engRec') {
    engRec();
  } else if (act === 'engStop') {
    engStop();
  } else if (act === 'engMine') {
    const e = S.eng;
    if (e && e.blobUrl) playUrl(e.blobUrl);
  } else if (act === 'engGood') {
    if (S.eng && S.eng.phase === 'run') engNext(1);
  } else if (act === 'engRetry') {
    const e = S.eng;
    if (e) { e.blob = null; e.blobUrl = null; e.rec = null; render(); }
  } else if (act === 'engAgainPack') {
    S.eng = null;
    startEng();
  } else if (act === 'engOther') {
    S.eng = null;
    renderEnglish();
  } else if (act === 'pday') {
    S.pday = parseInt(el.dataset.d, 10) || 0;
    renderParent();
  } else if (act === 'schoolType') {
    SCHOOL_TYPE = el.dataset.v;
    renderParent();
  } else if (act === 'schoolWord') {
    schoolAdd([el.dataset.w]);
  } else if (act === 'schoolFreeAdd') {
    const inp = $('#schoolFree');
    const words = (inp ? inp.value : '').split(/[\s,，、;；]+/).map(x => x.replace(/\s+/g, '')).filter(Boolean);
    if (!words.length) return toast('先打一个词');
    schoolAdd(words);
  } else if (act === 'schoolDel') {
    LD.delWrong(el.dataset.r);
    renderParent();
  } else if (act === 'againDict') {
    S.dict = null;
    startDict();
  } else if (act === 'markWord') {
    LD.markLastWord(parseInt(el.dataset.g, 10), parseInt(el.dataset.i, 10), el.dataset.v);
    renderParent();
  } else if (act === 'markRest') {
    LD.markRestOk(parseInt(el.dataset.g, 10));
    renderParent();
  } else if (act === 'exportData') {
    doExport();
  } else if (act === 'importData') {
    const f = $('#importFile');
    if (f) f.click();
  } else if (act === 'resetDict') {
    if (confirm('恢复成内置的默认词表？你改过的内容会丢。')) {
      LD.resetDict();
      S.units = null;
      EDIT_LESSON = null;
      toast('已恢复默认词表');
      renderParent();
    }
  } else if (act === 'saveDictLesson') {
    saveDictLesson();
  } else if (act === 'resetData') {
    if (confirm('清空所有做题记录？这个动作不能撤销。\n建议先点「备份到文件」。')) {
      LD.resetAll();
      S.stats = null;
      S.review = null;
      toast('已清空');
      renderParent();
    }
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (!t) return;

  if (t.id === 'unitSel') {
    S.cfg.unit = t.value;
    S.cfg.lesson = 'all';
    saveCfg();
    if (S.view === 'pinyin') { render(); return; }
    const lf = $('#lessonSel');
    if (lf && S.units) lf.innerHTML = lessonOptions(S.units.units || [], t.value, 'all');
    return;
  }
  if (t.id === 'lessonSel') {
    S.cfg.lesson = t.value;
    saveCfg();
    if (S.view === 'pinyin') { render(); return; }
    return;
  }
  if (t.id === 'dictLessonSel') {
    EDIT_LESSON = t.value;
    renderParent();
    return;
  }
  if (t.id === 'schoolLessonSel') {
    SCHOOL_LESSON = t.value;
    renderParent();
    return;
  }
  if (t.id !== 'importFile') return;
  const f = t.files && t.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const res = LD.importData(JSON.parse(r.result));
      toast(`恢复了 ${res.attempts} 条记录`);
      S.review = null;
      renderParent();
    } catch (err) {
      toast('恢复失败：' + err.message);
    }
  };
  r.readAsText(f);
  t.value = '';
});

function doExport() {
  const data = LD.exportData();
  const json = JSON.stringify(data, null, 1);
  const d = new Date();
  const name = `学习台备份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('已备份，去「文件」App 里找');
  } catch (e) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).then(
        () => toast('已复制到剪贴板，粘贴到备忘录保存'),
        () => toast('备份失败')
      );
    } else toast('备份失败');
  }
}

/* ---------------- 启动 ---------------- */

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

(function boot() {
  const q = new URLSearchParams(location.search);
  const v = q.get('go');
  if (v === 'math' && q.has('auto')) { S.view = 'math'; startMath(); }
  else if (v === 'pinyin' && q.has('auto')) { S.view = 'pinyin'; startPy(); }
  else if (v) go(v);
  else refreshHome();
})();
