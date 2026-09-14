# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目是什么

黑客松产品 **CampusVerse · 双界校园** 的主网页（总入口落地页）。纯静态前端：HTML5 + CSS3 + JavaScript(ES6)，**零依赖、零构建、零 CDN**，所有视觉（星空、雾团、方格纹理）均由 CSS 渐变实现，刻意不使用任何图片资源。

**范围边界**：本目录只负责主网页本身。四个功能模块（大学模拟器/情绪地图/课表排雷/日记帮写）由各组独立开发，合并部署由另一个 Agent 负责——改动时不要越界去动其他组的文件。

## 常用命令

```bash
# 本地预览：直接双击 index.html，或
python -m http.server 8000   # 然后访问 http://localhost:8000

# JS 语法检查（本项目无测试）
node --check js/config.js && node --check js/main.js

# 渲染验证/截图（当前模型无法读图，用无头浏览器+脚本断言代替目检）
agent-browser open "file:///页面路径/index.html"
agent-browser eval "getComputedStyle(document.querySelector('.x')).color"
agent-browser screenshot out.png --full
agent-browser close
```

注意：`file://` 协议下点击模块入口会弹 toast 而不是跳转（main.js 故意拦截），要验证真实跳转必须起 HTTP 服务。

## 架构与关键约定

### 核心概念：「昼夜边界」主题

整页是一条从深夜到白天的渐变：**Hero → 引言 → 平行界（模拟器）= 连成一整片的夜空**；**现实界（三工具）= 白天**；页脚回落夜色闭环。各区块背景渐变的**首末色必须精确衔接**（见 style.css 中 `.intro` 与 `.zone-parallel` 的注释），改任何一段背景都要检查上下游是否断层的跳色。

### 唯一衔接点：js/config.js

后续合并 Agent **只改这一个文件**：
- `SITE_NAME_EN/CN`、`SITE_SLOGAN` —— main.js 启动时注入到 `<title>` 和所有 `data-site-name-*` 占位元素，HTML 里的文字只是兜底，改名只改 config
- `MODULE_ENTRY` —— 四模块入口 URL；空串或 `#` = 未接入 → 点击弹 toast（设计上绝不允许死链）
- `MODULE_TARGET` —— 定稿为 `_self` 整页跳转，iframe 内嵌方案已被明确否决

### 已知合并坑（写进了 config.js 注释和设计方案第六节）

- 四个模块的 server.js 默认端口**全部是 3000**，合并时必然冲突
- 模块B（课表）和模块C（日记）当前都占用 `/tools/` 路径，合并时必须重命名；config 中的 `/tools/schedule/`、`/tools/diary/` 是为重命名预留的占位值
- 各模块根路径 `/` 目前都有 redirect，合并后应让给主网页做全站首页

### CSS 的坑

- 通用卡片样式 `.card`（白底）定义在第 8 节，位置在 `.card-feature`（深色玻璃底）**之后**——同权重后者被覆盖过（白底白字 bug 的成因）。覆盖通用 `.card` 样式必须用双类选择器（如 `.card.card-feature`）提高权重，或写在第 8 节之后
- 主题色全部走 `:root` CSS 变量（对齐各组预设框架的 `variables.css`：主色 `#4A90D9`、夜色板 `--night-*`、模块识别带 `--band-*`），新增颜色先进变量区
- 无障碍：打字机、滚动渐入、光斑动画都要尊重 `prefers-reduced-motion`（main.js 与 style.css 第 14 节各有处理，改动画时两边同步）

### main.js 结构

单个 IIFE，按编号分六段：站点名注入 → 打字机 → 导航滚动态（`.nav-scrolled` 阈值 scrollY>40）→ IntersectionObserver 滚动渐入（`.reveal`→`.in`）→ toast（单例 `#toast` + 定时器）→ 入口按钮（`data-module` 属性对应 `MODULE_ENTRY` 的 key）。

## 决策记录（勿反复）

产品名、双分支结构（平行界大卡片 + 现实界三卡）、跳转式衔接、标语打字机、零图片素材——均已与用户逐条确认定稿，见 `主网页设计方案.md` 第九节清单。视觉细节（具体颜色、间距、文案）仍可迭代。
