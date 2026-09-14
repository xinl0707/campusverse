# 🎓 课表智能分析系统

大学新生课表指南 · AI 驱动的学业规划助手

## ✨ 功能特性

### 1. 特殊上课模式识别
- 单双周课程自动标记
- 隔周开课检测
- 短期课程预警

### 2. 学业权重分析
- 高分必修课智能识别
- 重点投入提醒

### 3. 作息风险评估
- 连续多天早八预警
- 晚间满课提示
- 睡眠透支检测

### 4. 空间感 - 碎片空课分析
- 零散 1~2 节空课标记
- 防刷手机建议

### 5. 可视化维度图
- 五维能力雷达图
- 每周课表日历视图
- 统计数据概览

## 📥 上传方式

| 方式 | 说明 | 用途 |
|------|------|------|
| **ICS 文件** | 从 Outlook、Google Calendar 导出 | 标准化导入 |
| **WebCal 订阅** | iOS/macOS 日历自动同步 | 实时同步 |
| **图片 OCR** | JPG/PNG 课表截图 | AI 识别 |
| **PDF** | 课表 PDF 文件 | 待开发 |

## 🚀 快速开始

### 环境准备

```bash
# 确保 Node.js 已安装（v16+）
node -v

# 进入项目目录
cd /Users/hongyutong/Desktop/02_工具组

# 安装依赖
npm install
```

### 启动服务

```bash
# 直接运行
node server.js

# 访问地址
http://localhost:3000/tools/
```

## 📁 目录结构

```
02_工具组/
├── common/               # 公共资源
│   ├── css/
│   │   ├── variables.css  # 全局设计变量
│   │   └── components.css # UI 组件库
│   └── js/
│       ├── utils.js       # 通用工具函数
│       └── ai-proxy.js    # AI 调用封装
├── tools/                # 工具箱专用
│   ├── index.html        # 工具主页面
│   ├── css/
│   │   └── tool-style.css # 工具专用样式
│   └── js/
│       ├── app.js        # 主逻辑入口
│       └── modules/      # 功能模块
│           ├── schedule.js # 课表管理
│           ├── analysis.js # 智能分析
│           └── viz.js     # 数据可视化
├── assets/               # 静态资源
├── package.json          # 依赖管理
├── server.js             # 后端服务器
├── .env                  # 环境变量（API Key）
└── README.md             # 项目说明
```

## 🛠️ 技术栈

- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **后端**: Node.js + Express
- **AI 接口**: MIMO MimoV2.5
- **图表**: Chart.js（可扩展）

## ⚙️ API 配置

所有 AI 调用通过后端代理，防止 API Key 泄露：

请在项目根目录创建 `.env` 文件：

```env
MIMO_API_KEY=your_api_key_here
PORT=3000
```

## 📝 数据结构

### 课程对象
```javascript
{
  id: string,              // 唯一标识
  name: string,            // 课程名称
  day: number,             // 星期几（1-7）
  startTime: string,       // 开始时间（HH:mm）
  endTime: string,         // 结束时间（HH:mm）
  location: string,        // 教室地点
  teacher: string,         // 教师姓名
  weekType: string,        // 周次类型（每周/单周/双周/隔周）
  durationWeeks: number,   // 持续周数
  credits: number          // 学分（可选）
}
```

### 分析报告
```javascript
{
  specialPatterns: [...],  // 特殊上课模式
  highWeightCourses: [...], // 高权重必修课
  scheduleRisks: [...],    // 作息风险
  fragmentTime: {...},     // 碎片时间分析
  visualizationData: {...}, // 可视化数据
  recommendations: [...]   // 综合建议
}
```

## 🔐 安全提示

⚠️ **重要**: `.env` 文件包含敏感信息，请勿提交到 Git 仓库！

已在 `.gitignore` 中排除 `.env`。

## 📅 项目里程碑

- [x] 基础框架搭建
- [x] 课表管理模块
- [x] 智能分析算法
- [x] 数据可视化
- [ ] ICS 文件解析完整实现
- [ ] WebCal 订阅功能
- [ ] OCR 识别优化
- [ ] 移动端适配

## 👥 团队成员

| 成员 | 负责模块 |
|------|----------|
| 严锦程 | 课表分析模块 + 后端搭建 |
| 章晗植 | 日记模块 + AI 提示词优化 |
| 洪宇佟 | 情绪模块 + 数据可视化 |

## 📄 许可

MIT License

---

Powered by AI | Built for Campus Life
