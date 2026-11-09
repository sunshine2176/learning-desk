# A zero-backend learning app for my second-grader

My son is in second grade in China. Every practice app we tried charged a subscription, ran ads, or shipped his data to a cloud. So I built a small PWA instead: MIT-licensed at [sunshine2176/learning-desk](https://github.com/sunshine2176/learning-desk), running at https://learning.basisdiff.com.

No server, no account, no API cost.

## Why no backend is not a compromise

- **Quiz generation is rule evaluation.** Math problems are built on the spot in `web/local.js` by `genMath(count, level)`, composing `genAddSub`, `genMul`, `genDiv`, `genMulAdd` and `genMoney`. Dictation and pinyin draw from 239 words (8 textbook units) and 302 pinyin entries in `data/`.
- **Grading is comparison.** Arithmetic is one line: `String(it.answer) === m.given`. Pinyin is an option-index check: `i === q.ans`.
- **Spaced repetition is local date arithmetic.** `const STAGES = [1, 3, 7, 15, 30]` plus `addDays(dayStr, n)` using `new Date(dayStr + 'T00:00:00')`. No cron, no queue, no timezone service.

The data layer exposes `api(path)` / `post(path, body)` with the old server's signatures, so cloud sync later would replace one file and nothing in `app.js`.

## Three counterintuitive decisions

**1. The kid is never asked whether he was right.** Dictation has two buttons: "done, next" and "don't know, skip". "Done" is stored as a neutral record (`ok: null`); "don't know" enters the mistake pool. The result page never shows a score. A parent checks the paper notebook afterwards (`markLastWord`), and only then does dictation count toward accuracy. Letting a child grade himself optimizes for finishing fast, not for learning.

**2. No ASR scoring for English speaking.** The loop is: hear the native TTS sentence, record yourself with `MediaRecorder`, play it back next to the original, then self-assess. Pronunciation scores are brutal on children; one "not standard" ends the willingness to speak. Devices without `MediaRecorder` degrade gracefully.

**3. Pinyin distractors are generated, not random.** For the "medial" drill (kids say *bān* for *biān*, dropping the glide), wrong answers remove the medial: `iang/uang → ang`, then `uan/ian → an`, long finals first. j/q/x words are excluded because *qan* is not a valid syllable. 34 textbook words qualify.

## The math behind the review queue

The pool is weighted by memory strength (`memWeights()`): unmastered mistakes `[12, 8, 5, 3, 2]` by stage (+4 if overdue); a wrong last answer 12; a correct one 7/5/3/2/1 by days elapsed; never practiced 5; mastered 1 (floor 0.3). Sampling is weighted without replacement.

A wrong answer resets the stage and schedules tomorrow. A correct answer advances the stage, scheduling 1/3/7/15/30 days out; five consecutive correct answers mark the item mastered, but its weight stays at 1 so it occasionally reappears. Measured with `tools/check-srs.js` (8 runs of 6 questions): recently wrong words appeared 0.9–1.5 times per run; words last correct a month ago, 0.0–0.1.

## PWA and offline

`web/sw.js` is 53 lines: precache 12 static assets under `desk-v15`, `skipWaiting()` on install, delete old caches and `clients.claim()` on activate, then serve cache-first with a background refresh. Audio is not precached; each file is cached after its first play (287 files, 3.2MB). `web/vercel.json` serves `/sw.js` with `no-store`, and any JS change bumps `VERSION`.

Verified against production: the worker reaches `activated`, `desk-v15` holds 12 entries, a reload with the network disabled still renders the app, `/?go=math` still shows the start button, and the console stays clean.

## Four things that bit me

1. **MediaRecorder blob timing.** Building the blob lazily lost the recording when a child tapped "next" too fast. Create the object URL immediately in `onstop`, then play it 350ms later.
2. **`backdrop-filter` on large surfaces.** Frosted cards pushed the first render to 52.9s on an iPad; removing them brought it to 9.5s (deployment-day measurement). Decorative GPU effects do not belong on large persistent surfaces.
3. **`vercel alias` is not `vercel domains`.** An alias binds only to that deployment; the next `--prod` does not follow it. Run `alias set` first so the domain is reachable, then `vercel domains add <domain> <project>` so future deployments inherit it.
4. **Incomplete npx caches.** `tools/pw.js` tries `PW_DIR`, local `require`, then each `~/.npm/_npx/*/node_modules/playwright`, skipping broken half-installs.

## Test evidence

`tools/test-local.js` passes; `test-pinyin.js` 19/19; `BASE=https://learning.basisdiff.com node tools/test-ui.js` 39/39 in a real browser against production, including that dictation has no self-grading buttons and a parent must check the notebook before it counts.

The transferable lesson is not the UI: let machines grade what they can, hand the rest to a parent, never score a child's pronunciation, and ask of every "must be online" feature whether it is actually local arithmetic.
