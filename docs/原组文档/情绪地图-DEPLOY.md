# 🚀 GitHub Pages 部署指南

## 一、推送到 GitHub

```bash
# 1. 在项目根目录初始化 git
cd 黑客松
git init

# 2. 添加所有文件
git add .

# 3. 提交
git commit -m "初始化：情绪地图模块"

# 4. 在 GitHub 上创建仓库（不要勾选 README），然后：
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main
git push -u origin main
```

## 二、启用 GitHub Pages

1. 打开你的 GitHub 仓库页面
2. 点击 **Settings** → 左侧 **Pages**
3. **Source** 选择 `Deploy from a branch`
4. **Branch** 选择 `main`，目录选 `/ (root)`
5. 点击 **Save**

## 三、访问你的网站

等待 1-2 分钟后，访问：

```
https://你的用户名.github.io/仓库名/tools/emotion/
```

## 四、注意事项

- ✅ **情绪地图、时间轴、表情墙、成就系统** → 完全可用
- ✅ **AI 日总结/周总结** → 静态部署下会直接调用 MIMO API
- ✅ **LocalStorage 记忆** → 每个用户的浏览器独立保存
- ⚠️ API Key 暴露在前端 → 仅限黑客松演示使用，正式项目应使用后端代理
- ⚠️ CORS 问题 → 如果 MIMO API 不允许跨域，AI 功能可能受限（此时可在本地 `node server.js` 运行）

## 五、本地开发（推荐）

```bash
cd 黑客松
npm install
npm start
# 访问 http://localhost:3000/tools/emotion/
```

本地开发时自动使用后端代理，AI 调用更稳定。
