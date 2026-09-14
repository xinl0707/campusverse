/**
 * 统一 AI 调用封装（经后端代理，前端不接触 API Key）
 */
'use strict';

/**
 * AI 请求超时保护（毫秒）：连接挂起时主动 abort 让上层的兜底生效，
 * 避免游戏永久卡在「AI 正在构思剧情……」且预加载标志永不释放
 */
const AI_TIMEOUT_MS = 25000;                 // 非流式：事件生成正常 5~15 秒
const AI_STREAM_HEADER_TIMEOUT_MS = 25000;   // 流式：仅限制"拿到响应头"的时间

/**
 * 调用 AI
 * @param {Array} messages - 消息数组 [{role: 'system'|'user'|'assistant', content: '...'}]
 * @param {Object} options - 可选参数 {model, temperature, maxTokens}
 * @returns {Promise<string>} AI 回复内容
 */
async function callAI(messages, options = {}) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),   // 超时后抛 AbortError，走兜底事件
    body: JSON.stringify({
      messages,
      model: options.model || 'mimo-v2.5',
      temperature: options.temperature !== undefined ? options.temperature : 0.8,
      max_tokens: options.maxTokens || 2000
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `AI 服务异常（HTTP ${response.status}）`);
  }

  const data = await response.json();
  if (data.content === undefined || data.content === null) {
    throw new Error('AI 返回内容为空');
  }
  return data.content;
}

/**
 * 修复 AI 常见的非法 JSON 写法（仅作为解析失败后的补救）
 * 1. 数字前带正号："study": +10 —— JSON 规范不允许，JSON.parse 会抛错
 * 2. 尾随逗号：{"a": 1,}
 * @param {string} str - 原始 JSON 字符串
 * @returns {string} 修复后的字符串
 */
function sanitizeJson(str) {
  return str
    .replace(/([:,\[]\s*)\+(\d)/g, '$1$2')   // 去掉数字前的 +
    .replace(/,(\s*[}\]])/g, '$1');          // 去掉尾随逗号
}

/**
 * 提取并解析 JSON 内容（AI 返回可能带 ```json 包裹）
 * @param {string} rawText - 包含 JSON 的原始文本
 * @returns {Object|null} 解析后的对象，失败返回 null
 */
function parseAiJson(rawText) {
  // 1. 尝试正则匹配提取 {} 内容 (去除 ```json ``` 包裹)
  let matched = rawText.match(/\{[\s\S]*\}/);
  let jsonString = matched ? matched[0] : rawText;

  // 2. 直接解析；失败则用清洗后的文本再试一次
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    try {
      const fixed = sanitizeJson(jsonString);
      const parsed = JSON.parse(fixed);
      console.warn('⚠️ AI 返回非法 JSON，已自动修复后解析');
      return parsed;
    } catch (e2) {
      console.error('⚠️ AI 返回格式错误:', e2.message);
      return null; // 由调用方决定兜底数据
    }
  }
}

/**
 * 流式调用 AI（SSE 透传）。AI 每吐出一段文字就通过 onChunk 实时回调，
 * 实现"生成的同时分段显示"，而不是等整段生成完再处理。
 * @param {Array} messages - 消息数组
 * @param {Object} options - {model, temperature, maxTokens}
 * @param {Function} onChunk - (piece: string, full: string) => void 增量片段 / 累积全文
 * @returns {Promise<string>} 完整文本（流式中途异常但有内容时返回已收到的部分）
 */
async function callAIStream(messages, options = {}, onChunk) {
  // 只限制「拿到响应头」的时间：上游挂起时超时 abort；拿到头后长生成不受限
  const ac = new AbortController();
  const headerTimer = setTimeout(() => ac.abort(), AI_STREAM_HEADER_TIMEOUT_MS);
  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ac.signal,
      body: JSON.stringify({
        messages,
        model: options.model || 'mimo-v2.5',
        temperature: options.temperature !== undefined ? options.temperature : 0.8,
        max_tokens: options.maxTokens || 2000,
        stream: true
      })
    });
  } finally {
    clearTimeout(headerTimer);
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `AI 服务异常（HTTP ${response.status}）`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  // 把一段 SSE 缓冲解析成文本增量（delta.content），逐块回调
  const consume = () => {
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = rawEvent.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const piece = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
        if (piece) {
          full += piece;
          if (onChunk) onChunk(piece, full);
        }
      } catch (e) { /* 跳过不完整的 JSON 片段 */ }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      consume();
    }
    // flush 残留（服务端未以双换行结尾的尾巴）
    buffer += decoder.decode();
    if (buffer.trim()) consume();
  } catch (e) {
    // 流式中途断开：保留已收到的部分文本，不抛错
    console.warn('⚠️ AI 流式中途中断，已保留已生成内容:', e.message);
  }

  if (!full) throw new Error('AI 返回内容为空');
  return full;
}
