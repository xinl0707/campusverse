#!/usr/bin/env node
/**
 * ============================================================================
 *  CampusVerse · 双界校园 —— 整合后的冒烟测试
 * ----------------------------------------------------------------------------
 *  合并四个组的东西，最容易出的事故不是"页面打不开"，而是：
 *    · 路径少一层 → 某个模块的 CSS/JS/图片静默 404（页面还在，只是变丑/功能哑了）
 *    · 公共资源被别的前缀抢走 → 两个模块共用 /tools/、/common/ 互相覆盖
 *    · 后端源码 / .env 被静态服务原样吐出来
 *  所以这里不只测首页，而是把四个模块的"入口页 + 关键资源"逐个拉一遍，
 *  再验证目录穿越、敏感文件拒绝、Range 音频、AI 代理与 ICS 代理。
 *
 *  用法：
 *    node server.js                 # 先起服务（另开一个终端）
 *    node tests/smoke-test.js       # 默认测 http://localhost:3000
 *    node tests/smoke-test.js --ai  # 额外真调一次 AI（会消耗额度）
 *    node tests/smoke-test.js http://127.0.0.1:8080
 * ============================================================================
 */

'use strict';

const BASE = (process.argv.find(a => /^https?:\/\//.test(a)) || 'http://localhost:3000').replace(/\/+$/, '');
const WITH_AI = process.argv.includes('--ai');

let pass = 0;
let fail = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    fail++;
    failures.push(`${name} → ${err.message}`);
    console.log(`  ❌ ${name} → ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function get(pathname, options = {}) {
  const res = await fetch(BASE + pathname, { redirect: 'manual', ...options });
  return res;
}

async function expectStatus(pathname, status, label) {
  const res = await get(pathname);
  assert(res.status === status,
    `${label || pathname} 期望 HTTP ${status}，实际 ${res.status}`);
  return res;
}

async function expectFile(pathname, { contains, contentType } = {}) {
  const res = await get(pathname);
  assert(res.status === 200, `${pathname} 期望 200，实际 ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (contentType) assert(type.includes(contentType), `${pathname} Content-Type 应为 ${contentType}，实际 ${type}`);
  const len = Number(res.headers.get('content-length') || 0);
  assert(len > 0, `${pathname} 内容长度为 0（空文件或路径错误）`);
  if (contains) {
    const text = await res.text();
    assert(text.includes(contains), `${pathname} 里没有找到关键字「${contains}」`);
    return text;
  }
  // 不读正文时也要把连接收掉，避免 socket 悬挂
  await res.arrayBuffer();
  return null;
}

/* ------------------------------------------------------------------ */

(async function main() {
  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`   CampusVerse 整合冒烟测试  →  ${BASE}`);
  console.log('  ═══════════════════════════════════════════════════════');

  /* ---------- 1. 总站与工作台 ---------- */
  console.log('\n  [1] 总站与工作台');
  await check('主网页 / 可访问且是双界校园落地页', async () => {
    await expectFile('/', { contains: 'CampusVerse', contentType: 'text/html' });
  });
  await check('主网页样式 /css/style.css 可访问', () => expectFile('/css/style.css', { contentType: 'text/css' }));
  await check('主网页脚本 /js/config.js 已指向合并后路径', async () => {
    const t = await expectFile('/js/config.js', { contains: '/simulator/simulator/', contentType: 'javascript' });
    for (const p of ['/emotion/tools/emotion/', '/schedule/tools/', '/diary/tools/']) {
      assert(t.includes(p), `config.js 里缺少入口 ${p}`);
    }
  });
  await check('四合一工作台 /workbench/ 可访问', () => expectFile('/workbench/', { contains: '四合一工作台' }));
  await check('工作台脚本与样式可访问', async () => {
    await expectFile('/workbench/workbench.js');
    await expectFile('/workbench/workbench.css', { contentType: 'text/css' });
  });
  await check('统一外壳脚本/样式可访问', async () => {
    await expectFile('/shell/site-shell.js');
    await expectFile('/shell/site-shell.css', { contentType: 'text/css' });
  });

  /* ---------- 2. 四个模块的入口页 ---------- */
  console.log('\n  [2] 四个模块入口页');
  const ENTRIES = [
    ['模拟器',   '/simulator/simulator/',      '大学录取通知书'],
    ['情绪地图', '/emotion/tools/emotion/',    '校园情绪地图'],
    ['课表排雷', '/schedule/tools/',           '课表智能分析'],
    ['日记帮写', '/diary/tools/',              '日记帮写'],
  ];
  for (const [name, path, keyword] of ENTRIES) {
    await check(`${name} 入口页 ${path}`, async () => {
      const html = await expectFile(path, { contains: keyword, contentType: 'text/html' });
      assert(html.includes('/shell/site-shell.js'),
        '入口页里没有注入统一外壳脚本（server.js 的 ENTRY_PAGES 可能漏了这一页）');
    });
  }
  await check('模块根路径重定向到真实首页', async () => {
    for (const [root, target] of [['/emotion', '/emotion/tools/emotion/'], ['/schedule', '/schedule/tools/'], ['/diary', '/diary/tools/'], ['/simulator', '/simulator/simulator/']]) {
      const res = await get(root);
      assert([301, 302].includes(res.status), `${root} 期望 301/302，实际 ${res.status}`);
      assert(res.headers.get('location') === target, `${root} 重定向目标应为 ${target}，实际 ${res.headers.get('location')}`);
    }
  });

  /* ---------- 3. 各模块关键资源（合并后最容易静默 404 的地方） ---------- */
  console.log('\n  [3] 各模块关键资源（路径一错就白屏/丑版）');
  const ASSETS = [
    ['模拟器 · 公共变量',      '/simulator/common/css/variables.css'],
    ['模拟器 · AI 代理',       '/simulator/common/js/ai-proxy.js'],
    ['模拟器 · 主样式',        '/simulator/simulator/css/sim-style.css'],
    ['模拟器 · 游戏引擎',      '/simulator/simulator/js/game-engine.js'],
    ['模拟器 · 场景图',        '/simulator/simulator/assets/images/01_大学校门入口秋晨.jpg'],

    ['情绪地图 · 公共变量',    '/emotion/common/css/variables.css'],
    ['情绪地图 · 模块样式',    '/emotion/tools/emotion/css/emotion-style.css'],
    ['情绪地图 · 地图逻辑',    '/emotion/tools/emotion/js/map.js'],
    ['情绪地图 · 心情图标',    '/emotion/tools/emotion/assets/happy.png'],
    ['情绪地图 · 建筑素材',    '/emotion/tools/emotion/assets/buildings/library.png'],

    ['课表排雷 · 公共脚本',    '/schedule/common/js/ai-proxy.js'],
    ['课表排雷 · 模块样式',    '/schedule/tools/css/tool-style.css'],
    ['课表排雷 · 主逻辑',      '/schedule/tools/js/app.js'],
    ['课表排雷 · 本地Chart.js','/schedule/tools/js/vendor/chart.umd.min.js'],

    ['日记帮写 · 公共脚本',    '/diary/common/js/ai-proxy.js'],
    ['日记帮写 · 模块样式',    '/diary/tools/css/tool-style.css'],
    ['日记帮写 · 对话逻辑',    '/diary/tools/js/modules/diary.js'],
    ['日记帮写 · 晴天环境音',  '/diary/tools/assets/audio/sunny.wav'],
    ['日记帮写 · 背景音乐',    '/diary/tools/assets/audio/bgm.ogg'],
  ];
  for (const [name, path] of ASSETS) {
    await check(name, () => expectFile(path));
  }
  await check('日记帮写音频路径已改为相对路径（原 /tools/ 绝对路径会 404）', async () => {
    const t = await expectFile('/diary/tools/js/modules/audio.js', { contains: 'assets/audio/sunny.wav' });
    // 只看真实代码，注释里提到旧路径是说明用的，不算问题
    const code = t.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
    assert(!code.includes("'/tools/assets/audio"),
      "audio.js 里仍有 '/tools/assets/audio' 绝对路径，合并后会 404");
  });
  await check('课表排雷不再依赖外部 CDN', async () => {
    const t = await expectFile('/schedule/tools/', { contains: 'js/vendor/chart.umd.min.js' });
    assert(!t.includes('cdn.jsdelivr.net'), 'index.html 仍在引用 jsdelivr CDN，离线演示会挂');
  });

  /* ---------- 4. 安全与健壮性 ---------- */
  console.log('\n  [4] 安全与健壮性');
  await check('后端源码 /server.js 被拒绝（403）', () => expectStatus('/server.js', 403));
  await check('密钥 /\.env 被拒绝（403）', () => expectStatus('/.env', 403));
  await check('模块自带 server.js 被拒绝（403）', () => expectStatus('/modules/simulator/server.js', 403));
  await check('package.json 被拒绝（403）', () => expectStatus('/modules/schedule/package.json', 403));
  await check('目录穿越被拦住', async () => {
    for (const evil of ['/%2e%2e%2f%2e%2e%2fWindows%2fwin.ini', '/modules/..%2f..%2fserver.js', '/..%2f.env']) {
      const res = await get(evil);
      assert([400, 403, 404].includes(res.status), `${evil} 居然返回了 ${res.status}`);
    }
  });
  await check('不存在的路径返回自定义 404 页', async () => {
    const res = await expectStatus('/this-page-does-not-exist', 404);
    const text = await res.text();
    assert(text.includes('双界校园'), '404 页没有站点样式/回首页链接');
  });
  await check('音频支持 Range 请求（拖动进度/循环播放依赖）', async () => {
    const res = await get('/diary/tools/assets/audio/sunny.wav', { headers: { Range: 'bytes=0-1023' } });
    assert(res.status === 206, `期望 206 Partial Content，实际 ${res.status}`);
    assert((res.headers.get('content-range') || '').startsWith('bytes 0-1023/'), '缺少正确的 Content-Range');
    await res.arrayBuffer();
  });
  await check('HEAD 请求正常', async () => {
    const res = await get('/', { method: 'HEAD' });
    assert(res.status === 200, `期望 200，实际 ${res.status}`);
  });

  /* ---------- 5. 接口 ---------- */
  console.log('\n  [5] 接口');
  await check('GET /api/health 返回模块清单与密钥状态', async () => {
    const res = await expectStatus('/api/health', 200);
    const data = await res.json();
    assert(data.status === 'ok', 'health.status 不是 ok');
    assert(Array.isArray(data.modules) && data.modules.length === 4, 'health.modules 应有 4 个模块');
    if (!data.hasKey) console.log('     ⚠️  服务端未检测到 MIMO_API_KEY，AI 功能会提示未配置密钥');
  });
  await check('GET /api/fetch-ics 缺参数时返回 400', () => expectStatus('/api/fetch-ics', 400));
  await check('POST /api/chat 拒绝空 messages（400）', async () => {
    const res = await get('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });
    assert(res.status === 400, `期望 400，实际 ${res.status}`);
    await res.text();
  });
  await check('GET /api/chat 方法不允许（405）', async () => {
    const res = await get('/api/chat');
    assert(res.status === 405, `期望 405，实际 ${res.status}`);
  });

  if (WITH_AI) {
    console.log('\n  [6] 真调一次 AI（--ai）');
    await check('POST /api/chat 非流式返回 content', async () => {
      const res = await get('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '只回复两个字：你好' }],
          max_tokens: 32,
        }),
      });
      const data = await res.json().catch(() => ({}));
      assert(res.status === 200, `期望 200，实际 ${res.status}：${JSON.stringify(data).slice(0, 200)}`);
      assert(typeof data.content === 'string' && data.content.trim().length > 0,
        `返回里没有 content：${JSON.stringify(data).slice(0, 200)}`);
      console.log(`     ↳ AI 回复：${data.content.trim().slice(0, 40)}`);
    });
    await check('POST /api/chat 流式返回 SSE 数据', async () => {
      const res = await get('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '只回复两个字：收到' }],
          max_tokens: 32,
          stream: true,
        }),
      });
      assert(res.status === 200, `期望 200，实际 ${res.status}`);
      const type = res.headers.get('content-type') || '';
      assert(type.includes('text/event-stream'), `期望 SSE，实际 Content-Type ${type}`);
      const text = await res.text();
      assert(text.includes('data:'), '流式响应里没有 data: 分块');
    });
  } else {
    console.log('\n  [6] 跳过真实 AI 调用（加 --ai 参数可启用，会消耗额度）');
  }

  /* ---------- 汇总 ---------- */
  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`   结果：通过 ${pass} 项，失败 ${fail} 项`);
  if (fail) {
    console.log('   失败明细：');
    for (const f of failures) console.log('     · ' + f);
  } else {
    console.log('   🎉 四个模块已全部接入统一服务器，路径与接口均正常。');
  }
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('');
  process.exit(fail ? 1 : 0);
})();
