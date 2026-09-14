# 🎓 AI 校园工具集合 - 情绪地图模块

> 黑客松项目 · 模块 B · 个人工具

## 📋 项目简介

这是一个基于 AI 的校园情绪记录工具，核心功能是**校园情绪地图**。用户可以在虚拟校园地图上标记自己的情绪状态，形成情绪热力图，并通过 AI 生成情绪日/周总结。

### 🌟 核心功能

| 功能 | 说明 |
|------|------|
| 🗺️ **情绪地图** | 2D 校园俯视图，点击地点记录情绪，地图显示情绪热力 |
| 📍 **自定义地点** | 添加、编辑、删除自定义地点，拖拽调整位置 |
| 📊 **情绪回忆录** | AI 生成日总结和周总结，包含数据分析和趣味建议 |
| 🎭 **情绪表情墙** | 用表情符号拼成视觉化的情绪统计墙 |
| 🏆 **成就系统** | 解锁各种成就徽章，增加趣味性 |
| 🕐 **情绪时间轴** | 像朋友圈一样浏览历史情绪记录 |

### 😊 情绪等级

| 等级 | 表情 | 颜色 | 天气 |
|------|------|------|------|
| 5 | 😊 开心 | 绿色 | ☀️ 晴天 |
| 4 | 😌 平静 | 蓝色 | ⛅ 多云 |
| 3 | 😐 一般 | 黄色 | 🌤️ 少云 |
| 2 | 😟 焦虑 | 橙色 | 🌧️ 雨天 |
| 1 | 😢 低落 | 红色 | ⛈️ 暴风雨 |

## 🚀 快速开始

### 环境要求

- Node.js v16+
- npm 或 yarn

### 安装与运行

```bash
# 1. 进入项目根目录
cd 黑客松

# 2. 安装依赖
npm install

# 3. 启动服务器
npm start
```

### 访问地址

- 首页: http://localhost:3000
- **情绪地图模块**: http://localhost:3000/tools/emotion/

## 📁 项目结构

```
黑客松/
├── package.json              # 依赖管理
├── server.js                 # 后端代理服务器
├── .env                      # 环境变量（API Key）
├── README.md                 # 项目说明
│
├── common/                   # 公共资源
│   ├── css/
│   │   ├── variables.css     # 全局设计变量
│   │   └── components.css    # 公共组件样式
│   └── js/
│       ├── utils.js          # 工具函数（StorageManager 等）
│       └── ai-proxy.js       # AI 调用封装
│
└── tools/
    └── emotion/              # 情绪地图模块
        ├── index.html        # 主页面
        ├── css/
        │   └── emotion-style.css  # 专用样式
        └── js/
            ├── app.js                # 主逻辑入口
            ├── map.js                # 校园地图渲染
            ├── emotion-recorder.js   # 情绪记录面板
            ├── location-manager.js   # 地点管理
            ├── diary.js              # 情绪回忆录（日/周总结）
            ├── charts.js             # 数据可视化
            ├── timeline.js           # 情绪时间轴
            ├── expression-wall.js    # 情绪表情墙
            └── achievements.js       # 成就系统
```

## 🔧 技术栈

- **前端**: HTML5 + CSS3 + JavaScript (ES6)
- **后端**: Node.js + Express
- **AI**: MIMO AI (mimo-v2.5 模型)
- **存储**: LocalStorage

## 🎨 设计规范

- 使用全局 CSS 变量（`variables.css`）
- 遵循公共组件样式（`components.css`）
- 图片加载失败使用 CSS 渐变兜底
- 响应式设计，支持移动端

## 📝 开发规范

- ES6+ 语法（const/let、箭头函数、async/await）
- 驼峰式命名（camelCase）
- 每个函数不超过 50 行
- AI 调用通过后端代理，不暴露 API Key
- JSON 数据使用 `parseAiJson()` 清洗

## 👥 团队分工

| 成员 | 负责模块 |
|------|----------|
| 严锦程 | 课表分析模块 + 后端搭建 |
| 章晗植 | 日记模块 + AI 提示词优化 |
| 洪宇佟 | 情绪模块 + 数据可视化 |

## 📄 License

MIT
