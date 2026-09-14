#!/bin/bash

# ============================================
# 课表智能分析系统 - 快速启动脚本
# ============================================

echo "🎓 课表智能分析系统"
echo "====================="

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误：Node.js 未安装"
    echo "请前往 https://nodejs.org 下载安装"
    exit 1
fi

echo "✅ Node.js 版本：$(node -v)"

# 检查 package.json 是否存在
if [ ! -f "package.json" ]; then
    echo "❌ 错误：未发现 package.json"
    echo "请在项目根目录运行此脚本"
    exit 1
fi

# 检查 .env 文件是否存在，不存在则创建模板
if [ ! -f ".env" ]; then
    echo ""
    echo "⚠️  警告：.env 文件不存在，正在创建模板..."
    cat > .env << 'EOF'
# API Key Configuration
MIMO_API_KEY=your_api_key_here
PORT=3000

# ⚠️ 重要提示：
# 请在 .env 文件中替换为你的 MIMO API Key
# API Key 可从项目文档中获取
EOF
    echo "✅ .env 模板已创建"
    echo "⚠️  请在启动前编辑 .env 文件并配置 API Key"
fi

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 正在安装依赖..."
    npm install

    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败，请检查网络连接或尝试手动安装"
        exit 1
    fi
    echo "✅ 依赖安装完成"
else
    echo "✅ 依赖已存在，跳过安装"
fi

# 设置端口号
PORT=${PORT:-3000}

echo ""
echo "🚀 正在启动服务器..."
echo "📍 访问地址：http://localhost:$PORT/tools/"
echo "💡 提示：按 Ctrl+C 停止服务"
echo "==========================================="

# 启动服务器
node server.js
