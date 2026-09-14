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
    
    const baseURL = process.env.AI_BASE_URL || 'https://api.xiaomimimo.com/v1';
    const apiKey = process.env.MIMO_API_KEY || process.env.AI_API_KEY;
    const aiModel = model || process.env.AI_MODEL || 'mimo-v2.5';
    
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: aiModel,
        messages: messages,
        temperature: 0.8,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    
    // 检查响应是否有错误
    if (data.error) {
      throw new Error(data.error.message || 'API 返回错误');
    }
    
    if (data.choices && data.choices[0]) {
      res.json(data.choices[0].message);
    } else {
      throw new Error('Invalid API Response');
    }

  } catch (error) {
    console.error('❌ AI Call Error:', error.message);
    res.status(500).json({ error: 'AI 连接失败，请稍后再试' });
  }
});

// 默认路由 - 重定向到工具页面
app.get('/', (req, res) => {
  res.redirect('/tools/');
});

app.listen(PORT, () => {
  console.log(`✅ 服务器已运行在 http://localhost:${PORT}`);
  console.log(`📝 日记帮写页面: http://localhost:${PORT}/tools/`);
});
