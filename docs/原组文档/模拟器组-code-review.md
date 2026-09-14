# 代码审查报告（max 级）— 2026-09-12

> 审查对象：`c465810 feat: 合并队友修改 - 完整小游戏系统+场景图+多项优化`
> 审查方式：多代理并行审查 + 逐条对抗验证，共确认 **16 个问题**（均已验证，非误报）。
> 级别标记：🔥 演示灾难级（必修）｜⚠️ 机制硬伤｜⚡ 竞态炸弹｜🖥️ 服务端

---

## 🔥 演示灾难级（3 个）

### 1. typewrite() 差一错误：所有打字机文本丢失最后一个字符

- **位置**：`main/simulator/js/app.js:222`
- **现象**：所有超过 20 字的 AI 场景/反馈/开场/闭幕文本渲染时都缺最后一个字；点击跳过时定格在残缺前缀。影响所有调用点（app.js:435/616/676/681/751/1040），只有 ≤20 字走 innerHTML 路径的文本完整。
- **根因**：tick 守卫 `if (i >= text.length)` 在追加最后一个字符之前一 tick 就触发 `done()`，且 `done()` 从未回填完整文本。
- **修法**：改为 `if (i > text.length)`，并在 `done()` 里设置完整文本。
- **状态**：✅ 已修复（2026-09-12）

### 2. hardReset() 未清空姓名输入，「再来一次」流程死胡同

- **位置**：`main/simulator/js/app.js:148`
- **现象**：通关后点「再来一次」→ 创建页显示「已填写姓名：<旧名>」但没有输入框 → 点「开启大学生活」提示"请填写姓名"却无法输入；退回欢迎页，输入框仍显示旧名字，btn-start 抛「请先填写姓名」——唯一出路是乱敲键盘触发 input 事件。
- **根因**：`hardReset()` 清了内存变量 `welcomeName`，但没清 `#inp-welcome-name` 的 value 和 `#display-welcome-name` 显示区；且 `btn-again` 路由到的创建页已无姓名字段。
- **附带问题**：配套回归测试 `dev-browser-restart-test.js` 仍引用已删除的 `#inp-name` id，断言从未真正执行；失败路径不清理，会泄漏占用 9333 端口的 Edge 实例。
- **修法**：hardReset 中清空输入框与显示区。
- **状态**：✅ 已修复（2026-09-12）

### 3. AI 调用链两跳均无超时，连接挂起会永久卡死游戏

- **位置**：`main/common/js/ai-proxy.js:13`（callAI）、`:84`（callAIStream）、`main/server.js:30`（上游 fetch）
- **现象**：上游接受连接后不响应时，`await generateEventSafe()` 永远停在「AI 正在构思剧情……」（兜底只在 reject 时触发，挂起不会 reject）；且挂起的预加载 `.finally`（game-engine.js:604）永不执行，`isPreloading` 恒为 true，本局后续所有预加载全部短路。
- **修法**：两处 fetch 加 `AbortSignal.timeout()`。
- **状态**：✅ 已修复（2026-09-12）

---

## ⚠️ 游戏机制硬伤（6 个）

### 4. 「全勤毕业」成就是在任何触发过小游戏的局里数学上不可达

- **位置**：`main/simulator/js/game-engine.js:624`
- **现象**：小游戏节点消耗 48 格时钟（经 proceedAfterChoice → advanceClock）但从不调用 `recordChoice`，choices 只能由 chooseOption（app.js:666）/submitCustom（app.js:736）写入，故 `h.choices.length >= 48` 永不成立。同一缺口让危机/巅峰时刻从学期回顾（app.js:868）、回忆手账最佳选择（app.js:1054）、分享文本、MBTI 证据提示词（ai-service.js:1530）中静默消失——而其属性影响已生效。
- **修法**：`finishMiniGame` 里补 `recordChoice`。

### 5. 8 个小游戏里 4 个的完美限定 buff 不可达

- **位置**：`main/simulator/js/mini-games.js:182`
- **现象**：
  - 蛋糕绕过 `finishMiniGame` 的 `unlockBuff` 唯一调用点 → 「宿舍团宠」及其 1.5× 社交加成是死代码；
  - 晨跑分数上限 40+7×5=75（:414/:435）、困意抵抗 ~88（:567/:594），均 <90 门槛 → energy_master / tough_body 永不解锁；
  - 情绪疏导期望 ~54 分（:676），≥90 需 14 球中 13 负（概率 ~0.03%）→ self_heal 实质不可得。
- **修法**：重调分数上限/门槛，蛋糕改走 `finishMiniGame`。

### 6. 蛋糕游戏可被 × 键双重结算

- **位置**：`main/simulator/js/mini-games.js:159`
- **现象**：`showDormResult()` 结算时未设 `mg.finished`，结算面板显示后键盘 Tab+Enter 仍可聚焦 × → `finishMiniGame(0)` 按 fail 档二次结算 `applyEffects({social:-4})`，「完美出炉！」被替换成「状况百出……」。其余 7 个游戏都有守卫，唯蛋糕绕过。
- **修法**：`settle()` 里设 `mg.finished`/`mg.active`。

### 7. 蛋糕四维属性条与分层视觉从未挂载（半移植）

- **位置**：`main/simulator/js/mini-games.js:286`
- **现象**：`statMini()`（:286）与 `cakeLayers()`（:292）只有定义、零调用点（grep 确认）；`refreshBars()`（:278-285）对从未渲染的 `.dcake-stat` 做 querySelector，且样式表里也没有 `.dcake-*` 规则 → 整个游戏缺失实时属性面板与随步骤生长的蛋糕视觉，DOM 和 CSS 双缺失所以不报错、功能静默蒸发。
- **修法**：`startCake` 里把 statMini/cakeLayers 渲染进舞台并补 CSS，或删掉半移植 UI。

### 8. pickDestination 海外深造分支漏掉心态守卫

- **位置**：`main/simulator/js/game-engine.js:183`
- **现象**：`s > 80 && e > 60`（海外深造）是唯一无心态校验的高分分支，且排在 :188 `m < 40 || s < 40 → 休整` 兜底之前。学业 85/精力 65/心态 8（<10 说明情绪危机已触发）→ 毕业报告庆祝「申请到海外高校深造」，绕过注释声称要防的「心态跌破可用线」。自带 dev-destination-test.js 向量最坏情况 s=70，从未覆盖该组合。
- **修法**：:183 补 `m > 60`（对齐考研上岸），或将低属性守卫提到最前。

### 9. 特殊事件惩罚入存档、事件本体不入档

- **位置**：`main/simulator/js/app.js:519`
- **现象**：`maybeTriggerSpecial` 的冷却 markSpecialUsed、firstReached、-15 社交巅峰衰减会被 chooseOption 的 saveGame（:684）持久化，但待触发 special 只存内存，`finishMiniGame` 从不 saveGame。玩家触发危机后刷新/读档：冷却已恢复而 canUse（game-engine.js:424）拒绝重发——本学期危机永不播放、惩罚已生效；小游戏结算后关标签页丢属性奖励和已解锁 buff；第 48 节点 isFinished()（app.js:815）先于消费 special，-15 已写进毕业报告。
- **修法**：序列化 pendingSpecial、`finishMiniGame` 里 `saveGame()`、在 isFinished 检查前消费/丢弃 special。

---

## ⚡ 竞态炸弹（6 个）

### 10. 在途预加载事件污染新局队列

- **位置**：`main/simulator/js/game-engine.js:598`
- **现象**：特殊事件清空队列（app.js:528）时上一轮 `generateEvent` 仍在途；resolve 后带着危机前的情境文案 push 进**新** eventQueue，`_genSemester` 在 resolve 时盖新局学期的章、躲过驱逐过滤器——重开游戏后上一局的场景在新局播放，id 还与 eventSeq 冲突；其 `.finally` 还会误清新预加载的 isPreloading，放行第三次并发生成。
- **修法**：预加载开始时捕获 epoch 计数，`.then`/`.finally` 里校验。

### 11. 迟到的 AI 反馈写进下一个事件

- **位置**：`main/simulator/js/app.js:677`
- **现象**：`generateFeedback` 的 `.then` 在 `currentEvent === eventRef` 守卫**之外**写 `last.feedback = fb` 进 history；`.catch`（:681）完全无守卫。玩家在 N 的反馈返回前进入并答完 N+1：N 的叙事写进 N+1 的 history 记录（随存档进毕业报告）；N 的慢速失败回调把兜底文案覆盖到 N+1 刚渲染的结果面板。
- **修法**：两个回调开头 `currentEvent !== eventRef` 即 return。

### 12. plannedCategory 全局变量并发互踩

- **位置**：`main/simulator/js/ai-service.js:186`
- **现象**：`generateEvent()` 把引擎分配好的类别存进模块级全局 `plannedCategory`（:186），兜底 `getDefaultEvent()`（:951）在 await 之后读取。isPreloading 只护预加载路径，开局/队列空时 enterEvent 直调 `generateEventSafe`（app.js:583）无保护：G1（计划类别 A）解析失败后按 G2 的类别 B 建兜底 → A 永久少一次配额、B 多一次，界面类别标注（app.js:604）也错。
- **修法**：category 作为参数显式传给 `getDefaultEvent`。

### 13. takeCategory 游标丢弃后不回卷，配额分布漂移

- **位置**：`main/simulator/js/game-engine.js:208`
- **现象**：`takeCategory()` 在生成时推进 planCursor，但缓存的预加载事件后来被丢弃（特殊事件冲刷 app.js:528、学期驱逐 app.js:570）时游标不回卷 → 48 事件的 8/8/8/8/8/8 精确分布逐渐漂移，某些类别系统性偏少——正是配额系统要修的「AI 偏科」问题。dev-category-test.js 只验证计划数组、从不验证实际出流，测试恒绿。
- **修法**：两处丢弃点按丢弃数量回卷 planCursor。

### 14. 小游戏结束后不预加载 → 必现转圈等待

- **位置**：`main/simulator/js/app.js:638`
- **现象**：`renderEvent` 的 `_miniGame` 分支在 `preloadNextEvent()`（:643）之前提前 return，注释承诺的「完成后再预加载下一事件」从未实现；而 `maybeTriggerSpecial`（:528）刚清空队列、`chooseOption`（:671）又刻意不补队列。每次学期中危机/巅峰结束：玩家关闭结算面板后 `hasReadyEvent()` 为 false，落入阻塞式 `await generateEventSafe()`——预加载管线本应掩盖的转圈等待在特殊事件后精准回归（只有学期边界的特殊事件被总结页 :935 的预加载救回）。
- **修法**：`closeMiniGame()` 里调 `preloadNextEvent()`。

### 15. secondPersonGuard 姓名误替换（两字名中招）

- **位置**：`main/simulator/js/ai-service.js:74`
- **现象**：对玩家自由文本姓名做盲目 split/join 替换。注释承诺「两字以内不做替换」但代码只跳过 `name.length < 2`。已验证复现：名「小王」→「小王正在喝水」变「你正在喝水」；名「一诺」→「一诺千金」变「你千金」。该守卫作用于开场/场景/反馈/自定义裁决/流式总结/MBTI/去向/闭幕——一个 unlucky 名字污染所有屏幕。次要问题：:73 裸读 `gameState` 使独立 dev 脚本（dev-custom-judge-test.js 的 vm 环境）ReferenceError，且服务宕机时兜底打印「放行 9/9」假通过。
- **修法**：`length >= 3` 才替换 + 边界感知 + `typeof gameState` 守卫。

---

## 🖥️ 服务端（1 个）

### 16. SSE 中继断连不中止

- **位置**：`main/server.js:63`
- **现象**：`for await (const chunk of upstream.body) res.write(chunk)` 无 `req.on('close')` 中止、无 res error 监听。玩家在学期总结流式生成中刷新/重开：浏览器已断开但循环继续把 MIMO 整个补全拉完（白烧计费 token）、向已销毁的 ServerResponse 写入；async ERR_STREAM_DESTROYED 无监听器，可能以未捕获异常击穿整个开发服务器，殃及其他标签页。
- **修法**：AbortController 接 req 'close' + `res.on('error')`。

---

## 🧹 清理项（验证过但未计入 16 条）

| 问题 | 位置 | 说明 |
|------|------|------|
| CSS 整段重复 | `main/simulator/css/sim-style.css` | 小游戏样式表被完整追加两遍（~650 行重复、246 个选择器定义 ≥2 次，前一份是死的）；改上半部分无效；~70 个 `.cake-*` 僵尸选择器 |
| 备份文件进仓库 | `main/simulator/bak_*`、`bak_stream_*`、`*.bak` | ~13,000 行；`.gitignore` 只加了 `backups/`，一个都没盖住 |
| 文档命令失效 | `CLAUDE.md` / `main/README.md` | `node dev-balance-test.js` → MODULE_NOT_FOUND；`cd tools/scripts` → ENOENT；`dev-effects-probe.js:33` 未闭合字符串过不了 `node --check`；无任何 cwd 能跑 dev-stat-balance-test.js |
| CLAUDE.md 变英文 | `CLAUDE.md` | 违反全局「使用中文」规则，且未收录 mini-games.js |
| 死代码链 | `app.js:531`、`ai-service.js:986-1156` | ~170 行旧 AI 特殊事件链未删；阈值与文档漂移（代码 ≥90 vs 文档 >95；危机「恢复选项」设计 vs -4 失败惩罚） |
| 隐藏属性漂移 | `game-engine.js:295` | applyEffects 子属性按钳制前 delta 缩放，长期与主属性脱钩 |
| 去重缓存跨局残留 | `ai-service.js:285/333` | recentSceneHints/_recentImages 模块级缓存不随 hardReset/newGame 清空，第二局继承第一局的避重状态 |
| ≤20 字 innerHTML 路径 | `app.js:212` | 可渲染回显的玩家标记（PLAUSIBLE 级自我 XSS，本地单机游戏风险低） |

## ✅ 已排除的嫌疑

- **`.env` 静态路由泄露**：`express.static(__dirname)` 对 `/.env` 实测返回 **404**（serve-static 默认 `dotfiles: 'ignore'`），无泄露，不用修。

---

## 修复进度

| # | 问题 | 状态 |
|---|------|------|
| 1 | typewrite 差一错误 | ✅ 已修复 |
| 2 | hardReset 重开死胡同 | ✅ 已修复 |
| 3 | AI 调用链无超时 | ✅ 已修复 |
| 4-16 | 其余问题 | ⏳ 待排期 |

---

## 附：录取通知书页 UI 修复（2026-09-12 深夜，用户实测反馈）

| 问题 | 处理 | 状态 |
|------|------|------|
| 姓名占位文案统一为「写下你的姓名」 | index.html placeholder 修改 | ✅ |
| 「九月」在虚线上右偏约一个字宽 | 根因：`.notice-line` 的 `text-indent: 2em` 被 `.blank` 行内框继承，`.blank` 中归零并收紧行高 | ✅ 实测通过 |
| 姓名输入框下半部显示不全 | 尝试加大 `.notice-line` 行高至 2.15 后仍未彻底解决，时间原因暂缓 | ⏸️ 已知未修（遗留） |

> 静态资源版本号已升至 `sim-style.css?v=8 / app.js?v=7 / ai-proxy.js?v=3`，浏览器自动加载新代码。
