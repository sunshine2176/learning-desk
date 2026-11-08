'use strict';
/* 统一解析 playwright：脚本用 `const { chromium } = require('./pw')`。
 * 顺序：PW_DIR 环境变量 → npm 安装的 playwright → npx 缓存里的 playwright（逐个尝试，跳过残缺安装）。
 * 都没有就报错并提示怎么装。 */
function load() {
  if (process.env.PW_DIR) return require(process.env.PW_DIR);
  try { return require('playwright'); } catch (e) { /* 继续找 */ }
  try {
    const { execSync } = require('child_process');
    const dirs = execSync('ls -d $HOME/.npm/_npx/*/node_modules/playwright 2>/dev/null || true')
      .toString().trim().split('\n').filter(Boolean);
    for (const dir of dirs) {
      try { return require(dir); } catch (e) { /* 这个缓存不完整，试下一个 */ }
    }
  } catch (e) { /* 落到报错 */ }
  throw new Error('找不到 playwright。先 `npm i -D playwright && npx playwright install chromium`，'
    + '或设 PW_DIR 指向已安装的 playwright 目录（npx 缓存也行）。');
}
module.exports = load();
