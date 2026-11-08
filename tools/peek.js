/* peek.js — 打印各专项的样题，人眼看干扰项质量 */
'use strict';
const store = {};
global.localStorage = {
  setItem: (k, v) => { store[k] = String(v); },
  getItem: k => (k in store ? store[k] : null),
  removeItem: k => { delete store[k]; },
};
global.window = {};
const fs = require('fs');
let code = fs.readFileSync(__dirname + '/../web/pinyin.js', 'utf8');
code += fs.readFileSync(__dirname + '/../web/local.js', 'utf8');
code += `
;(async () => {
  for (const cat of ['sandhi', 'poly', 'nasal', 'flat', 'light', 'all']) {
    console.log('\\n【' + cat + '】');
    const r = await api('/api/quiz/pinyin?count=6&cat=' + cat);
    r.items.forEach(q => {
      const opts = q.opts.map((o, i) => (i === q.ans ? '✔' : '  ') + o).join(' | ');
      console.log('  ' + q.w + '   ' + opts);
    });
  }
})();
`;
eval(code);
