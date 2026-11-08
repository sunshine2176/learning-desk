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
  review: null,
  stats: null,
  units: null,
  today: { done: 0, due: 0, streak: 0 },
  cfg: Object.assign({ count: 20, level: 2, unit: 'all', dcount: 10 }, load('cfg')),
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

async function api(path, opt) {
  let r;
  try {
    r = await fetch(path, Object.assign({ cache: 'no-store' }, opt));
  } catch (e) {
    throw new Error('连不上服务');
  }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function post(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
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
  if (S.view === 'home') return renderHome();
  if (S.view === 'math') return renderMath();
  if (S.view === 'dict') return renderDict();
  if (S.view === 'review') return renderReview();
  if (S.view === 'parent') return renderParent();
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
        <div class="desc">100 以内加减 · 表内乘除 · 元角分</div>
      </button>
      <button class="tile m-dict" data-act="go" data-v="dict">
        <span class="ico">✍️</span>
        <div class="name">听写</div>
        <div class="desc">按单元读词，写完自己核对</div>
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
          简单：20 以内加减 + 2~5 的乘法<br>
          适中：100 以内加减 + 表内乘除 + 元角分<br>
          挑战：连加连减、乘加乘减、混合运算
        </div>
        <button class="btn wide" data-act="startMath" style="margin-top:4px">开始</button>
      </div>
    </div>
  </div>`;
}

async function startMath() {
  try {
    const r = await api(`/api/quiz/math?count=${S.cfg.count}&level=${S.cfg.level}`);
    S.math = { items: r.items, i: 0, given: '', results: [], phase: 'run', locked: false, t0: Date.now() };
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
      <div class="counter">${m.i + 1} / ${m.items.length}</div>
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
  m.elapsed = Math.round((Date.now() - m.t0) / 1000);
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
  const sec = m.elapsed || 0;
  const timeStr = sec >= 60 ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒` : `${sec} 秒`;

  setTop('结果', true);
  main.innerHTML = `
  <div class="page" style="max-width:520px;margin:0 auto">
    <div class="card result-hero">
      <div class="score">${right}<span class="slash"> / ${total}</span></div>
      <div class="score-label">用时 ${timeStr}${miss.length ? ` · ${miss.length} 道进了错题本` : ' · 全对'}</div>
    </div>

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

async function dictSetup() {
  setTop('听写', true);
  main.innerHTML = `<div class="page"><div class="h1">听写</div><div class="sub">加载词表中…</div></div>`;
  try {
    if (!S.units) S.units = await api('/api/dict/units');
    const c = S.cfg;
    const units = S.units.units || [];
    main.innerHTML = `
    <div class="page">
      <div class="h1">听写</div>
      <div class="sub">点播放听词，写在纸上，然后自己对答案</div>

      <div class="card" style="padding:22px">
        <div class="setup">
          <div class="field">
            <div class="label">选单元</div>
            <select class="unit" id="unitSel">
              <option value="all">全部单元（${units.reduce((a, u) => a + u.count, 0)} 个词）</option>
              ${units.map(u => `<option value="${u.id}" ${c.unit === u.id ? 'selected' : ''}>${esc(u.name)}（${u.count}）</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <div class="label">听几个</div>
            <div class="chips">
              ${[8, 10, 15, 20].map(n => `<button class="chip small" data-act="cfg" data-k="dcount" data-v="${n}" aria-pressed="${c.dcount === n}">${n} 个</button>`).join('')}
            </div>
          </div>
          <div style="color:var(--muted);font-size:13.5px;line-height:1.6">
            ${esc(S.units.note || '')}
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
  saveCfg();
  try {
    const r = await api(`/api/quiz/dictation?unit=${encodeURIComponent(S.cfg.unit)}&count=${S.cfg.dcount}`);
    if (!r.items.length) return toast('这个单元没有词');
    S.dict = { items: r.items, i: 0, results: [], phase: 'run', revealed: false, locked: false, t0: Date.now() };
    // iOS 需要用户手势解锁语音
    speak('准备开始');
    setTimeout(() => { if (S.dict && S.dict.phase === 'run') speak(S.dict.items[0].word); }, 900);
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
      <div class="counter">${d.i + 1} / ${d.items.length}</div>
    </div>

    <div class="dict-stage">
      <button class="play-btn" data-act="play">
        <span class="spk">🔊</span>
        <span>再听一遍</span>
      </button>

      <div class="big-word" id="bw">${d.revealed ? esc(it.word) : '○'.repeat(it.word.length)}</div>

      ${d.revealed
        ? `<div class="judge-row">
             <button class="judge yes" data-act="judge" data-ok="1">✓ 写对了</button>
             <button class="judge no"  data-act="judge" data-ok="0">✗ 写错了</button>
           </div>`
        : `<div style="margin-top:26px">
             <button class="btn sec" data-act="reveal">写完了，看答案</button>
           </div>`}
    </div>
  </div>`;
}

function revealWord() {
  const d = S.dict;
  if (!d || d.revealed) return;
  d.revealed = true;
  render();
}

function judgeWord(ok) {
  const d = S.dict;
  if (!d || d.locked) return;
  d.locked = true;
  const it = d.items[d.i];
  d.results.push({ word: it.word, ok, ref: 'word:' + it.word, unit: it.unit_name || '' });
  beep(ok);
  setTimeout(() => {
    d.i += 1;
    d.revealed = false;
    d.locked = false;
    if (d.i >= d.items.length) finishDict();
    else { render(); setTimeout(() => speak(d.items[d.i].word), 220); }
  }, 320);
}

function finishDict() {
  const d = S.dict;
  d.phase = 'done';
  d.elapsed = Math.round((Date.now() - d.t0) / 1000);
  render();
  const items = d.results.map(r => ({
    kind: 'word', ref: r.ref, question: r.word, answer: r.word,
    given: r.ok ? r.word : '写错', ok: r.ok,
  }));
  post('/api/submit', { subject: 'dictation', items }).catch(() => toast('结果没能保存'));
}

function dictResult() {
  const d = S.dict;
  const right = d.results.filter(r => r.ok).length;
  const total = d.results.length;
  const miss = d.results.filter(r => !r.ok);

  setTop('结果', true);
  main.innerHTML = `
  <div class="page" style="max-width:520px;margin:0 auto">
    <div class="card result-hero">
      <div class="score">${right}<span class="slash"> / ${total}</span></div>
      <div class="score-label">${miss.length ? `${miss.length} 个词进了错题本，过两天会再考` : '全部写对'}</div>
    </div>

    ${miss.length ? `
      <div class="miss-list">
        ${miss.map(r => `<div class="miss-item"><span class="q">${esc(r.word)}</span><span class="tag d">${esc(r.unit || '')}</span></div>`).join('')}
      </div>` : ''}

    <div class="actions">
      <button class="btn sec" data-act="go" data-v="home">回首页</button>
      <button class="btn" data-act="againDict">再听一组</button>
    </div>
  </div>`;
}

/* ---------------- 复习 ---------------- */

async function renderReview() {
  if (!S.review) {
    setTop('复习', false);
    main.innerHTML = `<div class="page"><div class="h1">复习</div><div class="sub">正在找今天该复习的…</div></div>`;
    try {
      const r = await api('/api/review');
      S.review = { items: r.items, i: 0, given: '', results: [], phase: r.items.length ? 'run' : 'empty', locked: false, t0: Date.now() };
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
        <div class="counter">${r.i + 1} / ${r.items.length}</div>
      </div>
      <div class="dict-stage">
        <div style="color:var(--muted);font-size:14px;margin-bottom:4px">这个词之前错过 ${it.wrong} 次</div>
        <button class="play-btn" data-act="playWord" data-w="${esc(it.question)}">
          <span class="spk">🔊</span><span>播放</span>
        </button>
        <div class="big-word" id="bw">${r.revealed ? esc(it.question) : '○'.repeat(it.question.length)}</div>
        ${r.revealed
          ? `<div class="judge-row">
               <button class="judge yes" data-act="judge" data-ok="1">✓ 写对了</button>
               <button class="judge no"  data-act="judge" data-ok="0">✗ 又错了</button>
             </div>`
          : `<div style="margin-top:22px"><button class="btn sec" data-act="reveal">看答案</button></div>`}
      </div>
    </div>`;
  } else {
    main.innerHTML = `
    <div class="page" style="max-width:520px;margin:0 auto">
      <div class="quiz-head">
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="counter">${r.i + 1} / ${r.items.length}</div>
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

function reviewJudge(ok) {
  const r = S.review;
  if (r.locked) return;
  const it = r.items[r.i];
  r.locked = true;
  r.results.push({ subject: 'dictation', kind: 'word', ref: it.ref, question: it.question, answer: it.answer, given: ok ? it.answer : '写错', ok });
  beep(ok);
  setTimeout(() => reviewNext(), 300);
}

function reviewNext() {
  const r = S.review;
  r.i += 1;
  r.given = '';
  r.revealed = false;
  r.locked = false;
  if (r.i >= r.items.length) {
    r.phase = 'done';
    render();
    // 按原科目分组提交，保证错题归属正确
    const bySub = {};
    r.results.forEach(x => { (bySub[x.subject] = bySub[x.subject] || []).push(x); });
    Object.keys(bySub).forEach(subj => {
      post('/api/submit', { subject: subj, items: bySub[subj] }).catch(() => {});
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

  const todayN = (st.today || []).reduce((a, x) => a + x.n, 0);
  const todayOk = (st.today || []).reduce((a, x) => a + x.ok, 0);
  const weekN = days.reduce((a, d) => a + d.n, 0);
  const weekOk = days.reduce((a, d) => a + d.ok, 0);

  main.innerHTML = `
  <div class="page">
    <div class="h1">学习情况</div>
    <div class="sub">最近 7 天</div>

    <div class="stat-grid">
      <div class="stat"><div class="k">今日题数</div><div class="v">${todayN}</div></div>
      <div class="stat"><div class="k">今日正确率</div><div class="v">${todayN ? Math.round(todayOk / todayN * 100) : '—'}<small>%</small></div></div>
      <div class="stat"><div class="k">7 天题数</div><div class="v">${weekN}</div></div>
      <div class="stat"><div class="k">连续天数</div><div class="v">${st.streak || 0}</div></div>
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
            <td>${kindName(k.kind)}</td>
            <td class="num">${k.n}</td>
            <td class="num" style="color:${k.ok / k.n >= .9 ? 'var(--ok)' : k.ok / k.n >= .7 ? 'var(--ink)' : 'var(--err)'}">${Math.round(k.ok / k.n * 100)}%</td>
          </tr>`).join('')}
        </tbody>
      </table>` : `<div class="empty-note">还没有数据</div>`}
    </div>

    <div class="section-title">待攻克 <span>${(st.wrong || []).length} 项</span></div>
    <div class="card" style="padding:6px 16px 14px">
      ${(st.wrong || []).length ? `<table class="wrongs">
        <thead><tr><th>内容</th><th style="width:60px">错次</th><th style="width:86px">下次复习</th></tr></thead>
        <tbody>
          ${st.wrong.map(w => `<tr>
            <td>${w.subject === 'dictation' ? `<span class="tag d">词</span> ` : ''}${esc(w.question)}</td>
            <td class="num">${w.wrong}</td>
            <td style="color:var(--muted);font-size:13px">${esc(dueLabel(w.due))}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : `<div class="empty-note">没有错题，很好</div>`}
    </div>
  </div>`;
}

function kindName(k) {
  return ({
    add_sub: '加减法', mul: '乘法', div: '除法',
    mul_add: '乘加乘减', money: '元角分', word: '听写',
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
  const key = e.target.closest('[data-k]');
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
    const v = parseInt(el.dataset.v, 10);
    S.cfg[k] = v;
    saveCfg();
    render();
  } else if (act === 'startMath') {
    startMath();
  } else if (act === 'again') {
    S.math = null;
    startMath();
  } else if (act === 'skip') {
    checkMath(true);
  } else if (act === 'startDict') {
    startDict();
  } else if (act === 'play') {
    if (S.dict) speak(S.dict.items[S.dict.i].word);
  } else if (act === 'playWord') {
    speak(el.dataset.w);
  } else if (act === 'reveal') {
    if (S.view === 'dict') revealWord();
    else { S.review.revealed = true; render(); }
  } else if (act === 'judge') {
    const ok = el.dataset.ok === '1';
    if (S.view === 'dict') judgeWord(ok);
    else reviewJudge(ok);
  } else if (act === 'againDict') {
    S.dict = null;
    startDict();
  }
});

/* ---------------- 启动 ---------------- */

(function boot() {
  const q = new URLSearchParams(location.search);
  const v = q.get('go');
  if (v === 'math' && q.has('auto')) { S.view = 'math'; startMath(); }
  else if (v) go(v);
  else refreshHome();
})();
