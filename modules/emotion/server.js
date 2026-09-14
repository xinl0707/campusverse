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
        max_tokens: 2000
      })
    });

    const data = await response.json();

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

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';

  // 获取局域网 IP
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
  }

  console.log('✅ 服务器已运行');
  console.log('   本地访问: http://localhost:' + PORT);
  console.log('   局域网访问: http://' + localIP + ':' + PORT);
  console.log('📍 情绪地图模块: http://localhost:' + PORT + '/tools/emotion/');
});
