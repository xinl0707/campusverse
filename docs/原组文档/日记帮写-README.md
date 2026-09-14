# 📝 日记帮写 - AI 驱动的个人日记工具

> **模块**：模块 B · 个人工具  
> **负责人**：严锦程、章晗植、洪宇佟  
> **技术栈**：HTML5 + CSS3 + JavaScript(ES6) + Node.js + MIMO AI (mimo-v2.5)

---

##  快速开始

### 环境准备

```bash
# 确保 Node.js v16+ 已安装
node -v

# 进入项目目录
cd 日记帮写

# 安装依赖
npm install
```

### 启动服务

```bash
# 启动后端服务器
npm start

# 浏览器访问
# http://localhost:3000/tools/
```

---

## ✨ 核心功能

### 1. 天气心情选择
- 5 种动态天气背景（晴朗/多云/小雨/暴风雨/雨后彩虹）
- 每种天气对应专属环境音效
- 彩虹天气触发 BGM 播放

### 2. AI 多轮对话
- **小度 Agent**：温柔体贴的对话引导者，负责收集素材
- **阿露 Agent**：才华横溢的写作专家，负责撰写日记
- 最少 3 轮、最多 6 轮智能追问
- 提取情绪/事件/感悟三要素

### 3. 五种写作风格
- 🌿 文艺清新：诗意语言，比喻拟人
- 😄 幽默风趣：轻松调侃，自嘲叙述
-  哲理深沉：从日常提炼思考
- 🌸 温暖治愈：温柔鼓励，给人力量
- ✏️ 简约克制：短句为主，留白多

### 4. 日记生成与展示
- 自动生成 800-1000 字个性化日记
- 粉色进度条显示阿露写作过程
- 支持下载（.txt 格式）和分享（独立 HTML 文件）

### 5. 历史回看与管理
- localStorage 持久化存储
- 完整日期格式显示（YYYY 年 M 月 D 日）
- 点击查看时自动切换对应天气背景
- 支持删除和分享单篇日记

### 6. 日记范本上传
- 用户上传自己的日记文本（.txt/.md）
- 阿露参考范本风格进行撰写
- localStorage 存储，随时可更换

---

## 📁 项目结构

```
日记帮写/
├── package.json          # 依赖管理
├── server.js             # 核心后端（AI 代理 + 静态服务）
├── .env                  # API Key 等敏感信息
├── README.md             # 本文件
│
├── common/               # 公共资源（与模拟器组共用）
│   ├── css/
│   │   ├── variables.css # 全局设计变量
│   │   ── components.css # UI 组件库
│   └── js/
│       ├── utils.js      # 通用工具（日志/格式化/LocalStorage）
│       ├── ai-proxy.js   # 统一 AI 调用封装
│       └── agents/
│           └── alu-agent.js # 阿露写作智能体配置
│
└── tools/                # 工具箱专用
    ├── index.html        # 工具主页面
    ├── css/
    │   └── tool-style.css # 工具专用样式（含天气粒子特效）
    ├── js/
    │   ├── app.js        # 主逻辑入口
    │   └── modules/
    │       ├── diary.js  # 日记业务逻辑
    │       ├── history.js # 历史记录管理
    │       ├── weather.js # 天气粒子特效系统
    │       ├── audio.js  # 音频管理系统
    │       └── workflow.js # 对话工作流引擎
    └── assets/
        ── audio/        # 环境音/BGM 资源
```

---

##  技术实现

### AI 接口配置

| 配置项 | 值 |
|--------|-----|
| **API Key** | `sk-ccgd95ipyzhm1z5zak1lk23byp9w8qm615a0cgaz8ywigdhw` |
| **Base URL** | `https://api.xiaomimimo.com/v1` |
| **Model** | `mimo-v2.5` |

### 双 Agent 协作架构

**小度 Agent**（[`common/js/ai-proxy.js`](common/js/ai-proxy.js)）：
- 角色：对话引导者，素材收集者
- 职责：聊天了解用户今天的情绪和经历
- 身份约束：明确叫"小度"，不是阿露

**阿露 Agent**（[`common/js/agents/alu-agent.js`](common/js/agents/alu-agent.js)）：
- 角色：写作专家
- 职责：接收素材后始终生成日记（不足时写短篇 300-500 字）
- 质量检查：具体场景、真实感受、风格匹配、印象深刻细节

### 数据存储方案

使用 `StorageManager`（带 `tools_` 前缀）：

```javascript
// 日记数据
{
  type: 'diary',
  title: '日记标题',
  content: '日记正文...',
  mood: 'positive/neutral/negative',
  weather: 'sunny/cloudy/rainy/stormy/rainbow',
  tags: ['标签1', '标签2'],
  date: '2026-09-12',
  createdAt: Date.now()
}

// 范本数据
StorageManager.save('diaryTemplate', content)
```

### 天气粒子特效系统

- **晴天**：放射光芒太阳 + 白色小鸟扇翅飞行
- **多云**：大小云混合飘动（5-8 大云 + 10-15 小云）
- **小雨**：60 条斜线短雨丝全屏随机分布
- **暴风雨**：100 个大颗粒雨滴 + 闪电效果（6-15 秒间隔）
- **彩虹**：彩色渐变背景 + BGM

---

## 🎨 设计规范说明

### CSS 变量使用

本项目遵循框架规范，引入了全局 CSS 变量（`variables.css`），但**日记展示和阿露品牌色使用了自定义粉色主题**：

```css
/* 阿露品牌色（粉色系） */
--alu-primary: #fd79a8;
--alu-secondary: #e84393;
```

这是有意的设计选择，用于区分"小度"（蓝色校园风）和"阿露"（粉色文艺风）两个智能体的视觉识别。

### 数据结构差异

相比框架建议的标准日记结构，本项目增加了以下字段以支持特色功能：

| 字段 | 说明 | 用途 |
|------|------|------|
| `title` | 日记标题 | AI 生成的诗意标题 |
| `weather` | 天气类型 | 分享 HTML 时匹配背景渐变 |
| `highlights` | 亮点句子 | 阿露自评的优质片段 |

---

## ⚠️ 部署注意事项

### GitHub Pages 限制

**本项目包含 Node.js 后端（server.js），无法直接部署到 GitHub Pages。**

GitHub Pages 仅支持静态文件托管，无法运行 Node.js 服务器。

### 推荐部署方案

#### 方案 A：Vercel 全栈部署（✅ 推荐）

1. 将项目推送到 GitHub
2. 在 Vercel 导入仓库
3. Vercel 自动检测 `server.js` 并部署为 Serverless 函数
4. 免费额度充足，支持自动 HTTPS

**适配步骤：**
- 将 `server.js` 改造为 Vercel Serverless 函数格式
- 在 Vercel 环境变量中配置 `MIMO_API_KEY`

#### 方案 B：前后端分离部署

- **前端**：GitHub Pages 托管 `tools/` 目录
- **后端**：Vercel/Heroku/Railway 部署 `server.js`
- **注意**：需修改前端 AI 调用地址为后端域名

#### 方案 C：仅部署前端（❌ 不推荐）

- 将 API Key 硬编码到前端（⚠️ 安全风险）
- 移除 `server.js`，直接调用 MIMO AI
- **缺点**：暴露 API Key，容易被盗用

---

## 📦 提交物清单

- [x] 完整源码（已打包为 `日记帮写-成品.zip`，64.14 MB）
- [x] README.md（本文件）
- [ ] Demo 演示视频（3-5 分钟，待录制）
- [x] GitHub 仓库：https://github.com/ZhangHZ1999/-

---

## ✅ 开发规范检查

- [x] 使用了统一的 CSS 变量（variables.css）
- [x] AI 接口通过后端代理调用（未暴露 API Key）
- [x] JSON 数据已做清洗处理（parseAiJson 函数）
- [x] 图片加载失败有 CSS 渐变兜底
- [x] 本地存储功能正常（各模块数据持久化）
- [x] 代码无控制台报错
- [x] README 包含启动说明
- [x] 遵循统一的目录结构

---

##  已知问题与修复记录

### 已修复的关键问题

1. **XSS 漏洞**：history.js 未转义用户内容 → 添加 `_escapeHtml()` 方法
2. **历史查看后分享对象错误**：viewDiary() 未设置 DiaryManager.currentDiary → 同步设置
3. **阿露日记被丢弃**：workflow.js 中 evaluateWithAlu() 返回日记后未被正确使用 → 检查并返回
4. **downloadDiary() tags.join() 类型不安全** → 添加 Array.isArray 检查
5. **startNewConversation() 未隐藏历史容器** → 添加防御性隐藏

---

## 📞 联系方式

如有问题或建议，欢迎联系：
- GitHub Issues: https://github.com/ZhangHZ1999/-/issues
- 邮箱：[你的邮箱]

---

> 📌 **最后更新**：2026 年 9 月 13 日  
> 🎓 **黑客松项目 · 工具组技术框架对接完成**
