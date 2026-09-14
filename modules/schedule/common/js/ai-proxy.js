/**
 * 统一 AI 调用封装（Mimov2.5）
 * 必须通过后端代理调用，严禁在前端暴露 API Key
 */

const AI_CONFIG = {
  MODEL: 'mimo-v2.5',
  TEMPERATURE: 0.8,
  // mimo-v2.5 是「先思考再作答」的模型：思考过程也算 completion 额度。
  // 整张课表的 JSON 很长，3000 经常全部被思考吃掉、正文为空，识别就会「莫名其妙失败」。
  MAX_TOKENS: 8000
};

/**
 * 提取并解析 JSON 内容（去除 Markdown 标记）
 * @param {string} rawText - 包含 JSON 的原始文本
 * @returns {Object|null} 解析后的对象，失败返回 null
 */
function parseAiJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  // 去掉 markdown 代码围栏
  const stripped = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  // 依次尝试多种候选串，任一成功即返回
  const candidates = [];

  // 1) 整体
  candidates.push(stripped);

  // 2) 第一个 { ... } 平衡块
  const braceStart = stripped.indexOf('{');
  if (braceStart !== -1) {
    let depth = 0;
    for (let i = braceStart; i < stripped.length; i++) {
      if (stripped[i] === '{') depth++;
      else if (stripped[i] === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(stripped.slice(braceStart, i + 1));
          break;
        }
      }
    }
    // 3) JSON 被截断（max_tokens 用尽）时补全右括号
    candidates.push(repairTruncatedJson(stripped.slice(braceStart)));
  }

  // 4) 数组形式 [...]
  const arrStart = stripped.indexOf('[');
  if (arrStart !== -1) {
    const arrEnd = stripped.lastIndexOf(']');
    if (arrEnd > arrStart) {
      candidates.push(stripped.slice(arrStart, arrEnd + 1));
    }
  }

  for (const cand of candidates) {
    if (!cand) continue;
    try {
      const parsed = JSON.parse(cand);
      // 数组结果包装成 courses
      if (Array.isArray(parsed)) return { courses: parsed };
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) { /* 尝试下一个候选 */ }
  }

  // 5) 最后手段：只做安全的中文引号替换（绝不改动英文引号）
  try {
    const normalized = stripped
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed) ? { courses: parsed } : parsed;
  } catch (e) {
    console.error("⚠️ AI 返回格式错误:", e.message);
    return null;
  }
}

/**
 * 尝试修复被截断的 JSON：
 * 从后往前回退到最后一个完整的对象边界，再用括号栈补全闭合符。
 */
function repairTruncatedJson(str) {
  if (!str || str.indexOf('{') === -1) return null;

  // 扫描字符串（跳过字符串内部的括号），返回未闭合括号的栈
  const scanStack = (s) => {
    const stack = [];
    let inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') {
        if (stack.length && ((ch === '}' && stack[stack.length - 1] === '{') ||
                             (ch === ']' && stack[stack.length - 1] === '['))) stack.pop();
      }
    }
    return { stack, inStr };
  };

  const tryClose = (s) => {
    const { stack, inStr } = scanStack(s);
    let cand = inStr ? s + '"' : s;          // 先闭合悬空字符串
    cand = cand.replace(/,\s*"[^"]*"\s*:?$/, '');   // 丢掉不完整的键名
    cand = cand.replace(/[,:\s]+$/, '');             // 丢掉悬空分隔符
    const rescan = scanStack(cand);
    if (rescan.inStr) return null;
    const closers = rescan.stack.slice().reverse().map(c => c === '{' ? '}' : ']').join('');
    const final = cand + closers;
    try { JSON.parse(final); return final; } catch (_) { return null; }
  };

  // 依次尝试：原串 → 回退到第 N 个 '}' 之前
  let work = str;
  for (let attempt = 0; attempt < 60; attempt++) {
    const fixed = tryClose(work);
    if (fixed) return fixed;
    const idx = work.lastIndexOf('}');
    if (idx <= 0) break;
    work = work.slice(0, idx);        // 砍掉最后一个可能残缺的元素
  }
  return null;
}

/**
 * 统一 AI 调用封装
 * @param {Array} messages - 消息数组 [{role: 'system'|'user'|'assistant', content: '...'}]
 * @param {Object} options - 可选参数 {model, temperature, maxTokens}
 * @returns {Promise<string>} AI 回复内容
 */
async function callAI(messages, options = {}) {
  try {
    const maxTokens = options.maxTokens || AI_CONFIG.MAX_TOKENS;
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages,
        model: options.model || AI_CONFIG.MODEL,
        // 用 ?? 而不是 ||，否则显式传 temperature: 0 会被悄悄换成默认值
        temperature: options.temperature ?? AI_CONFIG.TEMPERATURE,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      // 后端会用 {error, detail} 说明真正原因（缺 Key / 鉴权失败 / 超时…），
      // 千万别只抛 "HTTP error! status: 500"，那样前端什么有用信息都拿不到。
      const body = await response.json().catch(() => null);
      const err = new Error(body && body.error ? body.error : `后端 /api/chat 返回 ${response.status}`);
      err.detail = body && body.detail ? body.detail : '';
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    const content = data && typeof data.content === 'string' ? data.content.trim() : '';

    if (content) {
      return data.content;
    }

    // HTTP 200 但正文为空 / 被截断：必须把根因摊开，否则上层只会看到「没识别到课程」。
    const truncated = data && data.finish_reason === 'length';
    const err = new Error(truncated
      ? `模型只顾“思考”，正文被截断了（finish_reason=length，max_tokens=${maxTokens}）`
      : '接口通了，但模型回了一段空正文（没给出可解析的内容）');
    err.detail = [
      `finish_reason: ${(data && data.finish_reason) || '(无)'}｜本次请求 max_tokens: ${maxTokens}`,
      data && data.usage ? `token 用量: ${JSON.stringify(data.usage)}` : '',
      data && data.reasoning_content ? `模型思考片段: ${String(data.reasoning_content).slice(0, 300)}` : '',
      content ? '' : '（图片能读到的字太少时也会出现这种情况，换清晰一点的整页截图通常就好了）'
    ].filter(Boolean).join('\n');
    err.emptyContent = true;
    throw err;

  } catch (error) {
    console.error("❌ AI 调用失败:", error.message);
    // fetch 本身失败 = 后端没起或断网，给出可执行的提示
    if (/Failed to fetch|NetworkError|Load failed|ERR_/i.test(error.message) && !error.status) {
      error.message = '连不上后端服务（node server.js 没启动或端口 3000 被占用）';
      error.detail = error.detail || '请检查终端里 node server.js 是否在运行，然后强刷页面。';
    }
    throw error;
  }
}

/**
 * OCR 图片识别提示词构建器
 * @param {string} base64Image - Base64 编码的图片
 * @returns {Array} 消息数组
 */
function buildOCRPrompt(base64Image) {
  return [
    {
      role: 'system',
      content: `你是一个专业的课程表识别助手，需要从课表图片中提取【全部】课程。

严格要求：
1. 必须扫描整张图片的所有列（周一到周日）和所有行（早八点到晚十点），一门都不能漏。
2. 一门课如果在一周里出现多次（例如高等数学在周一和周三都有），必须【拆成多条记录】，每条一个 day。
3. 同一个格子里若叠加了多门课（例如前 8 周 Java、后 8 周 C++），也要分别输出多条，并用 weekType 区分。
4. day 使用数字：1=周一, 2=周二, 3=周三, 4=周四, 5=周五, 6=周六, 7=周日。
5. 时间优先输出 HH:mm 24 小时制。如果图片只有"第1-2节"这种节次，则额外输出 "periods": "1-2"。
6. 单/双周标注在 weekType 上，取值："每周" | "单周" | "双周"。看不出来就填 "每周"。
7. 图上标了学分就填 credits（数字）；看不清或没写就【不要输出这个字段】，更不要瞎猜，学业权重会算错。
8. 只输出 JSON，不要任何解释文字、不要 markdown 代码块，结尾必须把括号闭合完整。

输出格式：
{
  "courses": [
    {
      "name": "C语言程序设计",
      "day": 1,
      "startTime": "08:05",
      "endTime": "10:45",
      "periods": "1-3",
      "location": "正心楼515",
      "teacher": "韦学辉",
      "weekType": "每周",
      "durationWeeks": 16,
      "credits": 3
    }
  ],
  "confidence": 0.95
}`
    },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: base64Image
          }
        },
        {
          type: 'text',
          text: '请逐格扫描整张课表（周一至周日 × 全部节次），提取每一门课的每一次上课，返回完整 JSON。宁多勿漏。'
        }
      ]
    }
  ];
}

// 导出全局对象
window.AIProxy = {
  AI_CONFIG,
  parseAiJson,
  callAI,
  buildOCRPrompt
};
