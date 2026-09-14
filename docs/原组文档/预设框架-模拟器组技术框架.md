# 🎮 黑客松项目 · 模拟器组技术框架

> **模块**：模块 A · 大学模拟器
> **负责人**：昕露、渝
> **截止时间**：2026 年 9 月 13 日 14:00
> **技术栈**：HTML5 + CSS3 + JavaScript(ES6) + Node.js + MIMO AI

---

## 一、技术架构

### 1.1 目录结构

```
project-root/
├── package.json          # 依赖管理
├── server.js             # 核心后端（代理 AI + 静态服务）
├── .env                  # ⚠️敏感信息（API Key 等，不进 Git 仓库）
├── README.md             # 使用说明
│
├── common/               # 公共资源
│   ├── css/
│   │   ├── variables.css # 🎨全局设计变量（色值/圆角/字体）
│   │   └── components.css # UI 组件库（按钮/卡片/输入框）
│   └── js/
│       ├── utils.js      # 🤖通用工具（日志/格式化/LocalStorage）
│       └── ai-proxy.js   # 🔄统一 AI 调用封装类
│
├── simulator/            # [模块 A] 模拟器专用
│   ├── index.html        # 模拟器主页面
│   ├── css/
│   │   └── sim-style.css # 模拟器专用样式
│   ├── js/
│   │   ├── app.js        # 主逻辑入口
│   │   ├── game-engine.js # 游戏引擎
│   │   └── ai-service.js # AI 调用
│   └── assets/
│       └── images/       # 场景图片（教室/宿舍/图书馆等）
│
└── tools/                # [模块 B] 工具箱专用（工具组负责）
    ├── index.html
    └── ...
```

### 1.2 与公共资源的引用

在 `simulator/index.html` 中引入：

```html
<head>
  <!-- 全局样式 -->
  <link rel="stylesheet" href="../common/css/variables.css">
  <link rel="stylesheet" href="../common/css/components.css">
  <!-- 模拟器专用样式 -->
  <link rel="stylesheet" href="css/sim-style.css">
</head>

<body>
  <!-- 页面内容 -->
  
  <!-- 脚本引入（body 结束前） -->
  <script src="../common/js/utils.js"></script>
  <script src="../common/js/ai-proxy.js"></script>
  <script src="js/game-engine.js"></script>
  <script src="js/app.js"></script>
</body>
```

---

## 二、AI 接口配置

### 2.1 统一配置信息

所有 AI 调用必须使用以下配置：

| 配置项 | 值 |
|--------|-----|
| **API Key** | `sk-ccgd95ipyzhm1z5zak1lk23byp9w8qm615a0cgaz8ywigdhw` |
| **Base URL** | `https://api.xiaomimimo.com/v1` |
| **Model** | `mimo-v2.5` |
| **思考模式** | ⚠️ **关闭**（降低响应时间） |

### 2.2 后端代理（必须使用）

**严禁在前端代码中暴露 API Key**，必须通过后端代理调用。

**server.js 核心代码**：

```javascript
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// AI 统一代理接口
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model } = req.body;
    
    const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MIMO_API_KEY}`
      },
      body: JSON.stringify({
        model: model || 'mimo-v2.5',
        messages: messages,
        temperature: 0.8,
        max_tokens: 2000,
        // ⚠️ 关闭思考模式：实测顶层 enable_thinking:false 不生效（2026-09-10），
        //    思考链会吃掉 max_tokens 导致 content 为空；正确写法是 thinking.type=disabled
        thinking: { type: 'disabled' },
        enable_thinking: false
      })
    });

    const data = await response.json();
    
    if(data.choices && data.choices[0]) {
      res.json(data.choices[0].message);
    } else {
      throw new Error("Invalid API Response");
    }

  } catch (error) {
    console.error("❌ AI Call Error:", error.message);
    res.status(500).json({ error: "AI 连接失败，请稍后再试" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ 服务器已运行在 http://localhost:${PORT}`);
});
```

### 2.3 前端调用封装（common/js/ai-proxy.js）

```javascript
/**
 * 统一 AI 调用封装
 * @param {Array} messages - 消息数组 [{role: 'system'|'user'|'assistant', content: '...'}]
 * @param {Object} options - 可选参数 {model, temperature, maxTokens}
 * @returns {Promise<string>} AI 回复内容
 */
async function callAI(messages, options = {}) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        model: options.model || 'mimo-v2.5',
        temperature: options.temperature || 0.8,
        max_tokens: options.maxTokens || 2000
      })
    });
    
    const data = await response.json();
    return data.content;
    
  } catch (error) {
    console.error("AI 调用失败:", error.message);
    throw error;
  }
}
```

### 2.4 JSON 数据清洗（必须使用）

AI 返回的 JSON 可能包含 Markdown 标记，必须清洗后解析：

```javascript
/**
 * 提取并解析 JSON 内容
 * @param {string} rawText - 包含 JSON 的原始文本
 * @returns {Object|null} 解析后的对象，失败返回 null
 */
function parseAiJson(rawText) {
  try {
    // 1. 尝试正则匹配提取 {} 内容 (去除 ```json ``` 包裹)
    let jsonString = rawText.match(/\{[\s\S]*\}/);
    
    if (!jsonString) {
      jsonString = rawText;
    } else {
      jsonString = jsonString[0];
    }

    // 2. 转换为标准对象
    return JSON.parse(jsonString);
    
  } catch (e) {
    console.error("⚠️ AI 返回格式错误:", e.message);
    return null; // 或返回默认兜底数据
  }
}
```

---

## 三、样式规范

### 3.1 全局 CSS 变量（common/css/variables.css）

必须引入并使用以下统一变量：

```css
:root {
  /* 配色 */
  --primary-color: #4A90D9;      /* 主色调 - 校园蓝 */
  --primary-light: #6BA5E7;      /* 浅蓝 */
  --primary-dark: #3A7BC8;       /* 深蓝 */
  --accent-color: #FF6B6B;       /* 强调色 - 红 */
  --success-color: #51CF66;      /* 成功色 - 绿 */
  --warning-color: #FFD43B;      /* 警告色 - 黄 */
  
  /* 背景与文字 */
  --bg-body: #F7F9FC;            /* 页面背景 */
  --card-bg: #FFFFFF;            /* 卡片背景 */
  --text-main: #2D3748;          /* 主文字 */
  --text-sub: #718096;           /* 次要文字 */
  --border: #E5E7EB;             /* 边框色 */
  
  /* 空间与阴影 */
  --radius-card: 16px;           /* 卡片圆角 */
  --radius-btn: 8px;             /* 按钮圆角 */
  --shadow-elevation: 0 10px 20px rgba(0,0,0,0.05);
  --shadow-lg: 0 20px 40px rgba(0,0,0,0.1);
  
  /* 字体 */
  --font-family: 'PingFang SC', 'Microsoft YaHei', -apple-system, sans-serif;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  
  /* 动画 */
  --transition: all 0.3s ease;
}
```

### 3.2 视觉降级预案（图片加载失败兜底）

图片资源加载失败时，使用 CSS 渐变背景兜底：

```css
/* common/css/components.css */

.scene-bg {
  position: relative;
  width: 100%;
  height: 300px;
  border-radius: var(--radius-card);
  overflow: hidden;
}

.scene-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 场景背景色 - 图片加载失败时显示 */
.scene-bg.classroom { background: linear-gradient(135deg, #FEF3C7, #FDE68A); }
.scene-bg.dorm      { background: linear-gradient(135deg, #E0F2FE, #BAE6FD); }
.scene-bg.library   { background: linear-gradient(135deg, #EDE9FE, #DDD6FE); }
.scene-bg.canteen   { background: linear-gradient(135deg, #FFE4E6, #FECDD3); }
.scene-bg.gym       { background: linear-gradient(135deg, #DCFCE7, #86EFAC); }
.scene-bg.outdoor   { background: linear-gradient(135deg, #F3E8FF, #E9D5FF); }
.scene-bg.lab       { background: linear-gradient(135deg, #FFE7E7, #FECACA); }
.scene-bg.office    { background: linear-gradient(135deg, #E0E7FF, #C7D2FE); }
```

HTML 使用方式：

```html
<div class="scene-bg dorm">
  <img src="./assets/images/dorm.jpg" alt="宿舍" onerror="this.style.display='none'">
</div>
```

### 3.3 公共组件（common/css/components.css）

必须使用的公共组件样式：

```css
/* 卡片容器 */
.card {
  background: var(--card-bg);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-elevation);
  padding: 24px;
}

/* 主按钮 */
.btn-primary {
  display: inline-block;
  padding: 12px 32px;
  background: var(--primary-color);
  color: white;
  border-radius: var(--radius-btn);
  border: none;
  cursor: pointer;
  transition: var(--transition);
}
.btn-primary:hover {
  background: var(--primary-dark);
  transform: translateY(-2px);
}

/* 次按钮 */
.btn-secondary {
  display: inline-block;
  padding: 12px 32px;
  background: transparent;
  color: var(--text-main);
  border: 2px solid var(--border);
  border-radius: var(--radius-btn);
  cursor: pointer;
  transition: var(--transition);
}
.btn-secondary:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

/* 输入框 */
.input-field {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-btn);
  font-size: var(--font-size-base);
  transition: var(--transition);
}
.input-field:focus {
  outline: none;
  border-color: var(--primary-color);
}

/* 加载动画 */
.loading {
  display: inline-block;
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## 四、数据存储方案

### 4.1 LocalStorage 封装（common/js/utils.js）

```javascript
/**
 * 本地存储管理器
 */
const StorageManager = {
  prefix: 'simulator_',  // 模拟器组统一前缀
  
  /**
   * 保存数据
   * @param {string} key - 键名
   * @param {any} data - 数据（自动 JSON 序列化）
   */
  save(key, data) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(data));
    } catch (e) {
      console.error("存储失败:", e.message);
    }
  },
  
  /**
   * 读取数据
   * @param {string} key - 键名
   * @returns {any|null} 数据（自动 JSON 解析），不存在返回 null
   */
  load(key) {
    try {
      const data = localStorage.getItem(this.prefix + key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error("读取失败:", e.message);
      return null;
    }
  },
  
  /**
   * 删除数据
   * @param {string} key - 键名
   */
  remove(key) {
    localStorage.removeItem(this.prefix + key);
  },
  
  /**
   * 清空所有模拟器组数据
   */
  clear() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    keys.forEach(k => localStorage.removeItem(k));
  }
};
```

### 4.2 游戏存档数据结构

```javascript
// 建议的存档结构（供参考，具体字段可自行设计）
const saveDataStructure = {
  version: "1.0",       // 存档版本号，便于后续兼容

  // 玩家信息
  player: {
    name: '玩家姓名',
    gender: '男',
    school: '杭州电子科技大学',
    major: '人工智能'
  },
  
  // 当前状态
  current: {
    semester: 0,        // 0-7 对应 8 个学期
    month: 0,           // 当前学期内第几个事件（0-5，共 6 个）
    energy: 80,         // 精力 0-100
    study: 60,          // 学业 0-100
    social: 50,         // 人际 0-100
    mental: 70          // 心态 0-100
  },
  
  // 历史记录（用于毕业分析）
  history: {
    events: [],         // 所有事件记录
    choices: []         // 所有选择记录
  },
  
  // 时间戳
  createdAt: Date.now(),
  updatedAt: Date.now()
};
```

---

## 五、开发规范

### 5.1 代码风格

- 使用 ES6+ 语法（const/let、箭头函数、async/await）
- 函数命名使用驼峰式（camelCase）：`generateEvent`, `handleChoice`
- 常量使用大写 + 下划线（UPPER_SNAKE_CASE）：`API_KEY`, `MAX_EVENTS`
- 代码缩进使用 2 个空格
- 每个函数不超过 50 行，复杂逻辑拆分为子函数

### 5.2 错误处理

```javascript
// 示例：AI 调用错误处理
async function generateEvent() {
  try {
    const messages = buildEventPrompt(gameState);
    const response = await callAI(messages);
    const eventData = parseAiJson(response);
    
    if (!eventData) {
      // 使用兜底数据
      return getDefaultEvent();
    }
    
    return eventData;
    
  } catch (error) {
    console.error("事件生成失败:", error.message);
    // 显示友好提示，不直接暴露错误信息
    showToast("AI 暂时休息中，请稍后再试~");
    return getDefaultEvent();
  }
}
```

### 5.3 性能优化

- 图片资源压缩后使用（建议单张不超过 200KB）
- 避免频繁 DOM 操作，使用批量更新
- AI 请求可考虑防抖/节流（快速连续点击时）
- 长列表使用虚拟滚动（如事件历史记录）

---

## 六、启动与运行

### 6.1 环境准备

```bash
# 1. 确保 Node.js 已安装（v16+）
node -v

# 2. 进入项目根目录
cd /path/to/project

# 3. 安装依赖
npm install
```

### 6.2 环境变量配置

在项目根目录创建 `.env` 文件：

```env
MIMO_API_KEY=sk-ccgd95ipyzhm1z5zak1lk23byp9w8qm615a0cgaz8ywigdhw
PORT=3000
```

### 6.3 启动服务

```bash
# 启动后端服务器
node server.js

# 访问地址
# 浏览器打开 http://localhost:3000/simulator/
```

### 6.4 package.json 模板

```json
{
  "name": "aigc-campus-simulator",
  "version": "1.0.0",
  "description": "AI 驱动的大学生活模拟器",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.0.3"
  }
}
```

---

## 七、提交物准备

### 7.1 必须提交

- [ ] 完整源码（打包成 `.zip`）
- [ ] `README.md`（包含项目说明和启动方法）
- [ ] Demo 演示视频（3-5 分钟，备用）

### 7.2 可选提交

- [ ] 项目仓库链接（GitHub/Gitee）
- [ ] 在线演示地址（如有部署）

---

## 八、检查清单

开发完成后，请确认：

- [ ] 使用了统一的 CSS 变量（variables.css）
- [ ] AI 接口通过后端代理调用（未暴露 API Key）
- [ ] JSON 数据已做清洗处理（parseAiJson 函数）
- [ ] 图片加载失败有 CSS 渐变兜底
- [ ] 本地存储功能正常（存档/读档）
- [ ] 代码无控制台报错
- [ ] README 包含启动说明
- [ ] 遵循统一的目录结构

---

> 📌 **注意**：本框架文档仅规定技术实现规范，具体业务逻辑（游戏机制、AI 提示词等）参考《03_模拟器项目详细设计.md》
