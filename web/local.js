/* local.js — 纯前端数据层
 * 出题、判分、错题排期、统计全部在浏览器跑，数据存 localStorage。
 * 对外暴露 api(path) / post(path, body)，签名与原来的服务端接口一致，
 * 以后要换成云数据库只需替换这一层。
 */
'use strict';

const LD = (function () {

  const STAGES = [1, 3, 7, 15, 30];   // 复习间隔（天）
  const K_A = 'desk.attempts.v1';
  const K_W = 'desk.wrong.v1';
  const MAX_DAYS = 400;               // attempts 只保留最近 400 天

  /* ---------- 存储（隐私模式下降级为内存） ---------- */

  let memA = [], memW = {}, useMem = false;

  function probe() {
    try {
      localStorage.setItem('desk.probe', '1');
      localStorage.removeItem('desk.probe');
      return true;
    } catch (e) { return false; }
  }
  useMem = !probe();

  function loadA() {
    if (useMem) return memA;
    try { return JSON.parse(localStorage.getItem(K_A) || '[]'); } catch (e) { return []; }
  }
  function saveA(v) {
    if (useMem) { memA = v; return; }
    try { localStorage.setItem(K_A, JSON.stringify(v)); } catch (e) { useMem = true; memA = v; }
  }
  function loadW() {
    if (useMem) return memW;
    try { return JSON.parse(localStorage.getItem(K_W) || '{}'); } catch (e) { return {}; }
  }
  function saveW(v) {
    if (useMem) { memW = v; return; }
    try { localStorage.setItem(K_W, JSON.stringify(v)); } catch (e) { useMem = true; memW = v; }
  }

  /* ---------- 计时（每次用时 + 历史最快） ----------
   * 结构：{ [key]: { label, best, runs: [{ ms, at }] } }
   * key 里带难度/题数/范围 —— 5 道题和 20 道题比时间没有意义，
   * 只有同一口径的成绩才放在一起比。
   */
  const K_T = 'desk.times.v1';
  const MAX_RUNS = 30;
  let memT = {};

  function loadT() {
    if (useMem) return memT;
    try { return JSON.parse(localStorage.getItem(K_T) || '{}'); } catch (e) { return {}; }
  }
  function saveT(v) {
    if (useMem) { memT = v; return; }
    try { localStorage.setItem(K_T, JSON.stringify(v)); } catch (e) { useMem = true; memT = v; }
  }

  function saveRun(key, ms, label) {
    const T = loadT();
    const rec = T[key] || { best: null, runs: [] };
    const prevBest = rec.best == null ? null : rec.best;
    const isBest = prevBest == null || ms < prevBest;
    if (isBest) rec.best = ms;
    if (label) rec.label = label;
    rec.runs = [{ ms: ms, at: fmtTs(new Date()) }].concat(rec.runs || []).slice(0, MAX_RUNS);
    T[key] = rec;
    saveT(T);
    return {
      ms: ms, best: rec.best, prevBest: prevBest, isBest: isBest,
      delta: prevBest == null ? 0 : prevBest - ms,
      n: rec.runs.length, first: prevBest == null,
    };
  }

  function timeInfo(key) {
    const rec = loadT()[key];
    if (!rec) return null;
    return { best: rec.best, label: rec.label || '', n: (rec.runs || []).length, last: (rec.runs || [])[0] || null };
  }

  function timesAll() { return loadT(); }
  function resetTimes() { saveT({}); }

  /* ---------- 日期 ---------- */

  const p2 = n => String(n).padStart(2, '0');
  const fmtDay = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const fmtTs = d => `${fmtDay(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  function addDays(dayStr, n) {
    const d = new Date(dayStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return fmtDay(d);
  }

  /* ---------- 口算生成（北师大版二年级上册范围） ----------
   * 难度阶梯按孩子真实进度排，三档都能单独用：
   *   简单：两位数 ± 一位数（含进位退位）、两位数 ± 两位数（不进位不退位）、2~5 的乘法
   *   适中：100 以内加减（含进退位、100 减两位数）、全部表内乘法
   *   挑战：连加连减、乘加乘减、表内除法、元角分
   * 除法只放在挑战档——二上还没学除法，前两档不出现。
   */

  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // 两位数 + 一位数（可能进位）
  function add2d1d() {
    const a = R(11, 89), b = R(2, 9);
    return [`${a} + ${b} =`, a + b];
  }
  // 两位数 − 一位数（可能退位）
  function sub2d1d() {
    const a = R(11, 99), b = R(2, 9);
    return [`${a} − ${b} =`, a - b];
  }
  // 两位数 + 两位数，不进位
  function add2d2dNoCarry() {
    const t1 = R(1, 7), u1 = R(1, 8);
    const t2 = R(1, 8 - t1), u2 = R(1, 9 - u1);
    const a = t1 * 10 + u1, b = t2 * 10 + u2;
    return [`${a} + ${b} =`, a + b];
  }
  // 两位数 − 两位数，不退位
  function sub2d2dNoBorrow() {
    const t1 = R(2, 9), u1 = R(1, 9);
    const t2 = R(1, t1 - 1), u2 = R(1, u1);
    const a = t1 * 10 + u1, b = t2 * 10 + u2;
    return [`${a} − ${b} =`, a - b];
  }
  // 两位数 + 两位数（可进位，结果 ≤ 99）
  function add2d2d() {
    const a = R(13, 79), b = R(11, 99 - a);
    return [`${a} + ${b} =`, a + b];
  }
  // 两位数 − 两位数（可退位）
  function sub2d2d() {
    const a = R(31, 99), b = R(11, a - 11);
    return [`${a} − ${b} =`, a - b];
  }
  // 100 − 两位数（退位减）
  function subFrom100() {
    const b = R(11, 89);
    return [`100 − ${b} =`, 100 - b];
  }

  function genAddSub(level) {
    if (level === 1) return pick([add2d1d, sub2d1d, add2d2dNoCarry, sub2d2dNoBorrow])();
    if (level === 2) return pick([add2d2d, sub2d2d, subFrom100])();
    // 挑战：连加连减
    if (Math.random() < 0.5) {
      const a = R(21, 58), b = R(11, 30), c = R(5, 25);
      return [`${a} + ${b} − ${c} =`, a + b - c];
    }
    const b = R(11, 30), c = R(5, 20), a = R(b + c + 1, 99);
    return [`${a} − ${b} − ${c} =`, a - b - c];
  }

  function genMul(level) {
    const hi = level === 1 ? 5 : 9;
    const a = R(2, hi), b = R(2, 9);
    return [`${a} × ${b} =`, a * b];
  }

  function genDiv(level) {
    const hi = level === 1 ? 5 : 9;
    const b = R(2, hi), q = R(2, 9);
    return [`${b * q} ÷ ${b} =`, q];
  }

  function genMulAdd() {
    const a = R(2, 9), b = R(2, 9);
    if (Math.random() < 0.5) {
      const c = R(1, 20);
      return [`${a} × ${b} + ${c} =`, a * b + c];
    }
    const p = a * b, c = R(1, p - 1);
    return [`${a} × ${b} − ${c} =`, p - c];
  }

  function genMoney() {
    if (Math.random() < 0.55) {
      const y = R(1, 9), j = R(1, 9);
      return [`${y} 元 ${j} 角 = ( ) 角`, y * 10 + j];
    }
    const y = R(1, 9);
    return [`${y} 元 = ( ) 角`, y * 10];
  }

  const GENS = { add_sub: genAddSub, mul: genMul, div: genDiv, mul_add: genMulAdd, money: genMoney };
  const PLAN = {
    1: ['add_sub', 'add_sub', 'add_sub', 'mul'],
    2: ['add_sub', 'add_sub', 'mul', 'mul'],
    3: ['add_sub', 'mul', 'div', 'mul_add', 'money'],
  };

  function genMath(count, level) {
    level = Math.max(1, Math.min(3, level | 0));
    const pool = PLAN[level];
    const out = [], seen = new Set();
    let guard = 0;
    while (out.length < count && guard < count * 40) {
      guard++;
      const kind = pool[Math.floor(Math.random() * pool.length)];
      const [q, a] = GENS[kind](level);
      if (seen.has(q)) continue;
      seen.add(q);
      out.push({ kind, question: q, answer: a, level });
    }
    return out;
  }

  /* ---------- 听写 ---------- */

  const K_D = 'desk.dict.v1';   // 家长在面板里改过的词表（覆盖内置默认）
  let memD = null;

  function defaultDict() { return window.DICT || { units: [], note: '' }; }

  function dict() {
    if (useMem) return memD || defaultDict();
    try {
      const raw = localStorage.getItem(K_D);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.units)) return o;
      }
    } catch (e) {}
    return defaultDict();
  }

  function saveDict(obj) {
    if (!obj || !Array.isArray(obj.units)) throw new Error('词表格式不对');
    obj.units.forEach(u => { u.words = (u.lessons || []).reduce((a, l) => a.concat(l.words || []), []); });
    if (useMem) { memD = obj; return true; }
    try { localStorage.setItem(K_D, JSON.stringify(obj)); return true; }
    catch (e) { useMem = true; memD = obj; return true; }
  }

  function resetDict() {
    memD = null;
    try { localStorage.removeItem(K_D); } catch (e) {}
  }

  function isDictCustom() {
    if (useMem) return !!memD;
    try { return !!localStorage.getItem(K_D); } catch (e) { return false; }
  }

  function dictUnits() {
    const d = dict();
    return {
      units: (d.units || []).map(u => ({
        id: u.id, name: u.name,
        count: (u.words || []).length,
        lessons: (u.lessons || []).map(l => ({
          id: String(l.no), no: String(l.no), title: l.title,
          count: (l.words || []).length,
        })),
      })),
      note: d.note || '',
      custom: isDictCustom(),
    };
  }

  /* ---------- 艾宾浩斯出题权重 ----------
   * 孩子已经掌握的词不该和刚错的词同样频率出现。
   * 权重只看本机数据（错题本 + 最近一次做题记录）：
   *   错题本里没掌握 → stage 越低权重越高，到期没复习再加急
   *   最近一次答错   → 最重
   *   最近一次答对   → 按隔了几天衰减（1 天内较重 → 半月以上最轻）
   *   从没练过       → 中等（新词要 exposure）
   *   已掌握（fixed）→ 最轻，但不是 0（偶尔回来巩固）
   */
  function memWeights() {
    const day = fmtDay(new Date());
    const W = loadW(), A = loadA();
    const last = {};
    for (const x of A) last[x.ref] = x;         // A 按时间追加，后写覆盖 = 最近一次
    const weights = {};
    const refs = new Set(Object.keys(W).concat(Object.keys(last)));
    refs.forEach(ref => {
      const w = W[ref];
      if (w && !w.fixed) {
        let wt = [12, 8, 5, 3, 2][Math.min(w.stage, 4)];
        if (w.due <= day) wt += 4;              // 排期到了还堆着的，优先
        weights[ref] = wt;
        return;
      }
      const l = last[ref];
      if (!l) { weights[ref] = 5; return; }
      if (!l.ok) { weights[ref] = 12; return; } // 最近一次是错的（含听写标"不会"）
      const days = Math.round((new Date(day + 'T00:00:00') - new Date(l.day + 'T00:00:00')) / 86400000);
      weights[ref] = days <= 1 ? 7 : days <= 3 ? 5 : days <= 7 ? 3 : days <= 15 ? 2 : 1;
    });
    return weights;
  }

  function wtOf(weights, ref) {
    const w = weights[ref];
    return w == null ? 5 : Math.max(0.3, w);    // 没数据的按新词处理
  }

  // 加权不放回抽样：重 vocab 先出，轻 vocab 也会偶尔露脸
  function weightedPick(items, refOf, count) {
    const pool = items.slice();
    const out = [];
    const weights = memWeights();
    while (out.length < count && pool.length) {
      let total = 0;
      const ws = pool.map(x => { const w = wtOf(weights, refOf(x)); total += w; return w; });
      let r = Math.random() * total;
      let idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) { idx = i; break; } }
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  function pickDict(unit, count, lesson) {
    const d = dict();
    let units = d.units || [];
    if (unit && unit !== 'all') units = units.filter(u => u.id === unit);
    const words = [];
    units.forEach(u => {
      (u.lessons || []).forEach(l => {
        if (lesson && lesson !== 'all' && String(l.no) !== String(lesson)) return;
        (l.words || []).forEach(w => words.push({
          word: w, unit: u.id, unit_name: u.name,
          lesson: String(l.no), lesson_title: l.title,
        }));
      });
      // 兜底：老格式只有 words
      if (!u.lessons) (u.words || []).forEach(w => words.push({ word: w, unit: u.id, unit_name: u.name }));
    });
    return weightedPick(words, w => 'word:' + w.word, count);
  }

  /* ---------- 提交 / 错题排期 ---------- */

  /* 一次提交 = 一个批次（batch）。家长端靠它把流水还原成「几点做了哪一组」，
   * src 区分这一组是哪个入口做的：
   *   practice 模块练习（口算/拼音/听写页）· review 复习 · check 家长核对
   * 旧记录没有这两个字段 → 读取时 batch 退回按 ts 归组、src 当 practice。
   */
  function submit(payload) {
    const subject = payload.subject || 'math';
    const items = payload.items || [];
    const src = ['practice', 'review', 'check'].indexOf(payload.src) >= 0 ? payload.src : 'practice';
    const now = new Date();
    const ts = fmtTs(now), day = fmtDay(now);
    const batch = payload.batch || (ts + '#' + Math.random().toString(36).slice(2, 6));
    const A = loadA(), W = loadW();
    const fixedNow = [];

    items.forEach(it => {
      const ref = String(it.ref || it.question || '').slice(0, 200);
      // ok === null 表示"中性"：孩子写完了但没判对错（听写默认情况），不计对错、不进错题本
      const neutral = it.ok === null || it.ok === undefined;
      const ok = neutral ? null : (it.ok ? 1 : 0);

      A.push({
        ts, day, subject, batch, src,
        kind: String(it.kind || ''),
        ref,
        question: String(it.question || ''),
        answer: String(it.answer || ''),
        given: String(it.given || ''),
        ok,
        self: it.self ? 1 : 0,   // 自评类（听写），不计入正确率
      });

      if (neutral) return;       // 中性记录不碰错题排期

      const row = W[ref];
      if (!ok) {
        if (!row) {
          W[ref] = {
            ref, subject,
            kind: String(it.kind || ''),
            question: String(it.question || ''),
            answer: String(it.answer || ''),
            stage: 0, wrong: 1, fixed: 0,
            due: addDays(day, STAGES[0]),
            last_ts: ts,
          };
        } else {
          row.wrong += 1;
          row.stage = 0;
          row.fixed = 0;
          row.due = addDays(day, STAGES[0]);
          row.last_ts = ts;
        }
      } else if (row && !row.fixed) {
        row.stage += 1;
        if (row.stage >= STAGES.length) {
          row.fixed = 1;
          fixedNow.push(ref);
        } else {
          row.due = addDays(day, STAGES[row.stage]);
        }
        row.last_ts = ts;
      }
    });

    saveA(trimAttempts(A));
    saveW(W);
    return { ok: true, saved: items.length, fixed: fixedNow };
  }

  function trimAttempts(A) {
    if (!A.length) return A;
    const cut = addDays(fmtDay(new Date()), -MAX_DAYS);
    let i = 0;
    while (i < A.length && A[i].day < cut) i++;
    return i ? A.slice(i) : A;
  }

  /* ---------- 最近一次听写（供家长核对本子补录） ----------
   * 孩子点「写完了」是中性记录，机器不知道写没写对；家长对本子核对后在这里补录。
   * 家长核对属于客观判定 → self=0，计入正确率（与孩子自评区分开）。
   */

  const K_LAST = 'desk.lastDicts.v1';
  const LAST_MAX = 5;          // 保留最近 5 组，家长没来得及核对不会被覆盖
  let memL = [];

  function lastDicts() {
    if (useMem) return memL;
    try {
      const raw = JSON.parse(localStorage.getItem(K_LAST) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }

  function saveLastDict(items) {
    if (!Array.isArray(items) || !items.length) return null;
    const now = new Date();
    const group = { ts: fmtTs(now), day: fmtDay(now), items };
    const all = [group].concat(lastDicts()).slice(0, LAST_MAX);
    if (useMem) memL = all;
    else { try { localStorage.setItem(K_LAST, JSON.stringify(all)); } catch (e) { memL = all; } }
    return group;
  }

  // verdict: 'ok' | 'bad'。只处理孩子标"写完了"的词（"不会"的已进错题本，不用再核）
  function markLastWord(g, i, verdict) {
    const all = lastDicts();
    const L = all[g];
    if (!L || !L.items || !L.items[i]) return null;
    const it = L.items[i];
    if (it.mark !== 'done' || it.verdict) return all;   // 已核对过的不重复提交
    it.verdict = verdict;
    if (useMem) memL = all;
    else { try { localStorage.setItem(K_LAST, JSON.stringify(all)); } catch (e) { memL = all; } }
    submit({
      subject: 'dictation', src: 'check',
      items: [{
        kind: 'word', ref: 'word:' + it.word, question: it.word, answer: it.word,
        given: verdict === 'bad' ? '写错' : it.word,
        ok: verdict === 'bad' ? 0 : 1,
        self: 0,
      }],
    });
    return all;
  }

  // 这一组里剩下的（孩子写完了但还没核的）一次性标成写对
  function markRestOk(g) {
    const all = lastDicts();
    const L = all[g];
    if (!L || !L.items) return all;
    const rest = [];
    L.items.forEach((it, i) => {
      if (it.mark === 'done' && !it.verdict) { it.verdict = 'ok'; rest.push(i); }
    });
    if (!rest.length) return all;
    if (useMem) memL = all;
    else { try { localStorage.setItem(K_LAST, JSON.stringify(all)); } catch (e) { memL = all; } }
    submit({
      subject: 'dictation', src: 'check', batch: 'check-' + (L.ts || '') ,
      items: rest.map(i => ({
        kind: 'word', ref: 'word:' + L.items[i].word, question: L.items[i].word,
        answer: L.items[i].word, given: L.items[i].word, ok: 1, self: 0,
      })),
    });
    return all;
  }

  /* ---------- 学校听写错词（家长补录） ----------
   * 老师在学校听写错的字 / 拼音，家长在面板里点进来，直接进错题本，
   * 走正常的 1/3/7/15/30 天排期，和家里听写错的词一视同仁。
   * kind：'word' = 字写错（练写字）；'py' = 拼音写错（练选拼音）
   * 只写错题本、不写 attempts —— 学校那次不是在这台设备上做的，不该进正确率；
   * 等孩子在这台设备上复习了，才有练习记录。
   */

  function addWrongWord(raw, kind, unit, lesson) {
    const w = String(raw || '').replace(/\s+/g, '').trim();
    if (!w) return { ok: false, reason: 'empty' };
    const isPy = kind === 'py';
    const info = byWord()[w];
    if (isPy && !info) return { ok: false, reason: 'no-py', word: w };   // 没有拼音数据就没法出选择题
    const now = new Date(), day = fmtDay(now);
    const W = loadW();
    const ref = (isPy ? 'py:' : 'word:') + w;
    const old = W[ref];
    if (old) {
      old.wrong += 1;
      old.stage = 0;
      old.fixed = 0;
      old.due = day;              // 刚错的当天就能练一遍，趁热
      old.last_ts = fmtTs(now);
      old.src = 'school';
    } else {
      W[ref] = {
        ref, subject: isPy ? 'pinyin' : 'dictation',
        kind: isPy ? 'py' : 'word',
        question: w,
        answer: isPy ? pyText(info.t3) : w,
        stage: 0, wrong: 1, fixed: 0,
        due: day, last_ts: fmtTs(now),
        src: 'school', unit: unit || '', lesson: lesson || '',
      };
    }
    saveW(W);
    return {
      ok: true, ref, word: w, kind: isPy ? 'py' : 'word',
      existed: !!old, pinyin: info ? pyText(info.t3) : '',
    };
  }

  function delWrong(ref) {
    const W = loadW();
    if (!W[ref]) return false;
    delete W[ref];
    saveW(W);
    return true;
  }

  function wrongAll() { return loadW(); }

  // 家长补录过的词（按最近录入排）
  function schoolWrongs() {
    return Object.values(loadW())
      .filter(r => r.src === 'school')
      .sort((a, b) => String(b.last_ts || '').localeCompare(String(a.last_ts || '')));
  }

  /* ---------- 拼音练习 ----------
   * 题库在 pinyin.js（window.PINYIN），记音用声调编号：yi2 ge4。
   * 选项干扰项：题库里手写了「变调 / 多音字」的错法；其余按真实错法自动造
   * （改声调 / 平翘舌对调 / 前后鼻音对调），不是随机乱码。
   */

  const TONE_GROUPS = { a: 'āáǎà', o: 'ōóǒò', e: 'ēéěè', i: 'īíǐì', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };

  // 'zhang3' → 'zhǎng'
  function mark(syl) {
    const m = String(syl).match(/^([a-zA-Zv]+)([0-5])?$/);
    if (!m) return String(syl);
    const base = m[1].replace(/v/g, 'ü');
    const tone = m[2] ? parseInt(m[2], 10) : 5;
    if (tone < 1 || tone > 4) return base;
    let idx = -1;
    for (const v of ['a', 'o', 'e']) {
      const k = base.indexOf(v);
      if (k >= 0) { idx = k; break; }
    }
    if (idx < 0 && /iu/.test(base)) idx = base.indexOf('u');
    if (idx < 0 && /ui/.test(base)) idx = base.indexOf('i');
    if (idx < 0) {
      for (let i = base.length - 1; i >= 0; i--) {
        if ('aeiouü'.indexOf(base[i]) >= 0) { idx = i; break; }
      }
    }
    if (idx < 0) return base;
    const g = TONE_GROUPS[base[idx]];
    if (!g) return base;
    return base.slice(0, idx) + g[tone - 1] + base.slice(idx + 1);
  }

  const pyText = t3 => String(t3).split(' ').map(mark).join(' ');

  const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
    'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];

  function splitSyl(s) {
    const m = String(s).match(/^([a-zA-Zv]+)([0-5])$/);
    if (!m) return null;
    const base = m[1];
    let init = '';
    for (const x of INITIALS) if (base.indexOf(x) === 0) { init = x; break; }
    return { init, final: base.slice(init.length), tone: parseInt(m[2], 10), base };
  }

  // 二年级真实会混的声母
  const INIT_SWAP = {
    zh: 'z', z: 'zh', ch: 'c', c: 'ch', sh: 's', s: 'sh',
    n: 'l', l: 'n', r: 'l', j: 'q', q: 'j', b: 'p', p: 'b',
    d: 't', t: 'd', g: 'k', k: 'g',
  };

  function shuffleArr(a) {
    const x = a.slice();
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  }

  // 按类型造候选错法：tone 声调 / init 平翘舌与 n-l / final 前后鼻音 / neutral 轻声读成全调
  function mutations(t3) {
    const syls = String(t3).split(' ');
    const out = { tone: [], init: [], final: [], neutral: [] };
    const add = (bucket, arr) => {
      const s = arr.join(' ');
      if (s !== t3 && out[bucket].indexOf(s) < 0) out[bucket].push(s);
    };
    syls.forEach((s, i) => {
      const p = splitSyl(s);
      if (!p) return;
      const arr = () => syls.slice();

      for (let t = 1; t <= 5; t++) {
        if (t === p.tone) continue;
        if (t === 5 && p.tone !== 5) continue;   // 有调的字变轻声太假
        const a = arr(); a[i] = p.base + t; add('tone', a);
      }
      // 轻声字读成实调——这才是练轻声最该错的写法
      if (p.tone === 5) {
        for (let t = 1; t <= 4; t++) {
          const a = arr(); a[i] = p.base + t; add('neutral', a);
        }
      }

      const sw = INIT_SWAP[p.init];
      if (sw) { const a = arr(); a[i] = sw + p.final + p.tone; add('init', a); }

      const f = p.final;
      let nf = null;
      if (/ang$/.test(f)) nf = f.slice(0, -3) + 'an';
      else if (/an$/.test(f)) nf = f + 'g';
      else if (/eng$/.test(f)) nf = f.slice(0, -3) + 'en';
      else if (/en$/.test(f)) nf = f + 'g';
      else if (/ing$/.test(f)) nf = f.slice(0, -3) + 'in';
      else if (/in$/.test(f)) nf = f + 'g';
      if (nf) { const a = arr(); a[i] = p.init + nf + p.tone; add('final', a); }
    });
    return out;
  }

  // 按专项挑错法，保证干扰项「像真的」
  function autoWrong(t3, mode) {
    const m = mutations(t3);
    if (mode === 'nasal' || mode === 'flat' || mode === 'light') {
      const first = mode === 'nasal' ? m.final
        : mode === 'flat' ? m.init
          : m.neutral.concat(m.tone);
      const rest = shuffleArr([].concat(m.tone, m.neutral, m.init, m.final));
      const out = [];
      const push = s => { if (out.length < 3 && out.indexOf(s) < 0) out.push(s); };
      first.slice(0, 2).forEach(push);
      rest.forEach(push);
      return out;
    }
    // 全部：声调 / 声母 / 韵母 各来一个，最像真的三选一干扰
    const out = [];
    const buckets = shuffleArr([m.tone, m.init, m.final].filter(b => b.length));
    buckets.forEach(b => { if (out.length < 3 && b[0]) out.push(b[0]); });
    shuffleArr([].concat(m.tone, m.neutral, m.init, m.final)).forEach(s => {
      if (out.length < 3 && out.indexOf(s) < 0) out.push(s);
    });
    return out.slice(0, 3);
  }

  let pyIndex = null;
  function byWord() {
    if (!pyIndex) {
      pyIndex = {};
      ((window.PINYIN && window.PINYIN.items) || []).forEach(it => { pyIndex[it.w] = it; });
    }
    return pyIndex;
  }

  function makeQuestion(it, mode) {
    const wide = !mode || mode === 'all';
    // 变调判断题：只问「读第几声」，不碰注音写法（三声连读的注音仍标本调）
    const toneForm = (wide || mode === 'sandhi') && (it.ro || (it.rt && Math.random() < 0.34));
    if (toneForm) {
      const n = it.rt || 1;
      const right = '第' + '一二三四'[n - 1] + '声';
      const opts = shuffleArr(['第一声', '第二声', '第三声', '第四声']);
      return {
        form: 'tone', kind: 'pytone', w: it.w, sy: it.sy || 0,
        opts, ans: opts.indexOf(right), question: it.w, answer: right,
      };
    }
    const right = pyText(it.t3);
    // 手写的干扰项只属于「变调 / 多音字」——别的专项硬塞进来就跑题了
    const useOwn = it.d && (wide || mode === 'sandhi' || mode === 'poly');
    let wrong = useOwn ? it.d.map(pyText).filter(x => x !== right) : [];
    if (wrong.length < 3) {
      autoWrong(it.t3, mode).map(pyText).forEach(x => {
        if (x !== right && wrong.indexOf(x) < 0) wrong.push(x);
      });
    }
    const opts = shuffleArr([right].concat(wrong.slice(0, 3)));
    return {
      form: 'choose', kind: 'py', w: it.w, sy: it.sy, t3: it.t3,
      opts, ans: opts.indexOf(right), question: it.w, answer: right,
    };
  }

  function pyScope(unit, lesson) {
    const all = (window.PINYIN && window.PINYIN.items) || [];
    if (!unit || unit === 'all') return all.slice();
    // 专项题（变调/轻声/多音字补充的 63 条）没有课本归属，只在整册范围里出现
    return all.filter(x => x.u === unit &&
      (!lesson || lesson === 'all' || String(x.l) === String(lesson)));
  }

  function genPinyin(count, cat, unit, lesson) {
    const all = (window.PINYIN && window.PINYIN.items) || [];
    const base = pyScope(unit, lesson);
    const scoped = base.length ? base : all.slice();
    let pool = (!cat || cat === 'all') ? scoped.slice() : scoped.filter(x => x.cats.indexOf(cat) >= 0);
    // 三声连读这类词只能出「读第几声」，别的专项里不掺进来
    if (cat && cat !== 'all' && cat !== 'sandhi') pool = pool.filter(x => !x.ro);
    // 这一课没有这个专项的词，就按本课全出，不越界回整册
    if (!pool.length) pool = scoped.slice();
    if (!pool.length) pool = all.slice();
    if (!pool.length) return [];
    const chosen = weightedPick(pool, it => 'pinyin:' + it.w, Math.min(count, pool.length));
    const out = [];
    for (let i = 0; i < count; i++) out.push(makeQuestion(chosen[i % chosen.length], cat));
    return out;
  }

  // 复习时按词重建选项（错题本只存了词和答案）
  function pyOptionsFor(word) {
    const it = byWord()[word];
    if (!it) return null;
    const right = pyText(it.t3);
    let wrong = it.d ? it.d.map(pyText).filter(x => x !== right) : [];
    if (wrong.length < 3) {
      autoWrong(it.t3, 'all').map(pyText).forEach(x => {
        if (x !== right && wrong.indexOf(x) < 0) wrong.push(x);
      });
    }
    const opts = shuffleArr([right].concat(wrong.slice(0, 3)));
    return { opts, ans: opts.indexOf(right), answer: right };
  }

  /* ---------- 复习 ---------- */

  function review() {
    const day = fmtDay(new Date());
    const W = loadW();
    const items = Object.values(W)
      .filter(r => !r.fixed && r.due <= day)
      .sort((a, b) => (b.wrong - a.wrong) || a.due.localeCompare(b.due))
      .slice(0, 20)
      .map(r => ({
        ref: r.ref, subject: r.subject, kind: r.kind,
        question: r.question, answer: r.answer,
        stage: r.stage, wrong: r.wrong, due: r.due,
        src: r.src || '',
      }));
    return { items, date: day };
  }

  /* ---------- 统计 ---------- */

  function stats(days) {
    days = days || 7;
    const A = loadA(), W = loadW();
    const day = fmtDay(new Date());
    const d0 = addDays(day, -(days - 1));

    // 今日按「科目 × 来源」拆开：家长要看得出哪些是模块练习、哪些是复习
    const todayMap = {};
    A.filter(x => x.day === day).forEach(x => {
      const src = x.src || 'practice';
      const k = x.subject + '|' + src;
      const o = todayMap[k] || (todayMap[k] = { subject: x.subject, src, n: 0, judged: 0, ok: 0 });
      o.n++;
      if (!x.self) { o.judged++; o.ok += x.ok; }
    });

    /* 批次：一次提交 = 一组题。家长端拿它还原「几点做了哪一组、多少道、对几个」，
     * 而不是只看到一个总数。旧记录没有 batch 字段，按提交秒数归组。 */
    const bMap = {};
    A.filter(x => x.day >= d0).forEach(x => {
      const key = x.batch || ('legacy:' + x.ts);
      const b = bMap[key] || (bMap[key] = {
        key, day: x.day, ts: x.ts, src: x.src || 'practice',
        n: 0, judged: 0, ok: 0, dunno: 0, subjects: {},
      });
      b.n++;
      b.subjects[x.subject] = (b.subjects[x.subject] || 0) + 1;
      if (!x.self) { b.judged++; b.ok += x.ok; }
      if (x.subject === 'dictation' && x.given === '不会') b.dunno++;
    });
    const dayMap = {};
    Object.keys(bMap).forEach(k => {
      const b = bMap[k];
      (dayMap[b.day] = dayMap[b.day] || []).push(b);
    });
    const dayList = Object.keys(dayMap).sort().reverse().map(d => ({
      day: d,
      batches: dayMap[d].sort((a, b) => String(b.ts).localeCompare(String(a.ts))),
    }));

    const seriesMap = {};
    A.filter(x => x.day >= d0).forEach(x => {
      const o = seriesMap[x.day] || (seriesMap[x.day] = { day: x.day, n: 0, judged: 0, ok: 0 });
      o.n++;
      if (!x.self) { o.judged++; o.ok += x.ok; }
    });

    const kindMap = {};
    A.filter(x => x.day >= d0).forEach(x => {
      const o = kindMap[x.kind] || (kindMap[x.kind] = { kind: x.kind, n: 0, judged: 0, ok: 0 });
      o.n++;
      if (!x.self) { o.judged++; o.ok += x.ok; }
    });

    const wrong = Object.values(W)
      .filter(r => !r.fixed)
      .sort((a, b) => (b.wrong - a.wrong) || a.due.localeCompare(b.due))
      .slice(0, 40)
      .map(r => ({
        ref: r.ref, subject: r.subject, kind: r.kind,
        question: r.question, answer: r.answer,
        stage: r.stage, wrong: r.wrong, due: r.due,
        src: r.src || '',
      }));

    // 连续打卡：从今天（或昨天）往前数
    const daySet = new Set(A.map(x => x.day));
    let streak = 0;
    let probe = new Date();
    for (let i = 0; i < 400; i++) {
      const d = fmtDay(probe);
      if (daySet.has(d)) {
        streak++;
        probe.setDate(probe.getDate() - 1);
      } else if (streak === 0 && i === 0) {
        probe.setDate(probe.getDate() - 1);
      } else break;
    }

    return {
      today: Object.values(todayMap),
      dayList,
      series: Object.values(seriesMap).sort((a, b) => a.day.localeCompare(b.day)),
      wrong,
      kinds: Object.values(kindMap).sort((a, b) => b.n - a.n),
      streak,
    };
  }

  // 英语跟读：每个句包最近一次练的时间（推荐「最久没练的」用）
  function lastSeenByPack() {
    const packs = (typeof window !== 'undefined' && window.ENGLISH && ENGLISH.packs) || [];
    const idx = {};
    packs.forEach(pk => (pk.s || []).forEach(x => { idx[x.id] = pk.id; }));
    const out = {};
    for (const x of loadA()) {
      const ref = String(x.ref || '');
      if (!ref.startsWith('eng:')) continue;
      const pid = idx[ref.slice(4)];
      if (pid) out[pid] = x.ts;      // attempts 按时间追加，后写覆盖 = 最近一次
    }
    return out;
  }

  /* ---------- 备份 ---------- */

  function exportData() {
    return {
      app: 'learning-desk',
      version: 1,
      exported_at: fmtTs(new Date()),
      attempts: loadA(),
      wrong: loadW(),
      cfg: (function () { try { return JSON.parse(localStorage.getItem('desk.cfg') || '{}'); } catch (e) { return {}; } })(),
      dict: isDictCustom() ? dict() : null,   // 只在家改过词表时才带
      lastDicts: lastDicts(),
      times: loadT(),
    };
  }

  function importData(obj) {
    if (!obj || obj.app !== 'learning-desk' || !Array.isArray(obj.attempts)) {
      throw new Error('不是本工作台的备份文件');
    }
    saveA(obj.attempts || []);
    saveW(obj.wrong || {});
    try { if (obj.cfg) localStorage.setItem('desk.cfg', JSON.stringify(obj.cfg)); } catch (e) {}
    if (obj.dict && Array.isArray(obj.dict.units)) saveDict(obj.dict);
    if (obj.times && typeof obj.times === 'object') saveT(obj.times);
    if (Array.isArray(obj.lastDicts)) {
      memL = obj.lastDicts;
      try { localStorage.setItem(K_LAST, JSON.stringify(obj.lastDicts)); } catch (e) {}
    }
    return { attempts: (obj.attempts || []).length, wrong: Object.keys(obj.wrong || {}).length };
  }

  function resetAll() {
    try { localStorage.removeItem(K_A); localStorage.removeItem(K_W); localStorage.removeItem(K_LAST); localStorage.removeItem(K_T); } catch (e) {}
    memA = []; memW = {}; memL = []; memT = {};
  }

  /* ---------- 对外接口（与原后端签名一致） ---------- */

  async function api(path) {
    const [p, qs] = String(path).split('?');
    const q = new URLSearchParams(qs || '');
    switch (p) {
      case '/api/ping': return { ok: true };
      case '/api/quiz/math':
        return { items: genMath(parseInt(q.get('count') || '20', 10), parseInt(q.get('level') || '2', 10)) };
      case '/api/quiz/dictation':
        return { items: pickDict(q.get('unit') || 'all', parseInt(q.get('count') || '10', 10), q.get('lesson') || 'all') };
      case '/api/quiz/pinyin':
        return { items: genPinyin(parseInt(q.get('count') || '12', 10), q.get('cat') || 'all', q.get('unit') || 'all', q.get('lesson') || 'all') };
      case '/api/dict/units': return dictUnits();
      case '/api/review': return review();
      case '/api/stats': return stats(parseInt(q.get('days') || '7', 10));
      default: throw new Error('未知接口 ' + p);
    }
  }

  async function post(path, body) {
    if (path === '/api/submit') return submit(body || {});
    throw new Error('未知接口 ' + path);
  }

  return {
    api, post,
    exportData, importData, resetAll,
    getDict: dict, saveDict, resetDict, isDictCustom,
    saveLastDict, lastDicts, markLastWord, markRestOk,
    addWrongWord, delWrong, wrongAll, schoolWrongs, lastSeenByPack,
    pinyin: { text: pyText, mark, options: pyOptionsFor, byWord, scope: pyScope },
    saveRun, timeInfo, timesAll, resetTimes,
    isMemoryMode: () => useMem,
  };
})();

const api = LD.api;
const post = LD.post;
