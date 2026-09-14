# AGENTS.md — 日记帮写项目代理指引

## 项目概述

日记帮写（aigc-campus-tools）是一个 AI 驱动的日记生成 Web 应用。用户通过多轮对话选择心情天气、写作风格，分享事件与感受，最终由 AI 生成一篇温馨日记。技术栈为纯 JavaScript（无框架），前后端通过 Express 或 Vercel Serverless 部署。

## 目录结构

```
├── tools/                  # 前端工具模块（日记帮写主界面）
│   ├── index.html          # 页面入口
│   ├── js/
│   │   ├── app.js          # 主逻辑入口：交互绑定、状态管理
│   │   └── modules/
│   │       ├── weather.js  # 天气背景与粒子特效
│   │       ├── audio.js    # BGM 与环境音管理
│   │       └── diary.js    # 核心业务：多轮对话、日记生成
│   ├── css/
│   │   └── tool-style.css  # 工具页面样式
│   └── assets/
│       └── audio/          # 天气环境音与 BGM 音频文件
├── common/                 # 跨工具共享模块
│   ├── js/
│   │   ├── ai-proxy.js    # AI 接口调用封装 + 系统提示词
│   │   └── utils.js       # 通用工具：存储、日志、日期、Toast
│   └── css/
│       ├── variables.css   # CSS 变量
│       └── components.css  # 通用组件样式
├── api/
│   └── chat.js            # Vercel Serverless AI 代理函数
├── server.js              # Express 本地服务 + AI 代理接口
└── .env                   # 环境变量（AI_BASE_URL, MIMO_API_KEY 等）
```

## 核心文件职责

### tools/js/app.js — 前端主入口

- 初始化页面，绑定 DOM 事件（发送按钮、输入框回车、下载按钮、新日记按钮）
- 管理天气预览状态：悬停 0.5s 防抖触发天气切换，双击确认选择
- 协调各管理器：调用 `WeatherManager`、`AudioManager`、`DiaryManager`
- 处理 UI 渲染：消息气泡、AI 回复、选项卡片、进度条、日记展示
- **全局函数**：`handleOptionSelect()` 包含第 1 轮天气双击确认逻辑

### tools/js/modules/weather.js — 天气系统

- 导出全局对象 `WeatherManager`，管理 5 种天气：sunny / cloudy / rainy / stormy / rainbow
- 负责：DOM 粒子创建（雨丝、云朵、光点）、太阳/小鸟/闪电/水洼涟漪特效
- 通过 `document.body.className` 切换天气背景色
- 天气切换时联动调用 `AudioManager.setAmbientSound()`
- 自初始化：`DOMContentLoaded` 时调用 `WeatherManager.init()`

### tools/js/modules/audio.js — 音频系统

- 导出全局对象 `AudioManager`，管理 BGM 和环境音两套音频
- BGM（bgm.ogg）：仅在雨后彩虹（rainbow）天气和日记生成后播放
- 环境音：每种天气对应独立 wav 文件，天气切换时自动更换
- 用户交互前不播放任何音频（浏览器自动播放策略）
- 音量面板：BGM / 环境音独立滑块控制
- 自初始化：`DOMContentLoaded` 时调用 `AudioManager.init()`

### tools/js/modules/diary.js — 日记核心业务

- 导出全局对象 `DiaryManager`，控制多轮对话流程和日记生成
- 对话流程：第 1 轮天气选择 → 第 2 轮风格选择 → 第 3-6 轮灵活追问 → 日记生成
- 灵活追问：按事件→情绪→感悟三要素逐步提取，动态生成选项
- 进度条：5 个阶段（天气 15% / 风格 15% / 事件 25% / 情感 25% / 感悟 20%）
- 日记生成后保存至 `localStorage`（通过 `StorageManager`），支持 Markdown 下载
- 自初始化：`DOMContentLoaded` 时调用 `DiaryManager.init()`

### common/js/ai-proxy.js — AI 代理客户端

- 导出全局函数 `callAI(messages, options)` — 通过后端代理 `/api/chat` 调用 AI
- 导出全局函数 `parseAiJson(rawText, fallback)` — 解析 AI 返回的 JSON（含 Markdown 标记清洗）
- 导出全局函数 `getDiarySystemPrompt()` — 构建"小度"角色的系统提示词
- **不直接调用外部 API**，所有请求经后端代理转发以保护 API Key

### common/js/utils.js — 通用工具

- `StorageManager` — LocalStorage 封装，统一前缀 `tools_`
- `Logger` — 彩色控制台日志（INFO / SUCCESS / WARN / ERROR）
- `DateUtils` — 日期格式化（YYYY-MM-DD / HH:MM / 友好日期）
- `showToast()` — 轻量 Toast 提示
- `debounce()` / `throttle()` — 防抖节流工具

### server.js — 本地 Express 服务

- 静态文件服务：`express.static(__dirname)` 托管整个项目目录
- AI 代理接口 `POST /api/chat`：读取 `.env` 环境变量，转发至外部 AI API
- 根路由 `/` 重定向至 `/tools/`
- 端口：`process.env.PORT || 3000`

### api/chat.js — Vercel Serverless 函数

- 与 `server.js` 中 `/api/chat` 逻辑一致，专为 Vercel 部署设计
- 仅允许 POST 方法，缺少 API Key 时抛出错误

## 模块边界

### 天气系统（WeatherManager）

| 项目 | 说明 |
|------|------|
| 拥有文件 | `tools/js/modules/weather.js` |
| 对外接口 | `WeatherManager.setWeather(type)` / `.clearAll()` / `.setWeatherByMood()` |
| 依赖 | `AudioManager`（切换天气时联动环境音） |
| 被依赖 | `app.js`（预览和确认）、`diary.js`（日记生成后设置天气） |
| 边界约定 | 天气类型仅限 `sunny/cloudy/rainy/stormy/rainbow` 五种；新增天气需同步更新 `weatherConfig`、`AudioManager.ambientSounds`、CSS 类名 |

### 音频系统（AudioManager）

| 项目 | 说明 |
|------|------|
| 拥有文件 | `tools/js/modules/audio.js` |
| 对外接口 | `.enableBgm()` / `.disableBgm()` / `.setAmbientSound(weather)` / `.pauseAmbient()` |
| 依赖 | `WeatherManager`（读取当前天气状态） |
| 被依赖 | `app.js`（预览/确认时控制 BGM）、`weather.js`（天气切换联动环境音） |
| 边界约定 | BGM 仅在 rainbow 天气和日记展示时播放；环境音文件路径为 `/tools/assets/audio/{weather}.wav`；新增天气需同步添加音频文件 |

### AI 代理（callAI / server 代理）

| 项目 | 说明 |
|------|------|
| 拥有文件 | `common/js/ai-proxy.js`（客户端）、`server.js` + `api/chat.js`（服务端代理） |
| 对外接口 | `callAI(messages, options)` — 前端唯一 AI 调用入口 |
| 依赖 | 后端 `/api/chat` 接口、`.env` 环境变量（`AI_BASE_URL`、`MIMO_API_KEY`、`AI_MODEL`） |
| 被依赖 | `diary.js`（对话和日记生成均通过 `callAI`） |
| 边界约定 | 前端不直接持有 API Key；`server.js` 和 `api/chat.js` 逻辑需保持同步；系统提示词由 `getDiarySystemPrompt()` 统一管理 |

## 变更注意事项

### 跨模块联动

- **新增天气类型**：需同步修改 `weather.js`（weatherConfig + 粒子方法）、`audio.js`（ambientSounds 映射）、CSS（背景类名 + 粒子样式）、音频资源文件，以及 `diary.js` 中的 `round1Options`
- **修改对话流程**：主要改动在 `diary.js` 的 `getRoundPrompt()`、`parseAIResponse()`、`generateFlexibleOptions()`；`app.js` 中的 `handleOptionSelect()` 可能需要同步调整
- **修改 AI 模型或提示词**：系统提示词在 `ai-proxy.js` 的 `getDiarySystemPrompt()`；模型配置在服务端代理（`server.js` + `api/chat.js` 两处需同步）

### 初始化顺序

各模块通过 `DOMContentLoaded` 自初始化，顺序取决于 `<script>` 标签加载顺序（`index.html` 中定义）。`app.js` 的 `DOMContentLoaded` 中调用 `startNewConversation()`，此时需确保 `DiaryManager`、`WeatherManager`、`AudioManager` 均已初始化。

### 部署双轨

- **本地开发**：`npm run dev` 启动 `server.js`（Express），AI 请求走 `/api/chat`
- **Vercel 部署**：AI 请求走 `api/chat.js`（Serverless Function），`vercel.json` 配置路由重写
- 修改 AI 代理逻辑时，`server.js` 和 `api/chat.js` 必须同步更新

### 全局对象

项目使用全局对象模式（`WeatherManager`、`AudioManager`、`DiaryManager`、`StorageManager`、`Logger`、`DateUtils`），无模块化隔离。新增全局函数或对象时需注意命名冲突。

### 音频资源

- 环境音文件位于 `tools/assets/audio/`，每种天气一个 `.wav` 文件
- BGM 为 `tools/assets/audio/bgm.ogg`
- 根目录下的同名 `.wav` 文件为历史遗留，非运行时使用
