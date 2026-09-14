/**
 * 课表分析系统后端服务器
 * 提供 AI 代理接口和静态文件服务
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
// 课表截图 base64 后轻松超过 10 MB，限制太小会直接被 body-parser 挡成 413，
// 前端只能看到一句「返回 413」，看不出是体积问题。
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname)));

// ICS 文件获取接口（用于 WebCal 订阅）
app.get('/api/fetch-ics', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).send('缺少 URL 参数');
    }

    // 支持 webcal:// 协议
    if (url.startsWith('webcal://')) {
      url = 'https://' + url.substring('webcal://'.length);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Accept': 'text/calendar,text/plain,*/*'
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();

    // 即使 HTTP 状态码非 200（例如 HDUHelper 返回 404 但内容有效），
    // 只要内容看起来像 ICS 就照常返回，交由前端解析
    const looksLikeICS = text.includes('BEGIN:VCALENDAR') || text.includes('BEGIN:VEVENT');

    if (!response.ok && !looksLikeICS) {
      return res.status(400).send('HTTP ' + response.status);
    }

    console.log(`✅ ICS 获取成功 (status=${response.status}, 内容长度=${text.length}, isICS=${looksLikeICS})`);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);

  } catch (error) {
    console.error("❌ ICS Fetch Error:", error.message);
    res.status(500).send('获取失败：' + error.message);
  }
});

// AI 统一代理接口
app.post('/api/chat', async (req, res) => {
  // catch 里也要拿得到，所以声明在 try 外面（放里面会在 catch 里 ReferenceError）
  let timeoutMs = 90000;
  try {
    const { messages, model, temperature, max_tokens } = req.body;

    // 带图请求的失败原因往往和纯文本完全不同（图片尺寸/格式作祟），分类时要区分开
    const hasImage = Array.isArray(messages) && messages.some(m =>
      Array.isArray(m && m.content) && m.content.some(p => p && p.type === 'image_url'));

    if (!process.env.MIMO_API_KEY) {
      return res.status(500).json({ error: '服务端未配置 MIMO_API_KEY，请检查 .env 文件' });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '请求里没有 messages，前端拼参数出错' });
    }

    // 带图请求实测能跑到一分多钟（模型先思考再逐格输出），90 秒会把它掐死在半路
    timeoutMs = hasImage ? 180000 : 90000;
    const upstream = AbortSignal.timeout
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

    const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MIMO_API_KEY}`
      },
      signal: upstream,
      body: JSON.stringify({
        model: model || 'mimo-v2.5',
        messages: messages,
        // 课表 JSON 往往很长，默认给足 token，避免结果被截断
        temperature: typeof temperature === 'number' ? temperature : 0.3,
        max_tokens: max_tokens || 8000
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('❌ AI 上游错误:', response.status, errText.slice(0, 300));
      // 把上游状态和原因带回前端，否则用户只能看到一句没用的「连接失败」
      return res.status(502).json({
        error: `AI 上游返回 ${response.status}`,
        detail: classifyUpstreamError(response.status, errText, hasImage)
      });
    }

    const data = await response.json();

    if (data && data.choices && data.choices[0]) {
      // 顺手把 finish_reason / usage 带回去：正文为空或被截断时，
      // 前端才有依据告诉用户「是 token 用完了」而不是干巴巴一句「没有 content」
      res.json({
        ...data.choices[0].message,
        finish_reason: data.choices[0].finish_reason || null,
        usage: data.usage || null
      });
    } else {
      throw new Error('上游返回结构异常（缺少 choices[0]）：' + JSON.stringify(data).slice(0, 200));
    }
    // 注：正文为空（模型只想完 token 就收笔）不在这里报错，交给前端 callAI 统一处理，
    // 因为只有前端知道该弹哪个窗口、怎么给建议。

  } catch (error) {
    console.error("❌ AI Call Error:", error.message);
    const timeout = /timeout|abort|AbortError/i.test(`${error.name} ${error.message}`);
    res.status(500).json({
      error: timeout ? `AI 请求超时（${timeoutMs / 1000} 秒未返回）` : `AI 调用失败：${error.message}`,
      detail: timeout
        ? '图片太大或课程太多时模型会读得很慢。把课表裁成上下两半分别识别，通常十几秒就出来了。'
        : String(error.message || error)
    });
  }
});

/** 上游状态码 → 人话，供前端「识别失败」弹窗直接展示 */
function classifyUpstreamError(status, text, hasImage) {
  const t = String(text || '');
  const msg = (t.match(/"message"\s*:\s*"([^"]{2,160})"/) || [])[1];
  if (status === 401 || status === 403) return 'API Key 无效或没有该模型权限，检查 .env 里的 MIMO_API_KEY';
  if (status === 404) return '模型名不存在，检查请求的 model 是否为 mimo-v2.5';
  if (status === 429) return '请求过于频繁或额度已用尽，稍后再试';
  if (status >= 500) {
    // 实测：这张图本身有问题（极端小图、损坏图）时上游就是回 500，
    // 只说「服务端故障」会让人以为只能干等，所以带图请求要多给一句可操作提示。
    return hasImage
      ? `AI 服务端处理这张图片时出错${msg ? '（' + msg + '）' : ''}。多半是图片本身的问题：尺寸太极端、被压缩糊掉或格式异常，试试重新截一张清晰的课表图。`
      : `AI 服务端故障，稍后再试${msg ? '（' + msg + '）' : ''}`;
  }
  return (msg || t.slice(0, 200)) || `HTTP ${status}`;
}

// 注：原先这里还有一个 /api/ocr 接口，和 /api/chat 重复、还把错误统一压成一句
// 「OCR 识别失败，请稍后再试」（前端拿不到真实原因），且全站没人调用，已删除。
// 图片识别统一走 /api/chat + AIProxy.buildOCRPrompt。

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), hasKey: !!process.env.MIMO_API_KEY });
});

// 兜底：请求体超限等中间件层面的错误也要回 JSON 原因，
// 否则前端只会收到一页 HTML，弹窗里显示成一团乱码。
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: '图片太大，服务端收不下',
      detail: `服务端单次请求上限 25 MB（base64 会让体积再涨约 1/3）。请重新截小一点或压缩后再传。`
    });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法 JSON', detail: String(err.message).slice(0, 200) });
  }
  console.error('❌ 未处理的服务端错误:', err && err.message);
  res.status(500).json({ error: '服务端内部错误：' + String((err && err.message) || '未知'), detail: '' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`✅ 课表分析系统服务器已启动！`);
  console.log(`📍 访问地址：http://localhost:${PORT}/tools/`);
  console.log(`🔗 API 端口：http://localhost:${PORT}`);
  console.log(`========================================`);
});

module.exports = app;
