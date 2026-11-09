# 纯前端学习台：把「出题、判分、复习排期」全搬进浏览器

> 项目：[sunshine2176/learning-desk](https://github.com/sunshine2176/learning-desk) · 在线实例：https://learning.basisdiff.com · MIT
> 给孩子（小学二年级）做的口算 / 语文听写 / 拼音 / 英语跟读工作台。没有后端、没有账号、没有 API 费用，数据存在孩子那台 iPad 的 localStorage 里。
> 本文所有函数名、数字、文件路径都来自仓库当前代码（v15，2026-11-09 核对），不是事后回忆。

## 一、先算账：这个应用为什么不需要服务器

很多"给娃做的工具"第一步就卡在"要不要租个服务器"。这个项目的答案是：一条都不需要。把四个模块拆开看，每一条业务逻辑都落在浏览器算力的射程内。

**出题是规则计算。** 口算题由 `web/local.js` 里的生成器现场造：`genAddSub(level)`、`genMul(level)`、`genDiv(level)`、`genMulAdd()`、`genMoney()`，最后汇总到 `genMath(count, level)`。每个生成器直接返回 `[题面, 答案]` 二元组，比如两位数加一位数就是 `R(11, 89)` 配 `R(2, 9)`。听写和拼音的题目不是生成的，而是从 `data/dictation.json`（8 个单元、239 个词）和 `data/pinyin.json`（302 条）里抽。抽哪一条也不是随机，见第三节。

**判分是字符串比对。** 口算的判定只有一行：`const ok = !forceSkip && String(it.answer) === m.given;`（`web/app.js` 的 `checkMath`）。拼音是选项下标比对：`const ok = i === q.ans;`（`pyPick`）。听写干脆不判——这是设计，不是偷懒，理由在第二节。

**复习排期是本地日期运算。** `web/local.js` 顶部写着 `const STAGES = [1, 3, 7, 15, 30];`，到期日由 `addDays(dayStr, n)` 算：先把 `dayStr + 'T00:00:00'` 解析成 Date，再 `setDate(getDate() + n)`。没有任何时区服务、没有 cron、没有队列。

于是服务端整体被搬进了浏览器。关键设计在 `web/local.js` 的开头注释里：它对外暴露 `api(path)` / `post(path, body)`，**签名和原来的服务端接口保持一致**。这意味着前端页面完全不知道数据层在哪——今天读 localStorage，将来要接云数据库（多设备同步），只替换 `local.js` 这一层，`app.js` 一行都不用改。

数据落在四个 localStorage key：`desk.attempts.v1`（做题流水）、`desk.wrong.v1`（错题本与排期）、`desk.times.v1`（计时与最快纪录）、`desk.lastDicts.v1`（最近 5 组听写，等家长核对）。隐私模式（localStorage 不可写）下自动降级为内存存储，功能不崩。

## 二、三个反直觉设计

### 1. 听写不让孩子自评对错

听写页上孩子只有两个按钮：**「写完了，下一个」**和**「不会，跳过」**。没有"写对了 / 写错了"，结果页也不给分数。

代码里 `wordNext(mark)` 的 `mark` 只有 `'done'` 和 `'dunno'` 两种。`'done'` 记成 `ok: null` 的**中性记录**；`'dunno'` 才记 `ok: 0` 并进错题本。结果页只列"你标了 N 个不会"，`dictResult` 里根本不存在"对几个"这个概念。

对错由家长对本子核对后补录：家长面板调 `markLastWord(g, i, verdict)`，它只处理 `mark === 'done'` 且还没核对过的词，写回时 `self: 0`（客观判定），这时听写才计入正确率。

为什么这样做？因为让孩子自评"对了"本质上是把奖励信号交给他自己，他会很快学会"点对我就能快点结束"。把判定权交给唯一能看见纸面的人——家长——系统里的数据才是真的。同理，家长核对不会被孩子提前覆盖：`saveLastDict` 保留最近 5 组，没来得及核对也不会丢。

### 2. 英语跟读不用 ASR 打分

流程是：听原句（预生成神经 TTS）→ 点录音跟读 → 回放自己的录音和原音对比 → 自评"读得不错 / 再来一遍"。

录音走 `MediaRecorder`：`ondataavailable` 收 `ev.data` 进 `e.chunks`，`onstop` 时拼成 `new Blob(e.chunks, { type })`，立刻 `URL.createObjectURL(e.blob)` 生成回放地址，350ms 后自动播给孩子听。设备不支持录音时（启动时探测 `const ENG_REC_OK = typeof MediaRecorder !== 'undefined'`）降级成"只能听和跟读，没有对比回放"。

刻意不做语音识别评分，理由很朴素：机器给儿童发音打分太苛刻，一句"不标准"就能把开口意愿打没。自己听自己，比屏幕上跳一个分数有用。

### 3. 拼音介音的干扰项，j/q/x 不开头

"边 biān" 孩子会念成 "班 bān"——丢介音（i/u）是二年级最典型的错法之一。所以拼音专项里加了 `medial` 一类，共 **34 个课本词**入专项。

生成端在 `tools/gen_pinyin.py`：`re.search(r'(iang|uang|uan|ian)$', b)` 命中就加 `medial`，但要求声母不在 `('j', 'q', 'x')` 里。为什么排除？因为普通话里 j/q/x 后面没有真正的 an 韵——`qan` 不是合法拼音，"去掉介音"的干扰项造不出来，硬造就是假题。

干扰项在 `web/local.js` 的 `autoWrong(t3, 'medial')` 里造：按 `iang→ang`、`uang→ang`、`uan→an`、`ian→an` 的顺序替换（**先长后短**，否则 `uan` 会被 `ian` 规则抢先误伤），剩下的位置用声调变化补足三个选项。所以干扰项长这样：`biān` 的错法是 `bān`，正是孩子嘴里的错法，而不是随机乱码。

## 三、记忆加权的数学

出题池不随机抽，按记忆强度加权（`memWeights()`，`web/local.js`）：

| 状态 | 权重 |
|---|---|
| 错题本里未掌握 | `[12, 8, 5, 3, 2]` 按 stage 递减；排期已到期再加 `+4` |
| 最近一次答错 | 12 |
| 最近一次答对 | 1 天内 7 / 3 天内 5 / 7 天内 3 / 15 天内 2 / 更久 1 |
| 从没练过 | 5 |
| 已掌握（fixed） | 1（最低 0.3，不是 0） |

抽样是**加权不放回**（`weightedPick`）：`Math.random() * total` 累积相减，抽中的从池里 `splice` 掉，保证一组题不重复。

排期规则：答错 → `stage = 0`，明天（`STAGES[0]`）再来；答对 → `stage += 1`，按 1/3/7/15/30 天推下一次；`stage >= STAGES.length`（连对 5 轮）→ `fixed = 1`，退出错题本，但权重留 1，偶尔回来打个照面。

实测（`tools/check-srs.js`，每轮 8 组、每组 6 道，2026-11-09 本机跑）：刚错的词平均出现 **0.9~1.5 次/组**，一个月前对过的词 **0.0~0.1 次/组**。脚本的阈值是"压到五分之一以下"，多数轮次全过；但 8 组样本的随机波动会让个别轮次卡在阈值边缘——这是测试样本量的问题，不是加权逻辑的问题。要更稳就把 `N` 从 8 调大，代价是跑得久。

## 四、发音和计时：两个容易被低估的细节

### 听写发音为什么不用系统 TTS

听写是"听音写字"，音如果不清楚，题就没法做。浏览器自带 `speechSynthesis` 在 iPad 上走的是 Ting-Ting 音色，单念一个双字词时音节会糊在一起，"勺子 / 秋千 / 转动"这类词孩子根本听不出来。所以 239 个听写词和 48 个英语句子全部预生成音频：`tools/gen_audio.py` 用 edge-tts（微软 Edge 的神经音色）生成 `web/audio/*.mp3`，每个词连读两遍、语速放慢，共 287 个文件、3.2MB，跟静态页面一起托管。

好处是清晰度和一致性都锁死了：同一句每次播放完全一样，不依赖设备装了什么语音包，也不花一分钱 API 费。旧机器上还留着一层兜底——课本外新加的词没有录音，`playWord` 会自动退回系统朗读。生成脚本还带 `--check` 只查缺哪些文件，换音色时用 `--force` 全量重生成。

### 计时只在同口径内比

`LD.saveRun(key, ms, label)` 的 key 不是"口算"这样粗的键，而是 `math:简单:10` 这种带科目、难度、题数、范围的键；听写是 `dict` + 范围标签，复习是 `review:<题数>`。每组结束拿这次的耗时和同 key 的历史最快 `rec.best` 比，结果页给三种卡片：🏆 新纪录 / 首次 / 没破。

为什么这么设计？因为"5 道题"和"20 道题"比时间没有意义，不同难度之间比更没有意义——一旦混着比，孩子会立刻发现刷最简单档就能破纪录。数据存在 `desk.times.v1`，每组最多保留最近 30 次成绩（`MAX_RUNS = 30`），家长面板里按项目列最快和次数。

## 五、PWA / Service Worker：离线是顺手拿到的

`web/sw.js` 只有 53 行：`const VERSION = 'v15'`，`CACHE = 'desk-' + VERSION`，预缓存 12 个静态文件（页面、样式、6 个脚本、manifest、两张图标）。install 时 `addAll` 后 `skipWaiting()`，activate 时删掉所有旧版本缓存再 `clients.claim()`。

fetch 策略是"先给缓存、后台更新"：命中缓存立即返回，同时发起网络请求把新版本写回缓存；没命中才等网络，网络也挂就回 `index.html`。发音 mp3 不在预缓存列表里，播过哪个就进缓存哪个——287 个音频共 3.2MB，不该让第一次打开的人等。

配套细节：`web/vercel.json` 给 `/sw.js` 加了 `no-cache, no-store, must-revalidate`，避免"用户永远停在旧版本"。改任何 js 都要把 `sw.js` 的 `VERSION` 加一，这条写在 README 里，也会在部署时被踩一次。

**2026-11-09 线上实测**（Playwright + Chrome，真实访问 https://learning.basisdiff.com）：

- Service Worker 状态 `activated`，缓存 `desk-v15` 里有 **12 条**资源；
- 断网后 reload 成功，页面标题正常；联网态下直接访问 `?go=math` 仍有开始按钮；
- 控制台 **0 条** JS 报错。

首屏数字（本机，非 throttled）：curl 首页 `200`、`0.81s`；Playwright 里 TTFB `1064ms`、first-paint `1624ms`、load `2114ms`。所以"国内直连 0.5s"这类文案我会改成"打开即用"，不写死一个会过期的数字。

## 六、真实踩过的四个坑

**1. MediaRecorder 的 blob 时序。** 最初在 `onstop` 里延迟造 blob，结果孩子手快点了"下一句"，`e.blob` 已经被清空，回放地址指向空对象。现在注释就写在代码里：立刻 `createObjectURL`，再 `setTimeout(350ms)` 播放。异步 API 的回调里不要排长队。

**2. backdrop-filter 抢 GPU。** 部署初期大面积毛玻璃卡片在 iPad 上把首图拖到 **52.9s**，去掉后 **9.5s**（部署当天的实测记录；本次只复测了当前版本，first-paint 1.6s）。结论：装饰性 GPU 效果不要用在大面积、常驻的元素上，尤其在低端移动端。

**3. Vercel 的 alias 和 domains 是两回事。** `vercel alias set <部署URL> 域名` 只绑当次部署，下次 `--prod` 不会跟随（CLI 会警告 "assigned to this deployment only"）。正确顺序是先 alias 让域名能打开，再 `vercel domains add 你的域名 <项目名>` 把域名登记进项目，之后每次生产部署自动跟上。README 里专门写了一节。

**4. npx 缓存会残缺。** `tools/pw.js` 解析 Playwright 的顺序是：`PW_DIR` 环境变量 → 本地 `require('playwright')` → 遍历 `~/.npm/_npx/*/node_modules/playwright` 逐个 `try`。因为 `npx playwright` 中断过一次就会留下半截安装，直接 require 会报奇怪的错；逐个试并打印"这个缓存不完整，试下一个"，比让后来人猜半天强。

## 七、验证方式（不写"我觉得能跑"）

三道测试命令，依次是数据层、拼音、真实浏览器点击：

```bash
git clone https://github.com/sunshine2176/learning-desk.git
cd learning-desk
python3 -m http.server 8899 --directory web   # 另开一个终端
node tools/test-local.js                      # 数据层：出题/判分/复习/词表/导出导入
node tools/test-pinyin.js                     # 拼音：标音/选项/变调/提交/复习
BASE=http://127.0.0.1:8899 node tools/test-ui.js   # 真实浏览器点击（Playwright）
```

2026-11-09 实测结果：`test-local` 全过（ALL PASS）；`test-pinyin` **19/19**；`test-ui` 直接打线上（`BASE=https://learning.basisdiff.com`）**39/39**，覆盖"听写页没有任何判对错按钮""结果页不给对错分数""家长核对后听写行出现真实正确率""无 JS 报错"等断言。专项脚本 `check-school` / `check-parent-log` / `check-py-scope` / `check-timing` 打线上全部 PASS——这是"线上和本地一致"最硬的证据：本次还逐文件 diff 过 `sw.js`、`local.js`、`app.js`、`english.js` 等 8 个文件，与仓库完全一致。

一个已知的测试环境问题：`check-english.js` 在本机无头 Chrome 下录音用例过不去——脚本没有给浏览器上下文授 microphone 权限，点了录音后 `getUserMedia` 挂起；手动补上 `grantPermissions(['microphone'])` 后，同一线上页面录音立刻进入 `recording`（实测 `recState: 'recording'`）。所以这是测试脚本的漏配，不是线上功能坏了。

## 八、拿去用

- 只想给孩子用：打开 https://learning.basisdiff.com，iPad Safari 里"分享 → 添加到主屏幕"，之后离线可用。
- 想改词表/换教材：家长面板里直接编辑；或改 `data/dictation.json` 后 `python3 tools/gen_dict.py`，把 `sw.js` 的 `VERSION` 加一。
- 想自己部署：`cd web && vercel deploy --prod --yes`（**必须在 `web/` 里**，否则会把项目根目录传上去变成 404），再按第六节的 alias/domains 两步绑域名。
- 代码 MIT，没有埋点、没有账号、没有上传。

如果你也在给自家孩子做类似的东西，最值得抄的可能不是界面，而是这三条：**能机器判的别让孩子判，判不了的交给家长；机器不给儿童打分；把所有"必须联网"的东西先问一遍是不是本地算得出来。**
