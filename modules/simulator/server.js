// 核心后端：AI 代理 + 静态文件服务
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 根路径重定向到模拟器
app.get('/', (req, res) => {
  res.redirect('/simulator/');
});

// AI 统一代理接口（前端不接触 API Key）
// 支持 stream：传入 { stream: true } 时，以 SSE 透传上游流式响应，实现"边生成边显示"
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model, temperature, max_tokens, stream } = req.body;

    if (!process.env.MIMO_API_KEY) {
      throw new Error('MIMO_API_KEY 未配置，请检查 .env 文件');
    }

    const wantStream = !!stream;
    // 超时保护：上游接受连接却不响应（挂起）时，AbortController 主动掐断，
    // 否则请求永久 pending，前端 await 卡死且预加载标志永不释放。
    // 头超时 30s：拿不到响应头即断；拿到后由 bodyTimeout 管非流式整体读取，
    // 流式长生成不受 bodyTimeout 限制（头到达后即取消该计时器）。
    const ac = new AbortController();
    const headerTimer = setTimeout(() => ac.abort(), 30000);
    let bodyTimer = null;
    let upstream;
    try {
      upstream = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MIMO_API_KEY}`
        },
        signal: ac.signal,
        body: JSON.stringify({
          model: model || 'mimo-v2.5',
          messages: messages,
          temperature: temperature || 0.8,
          max_tokens: max_tokens || 2000,
          // ⚠️ 关闭思考模式（实测：顶层 enable_thinking:false 不生效，思考链会吃空 content）
          thinking: { type: 'disabled' },
          enable_thinking: false,
          // 仅当本请求需要流式时才向上游开启，避免影响其它普通调用
          stream: wantStream
        })
      });
    } finally {
      clearTimeout(headerTimer);
    }
    if (!wantStream) bodyTimer = setTimeout(() => ac.abort(), 60000); // 非流式整体读取上限

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({ error: 'AI 连接失败：' + errText.slice(0, 200) });
    }

    // 流式分支：以 SSE 把上游每个 chunk 原样透传给前端
    if (wantStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      try {
        for await (const chunk of upstream.body) {
          res.write(chunk);
        }
      } catch (e) {
        try { res.write('\n'); } catch (_) { /* 已断开则忽略 */ }
      }
      res.end();
      return;
    }

    // 非流式分支（原有逻辑，其余 9 处调用不受影响）
    let data;
    try {
      data = await upstream.json();
    } finally {
      if (bodyTimer) clearTimeout(bodyTimer);
    }
    if (data.choices && data.choices[0]) {
      res.json(data.choices[0].message);
    } else {
      console.error('API 返回异常:', JSON.stringify(data).slice(0, 300));
      throw new Error('Invalid API Response');
    }

  } catch (error) {
    console.error('❌ AI Call Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 连接失败，请稍后再试' });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`✅ 服务器已运行在 http://localhost:${PORT}`);
  console.log(`🎮 模拟器地址: http://localhost:${PORT}/simulator/`);
});
