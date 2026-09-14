#!/usr/bin/env node
/**
 * ============================================================================
 *  CampusVerse · 双界校园 —— 全站统一服务器（零依赖版）
 * ============================================================================
 *  为什么不用各模块自带的 express server？
 *    1. 四个模块的 server.js 默认端口全是 3000，同时启动必然冲突；
 *    2. 模块B / 模块C 的页面路径都是 /tools/，直接合并会互相覆盖；
 *    3. 四份 /api/chat 各写各的（有的不支持流式、有的不支持图片、有的不带错误分类），
 *       合并成一个才知道该修哪儿。
 *
 *  本文件用一个 Node 原生 http 服务同时完成三件事：
 *    · 静态托管：主网页(/) + 工作台(/workbench/) + 四个模块(/simulator /emotion /schedule /diary)
 *    · 统一 AI 代理：/api/chat（兼容四家的请求/响应格式，支持 SSE 流式与图片识别）
 *    · 各模块页面注入统一外壳：左边缘"返回双界校园"导航条，形成完整闭环
 *
 *  运行：node server.js          （无需 npm install，Node >= 18）
 * ============================================================================
 */

'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

/* ------------------------------------------------------------------ *
 * 0. 配置
 * ------------------------------------------------------------------ */

const ROOT = __dirname;
loadDotEnv(path.join(ROOT, '.env'));           // 先读 .env，再定端口
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.xiaomimimo.com/v1').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || 'mimo-v2.5';
const MAX_BODY = 30 * 1024 * 1024;             // 课表截图 base64 后可能超过 25MB

/** 四个模块的挂载前缀 → 目录（与主网页 js/config.js 的 MODULE_ENTRY 一一对应） */
const MOUNTS = [
  { prefix: '/simulator', dir: 'modules/simulator', name: '大学模拟器' },
  { prefix: '/emotion', dir: 'modules/emotion', name: '情绪地图' },
  { prefix: '/schedule', dir: 'modules/schedule', name: '课表排雷' },
  { prefix: '/diary', dir: 'modules/diary', name: '日记帮写' },
];

/** 四个模块的入口页（相对 ROOT），只有这些页面注入统一外壳脚本 */
const ENTRY_PAGES = new Set([
  'modules/simulator/simulator/index.html',
  'modules/emotion/tools/emotion/index.html',
  'modules/schedule/tools/index.html',
  'modules/diary/tools/index.html',
]);

/** 模块首页（用于外壳导航条的"当前位置"高亮与跳转） */
const MODULE_HOME = {
  '/simulator': '/simulator/simulator/',
  '/emotion': '/emotion/tools/emotion/',
  '/schedule': '/schedule/tools/',
  '/diary': '/diary/tools/',
};

/** 不允许通过 HTTP 拿到的文件名（避免把后端源码/密钥/依赖包体暴露出去） */
const DENY_FILES = new Set([
  'server.js', 'package.json', 'package-lock.json', '.env', '.env.example',
  '.gitignore', 'start.bat', 'start.sh',
]);

/* ------------------------------------------------------------------ *
 * 1. .env 极简解析（不引第三方依赖）
 * ------------------------------------------------------------------ */

function loadDotEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return; // 没有 .env 也不致命，AI 接口会给出明确提示
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/* ------------------------------------------------------------------ *
 * 2. 工具函数
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
};

const mimeOf = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

/** 把 URL 路径安全地解析成磁盘绝对路径；越界返回 null */
function resolveSafe(urlPathname) {
  const relPath = mapUrlToRel(urlPathname);
  if (relPath === null) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(relPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const abs = path.resolve(ROOT, '.' + path.posix.normalize(decoded));
  const rel = path.relative(ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;   // 目录穿越
  return abs;
}

/**
 * URL 前缀 → 磁盘相对路径。
 * 这就是"合并"的核心：/emotion/xxx 实际落在 modules/emotion/xxx，
 * 四个模块各自保留自己的 common/ 目录，互不覆盖。
 * 返回 null 表示这个 URL 是模块根路径，交给重定向处理。
 */
function mapUrlToRel(urlPathname) {
  for (const m of MOUNTS) {
    if (urlPathname === m.prefix) return null;
    if (urlPathname.startsWith(m.prefix + '/')) {
      // 注意开头的 '/'：resolveSafe 用 '.' + rel 拼相对路径，
      // 少了这个斜杠会变成 '.modules/...'（一个不存在的目录），全站静默 404
      return '/' + m.dir + urlPathname.slice(m.prefix.length);
    }
  }
  return urlPathname;   // 其余全部落在站点根（主网页 / 工作台 / shell / docs）
}

/** 拒绝清单：点文件、node_modules、后端源码等 */
function isDenied(urlPathname, absPath) {
  const relPath = mapUrlToRel(urlPathname) || urlPathname;
  const segs = relPath.split('/').filter(Boolean).map(s => s.toLowerCase());
  if (segs.some(s => s === 'node_modules' || s.startsWith('.'))) return true;
  const base = path.basename(absPath).toLowerCase();
  if (DENY_FILES.has(base)) return true;
  return false;
}

async function statOrNull(p) {
  try {
    return await fsp.stat(p);
  } catch {
    return null;
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  const body = Buffer.isBuffer(text) ? text : Buffer.from(String(text), 'utf8');
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length });
  res.end(body);
}

/** 读取请求体（带体积上限，超限抛 413） */
function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        const err = new Error('图片太大，服务端收不下');
        err.status = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ *
 * 3. 静态文件服务
 * ------------------------------------------------------------------ */

/** 注入到模块页面里的统一外壳（左边缘返回条），由 shell/ 目录提供 */
const SHELL_TAG = `
<!-- ===== CampusVerse 统一外壳（由 server.js 自动注入，勿手动修改） ===== -->
<link rel="stylesheet" href="/shell/site-shell.css">
<script src="/shell/site-shell.js" defer></script>
`;

async function serveStatic(req, res, absPath, urlPathname) {
  let info = await statOrNull(absPath);
  if (!info) return false;

  // 目录 → 找 index.html；没有则给目录列表
  if (info.isDirectory()) {
    if (!urlPathname.endsWith('/')) {
      res.writeHead(301, { Location: urlPathname + '/' });
      return res.end();
    }
    const indexFile = path.join(absPath, 'index.html');
    const indexInfo = await statOrNull(indexFile);
    if (!indexInfo) {
      const entries = await fsp.readdir(absPath, { withFileTypes: true });
      const links = entries
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
        .map(e => `<li><a href="${encodeURIComponent(e.name)}${e.isDirectory() ? '/' : ''}">${e.name}</a></li>`)
        .join('');
      return sendText(res, 200,
        `<!doctype html><meta charset="utf-8"><title>目录</title>
         <h1>${urlPathname}</h1><ul>${links}</ul>
         <p><a href="/">← 返回双界校园首页</a></p>`, 'text/html; charset=utf-8');
    }
    absPath = indexFile;
    info = indexInfo;
  }

  if (!info.isFile()) return false;

  const relKey = path.relative(ROOT, absPath).split(path.sep).join('/');
  const type = mimeOf(absPath);
  const isHtml = type.startsWith('text/html');

  // 入口页注入统一外壳
  if (isHtml && ENTRY_PAGES.has(relKey)) {
    const html = await fsp.readFile(absPath, 'utf8');
    const injected = html.includes('</body>')
      ? html.replace(/<\/body>/i, SHELL_TAG + '</body>')
      : html + SHELL_TAG;
    const body = Buffer.from(injected, 'utf8');
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }

  // Range 支持（音频/视频拖动进度、循环播放需要）
  const range = req.headers.range;
  if (range && /^bytes=/.test(range)) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    let start = startStr ? parseInt(startStr, 10) : 0;
    let end = endStr ? parseInt(endStr, 10) : info.size - 1;
    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= info.size) end = info.size - 1;
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${info.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Cache-Control': 'public, max-age=300',
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(absPath, { start, end }).pipe(res);
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(absPath).pipe(res);
}

/* ------------------------------------------------------------------ *
 * 4. 统一 AI 代理
 *    合并四家的实现，取各自最强的一版：
 *      · 流式 SSE 透传（模拟器需要"边生成边显示"）
 *      · 图片识别（模块B 课表截图，超时放宽到 180s）
 *      · token 上限、finish_reason / usage 回传（模块B 前端据此提示"被截断"）
 *      · 关闭思考模式（模拟器实测：只写 enable_thinking:false 不生效）
 *      · 错误分类成人话（上游 401/404/429/5xx 分别给可操作建议）
 * ------------------------------------------------------------------ */

async function handleChat(req, res) {
  let timeoutMs = 90000;
  try {
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return sendJson(res, 400, { error: '请求体不是合法 JSON', detail: String(raw).slice(0, 200) });
    }

    const { messages, model, temperature, max_tokens, stream } = body;

    if (!process.env.MIMO_API_KEY && !process.env.AI_API_KEY) {
      return sendJson(res, 500, {
        error: '服务端未配置 MIMO_API_KEY',
        detail: '请在 最终成品/.env 里填入 MIMO_API_KEY=sk-xxx 后重启服务',
      });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return sendJson(res, 400, { error: '请求里没有 messages，前端拼参数出错' });
    }

    const hasImage = messages.some(m =>
      Array.isArray(m && m.content) && m.content.some(p => p && p.type === 'image_url'));

    const wantStream = !!stream;
    timeoutMs = hasImage ? 180000 : 90000;

    const ac = new AbortController();
    // 头超时 30s：上游只挂起不响应时主动掐断，否则前端 await 永久卡死
    const headerTimer = setTimeout(() => ac.abort(), 30000);
    let bodyTimer = null;

    let upstream;
    try {
      upstream = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MIMO_API_KEY || process.env.AI_API_KEY}`,
        },
        signal: ac.signal,
        body: JSON.stringify({
          model: model || AI_MODEL,
          messages,
          temperature: typeof temperature === 'number' ? temperature : 0.8,
          max_tokens: max_tokens || (hasImage ? 8000 : 2000),
          thinking: { type: 'disabled' },
          enable_thinking: false,
          stream: wantStream,
        }),
      });
    } finally {
      clearTimeout(headerTimer);
    }
    if (!wantStream) bodyTimer = setTimeout(() => ac.abort(), timeoutMs);

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      if (bodyTimer) clearTimeout(bodyTimer);
      console.error('❌ AI 上游错误:', upstream.status, errText.slice(0, 300));
      return sendJson(res, 502, {
        error: `AI 上游返回 ${upstream.status}`,
        detail: classifyUpstreamError(upstream.status, errText, hasImage),
      });
    }

    // ---- 流式：SSE 原样透传 ----
    if (wantStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      try {
        for await (const chunk of upstream.body) {
          if (!res.writableEnded) res.write(chunk);
        }
      } catch (e) {
        try { res.write('\n'); } catch { /* 客户端已断开 */ }
      }
      return res.end();
    }

    // ---- 非流式：返回 message（四家前端都读 data.content） ----
    let data;
    try {
      data = await upstream.json();
    } finally {
      if (bodyTimer) clearTimeout(bodyTimer);
    }

    if (data && data.error) {
      return sendJson(res, 502, { error: data.error.message || 'AI 上游返回错误' });
    }
    if (data && data.choices && data.choices[0]) {
      return sendJson(res, 200, {
        ...data.choices[0].message,
        finish_reason: data.choices[0].finish_reason || null,
        usage: data.usage || null,
      });
    }
    console.error('❌ 上游返回结构异常:', JSON.stringify(data).slice(0, 300));
    return sendJson(res, 502, {
      error: '上游返回结构异常（缺少 choices[0]）',
      detail: JSON.stringify(data).slice(0, 200),
    });

  } catch (error) {
    const timeout = /timeout|abort|AbortError/i.test(`${error.name} ${error.message}`);
    console.error('❌ AI Call Error:', error.message);
    if (res.headersSent) return res.end();
    if (error.status === 413) {
      return sendJson(res, 413, {
        error: error.message,
        detail: '服务端单次请求上限 30MB（base64 会让体积再涨约 1/3），请把图片截小或压缩后再传。',
      });
    }
    return sendJson(res, 500, {
      error: timeout ? `AI 请求超时（${timeoutMs / 1000} 秒未返回）` : `AI 调用失败：${error.message}`,
      detail: timeout
        ? '图片太大或课程太多时模型会读得很慢。把课表裁成上下两半分别识别，通常十几秒就出来了。'
        : String(error.message || error),
    });
  }
}

/** 上游状态码 → 人话，供前端"识别失败"弹窗直接展示 */
function classifyUpstreamError(status, text, hasImage) {
  const t = String(text || '');
  const msg = (t.match(/"message"\s*:\s*"([^"]{2,160})"/) || [])[1];
  if (status === 401 || status === 403) return 'API Key 无效或没有该模型权限，检查 .env 里的 MIMO_API_KEY';
  if (status === 404) return `模型名不存在，检查请求的 model 是否为 ${AI_MODEL}`;
  if (status === 429) return '请求过于频繁或额度已用尽，稍后再试';
  if (status >= 500) {
    return hasImage
      ? `AI 服务端处理这张图片时出错${msg ? '（' + msg + '）' : ''}。多半是图片本身的问题：尺寸太极端、被压缩糊掉或格式异常，试试重新截一张清晰的课表图。`
      : `AI 服务端故障，稍后再试${msg ? '（' + msg + '）' : ''}`;
  }
  return (msg || t.slice(0, 200)) || `HTTP ${status}`;
}

/* ------------------------------------------------------------------ *
 * 5. 课表 ICS 订阅代理（模块B 的 WebCal 导入需要绕开跨域）
 * ------------------------------------------------------------------ */

async function handleFetchIcs(req, res, query) {
  try {
    let target = query.get('url');
    if (!target) return sendText(res, 400, '缺少 URL 参数');
    if (target.startsWith('webcal://')) target = 'https://' + target.slice('webcal://'.length);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(target, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Accept': 'text/calendar,text/plain,*/*',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    // 有些学校日历服务返回 404 但内容其实是合法 ICS，照常交给前端解析
    const looksLikeICS = text.includes('BEGIN:VCALENDAR') || text.includes('BEGIN:VEVENT');
    if (!response.ok && !looksLikeICS) return sendText(res, 400, 'HTTP ' + response.status);

    console.log(`✅ ICS 获取成功 (status=${response.status}, len=${text.length})`);
    sendText(res, 200, text, 'text/plain; charset=utf-8');
  } catch (error) {
    console.error('❌ ICS Fetch Error:', error.message);
    sendText(res, 500, '获取失败：' + error.message);
  }
}

/* ------------------------------------------------------------------ *
 * 6. 路由
 * ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;
  const method = req.method || 'GET';

  try {
    /* ---- API ---- */
    if (pathname === '/api/chat') {
      if (method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' });
        return res.end();
      }
      if (method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' });
      return handleChat(req, res);
    }
    if (pathname === '/api/fetch-ics') return handleFetchIcs(req, res, parsed.searchParams);
    if (pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'ok',
        time: new Date().toISOString(),
        hasKey: !!(process.env.MIMO_API_KEY || process.env.AI_API_KEY),
        model: AI_MODEL,
        baseURL: AI_BASE_URL,
        modules: MOUNTS.map(m => ({ name: m.name, home: MODULE_HOME[m.prefix] })),
      });
    }

    if (method !== 'GET' && method !== 'HEAD') {
      return sendText(res, 405, 'Method Not Allowed');
    }

    /* ---- 模块根路径 → 各自的真实首页（避免访问 /emotion/ 看到目录列表） ---- */
    const cleanPath = pathname.replace(/\/+$/, '') || '/';
    if (MODULE_HOME[cleanPath]) {
      res.writeHead(302, { Location: MODULE_HOME[cleanPath] });
      return res.end();
    }

    /* ---- 静态资源 ---- */
    const absPath = resolveSafe(pathname);
    if (!absPath || isDenied(pathname, absPath)) {
      return sendText(res, 403, '禁止访问该路径');
    }

    const ok = await serveStatic(req, res, absPath, pathname);
    if (ok === false) {
      return sendText(res, 404, `<!doctype html><meta charset="utf-8">
        <title>404 · 双界校园</title>
        <style>body{font-family:system-ui,"Microsoft YaHei";background:#0d1330;color:#e8ecff;
        display:flex;height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}
        a{color:#6BA5E7}</style>
        <div><h1 style="font-size:64px;margin:0">404</h1>
        <p>这条走廊通向的教室不存在：<code>${pathname}</code></p>
        <p><a href="/">← 回到双界校园首页</a> ｜ <a href="/workbench/">进入四合一工作台</a></p></div>`,
        'text/html; charset=utf-8');
    }
  } catch (err) {
    console.error('❌ 服务端错误:', err);
    if (!res.headersSent) sendJson(res, 500, { error: '服务端内部错误：' + err.message });
    else res.end();
  }
});

/* ------------------------------------------------------------------ *
 * 7. 启动
 * ------------------------------------------------------------------ */

function localIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

server.listen(PORT, HOST, () => {
  const hasKey = !!(process.env.MIMO_API_KEY || process.env.AI_API_KEY);
  const line = '─'.repeat(64);
  console.log(line);
  console.log('  🏫  CampusVerse · 双界校园 —— 全站已启动');
  console.log(line);
  console.log(`  🏠 主网页（总入口）   http://localhost:${PORT}/`);
  console.log(`  🧭 四合一工作台       http://localhost:${PORT}/workbench/`);
  console.log('  ── 四大模块 ──────────────────────────────────────────');
  console.log(`  🎮 大学模拟器         http://localhost:${PORT}${MODULE_HOME['/simulator']}`);
  console.log(`  🗺️  情绪地图           http://localhost:${PORT}${MODULE_HOME['/emotion']}`);
  console.log(`  💣 课表排雷           http://localhost:${PORT}${MODULE_HOME['/schedule']}`);
  console.log(`  📝 日记帮写           http://localhost:${PORT}${MODULE_HOME['/diary']}`);
  console.log('  ── 接口 ─────────────────────────────────────────────');
  console.log(`  🤖 AI 代理            POST /api/chat   ${hasKey ? '（已检测到 API Key ✅）' : '（⚠️ 未配置 MIMO_API_KEY）'}`);
  console.log(`  📅 ICS 订阅代理       GET  /api/fetch-ics`);
  console.log(`  ❤️  健康检查           GET  /api/health`);
  console.log(line);
  for (const ip of localIPs()) console.log(`  📱 局域网访问         http://${ip}:${PORT}/`);
  if (!hasKey) {
    console.log('  ⚠️  未找到 API Key：请在 .env 里填 MIMO_API_KEY=sk-xxx 后重启，');
    console.log('      否则四个模块的 AI 功能都会提示"服务端未配置密钥"。');
  }
  console.log(line);
});
