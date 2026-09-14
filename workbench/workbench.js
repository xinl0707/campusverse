/* ============================================================================
   CampusVerse · 双界校园 —— 四合一工作台脚本
   职责：标签切换 / iframe 加载 / 地址栏 hash 同步 / 快捷键 / AI 状态探测
   ============================================================================ */
(() => {
  'use strict';

  /** 四个模块 → 真实入口路径（必须与 server.js 的 MODULE_HOME 一致） */
  const MODULES = {
    simulator: { name: '大学模拟器', path: '/simulator/simulator/' },
    emotion:   { name: '情绪地图',   path: '/emotion/tools/emotion/' },
    schedule:  { name: '课表排雷',   path: '/schedule/tools/' },
    diary:     { name: '日记帮写',   path: '/diary/tools/' },
  };
  const ORDER = ['simulator', 'emotion', 'schedule', 'diary'];
  const LAST_KEY = 'campusverse_workbench_last';

  const frame    = document.getElementById('wbFrame');
  const loading  = document.getElementById('wbLoading');
  const loadTitle = document.getElementById('wbLoadingTitle');
  const tabs     = Array.from(document.querySelectorAll('.wb-tab'));
  const statusEl = document.getElementById('wbStatus');

  let current = null;

  /* ---------------- 标签切换 ---------------- */

  function activate(key, { updateHash = true } = {}) {
    if (!MODULES[key]) key = ORDER[0];
    if (key === current) return;
    current = key;

    tabs.forEach(t => {
      const on = t.dataset.key === key;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    loadTitle.textContent = `正在进入「${MODULES[key].name}」…`;
    loading.classList.remove('is-hidden');

    // 每次切换都带上时间戳，避免浏览器把上一轮的同名页面拿缓存顶替
    frame.src = MODULES[key].path + '?wb=' + Date.now();

    try { localStorage.setItem(LAST_KEY, key); } catch { /* 隐私模式下忽略 */ }
    if (updateHash) history.replaceState(null, '', '#' + key);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activate(tab.dataset.key));
  });

  frame.addEventListener('load', () => {
    // 首次 load 会在 src 赋值后触发；用 requestAnimationFrame 让遮罩淡出更自然
    requestAnimationFrame(() => setTimeout(() => loading.classList.add('is-hidden'), 160));
  });

  /* ---------------- 首次进入：hash > 上次使用 > 默认 ---------------- */

  const hashKey = (location.hash || '').replace('#', '');
  let initial = MODULES[hashKey] ? hashKey : '';
  if (!initial) {
    try { initial = localStorage.getItem(LAST_KEY) || ''; } catch { initial = ''; }
  }
  activate(MODULES[initial] ? initial : ORDER[0], { updateHash: false });

  // 浏览器前进/后退时同步
  window.addEventListener('hashchange', () => {
    const key = (location.hash || '').replace('#', '');
    if (MODULES[key] && key !== current) activate(key, { updateHash: false });
  });

  /* ---------------- 工具按钮 ---------------- */

  document.getElementById('wbReload').addEventListener('click', () => {
    loading.classList.remove('is-hidden');
    // 加时间戳强制绕开缓存，模块改完代码刷新立刻能看到
    frame.src = MODULES[current].path + '?wb=' + Date.now();
  });

  document.getElementById('wbNewWindow').addEventListener('click', () => {
    window.open(MODULES[current].path, '_blank');
  });

  document.getElementById('wbFullscreen').addEventListener('click', () => {
    const el = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => { /* 用户拒绝则忽略 */ });
    }
  });

  /* ---------------- 快捷键 Alt + 1/2/3/4 ---------------- */

  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const idx = ['1', '2', '3', '4'].indexOf(e.key);
    if (idx > -1) {
      e.preventDefault();
      activate(ORDER[idx]);
    }
  });

  /* ---------------- AI 代理状态探测 ---------------- */

  (async function probe() {
    const set = (state, text, title) => {
      statusEl.dataset.state = state;
      statusEl.querySelector('.wb-status-text').textContent = text;
      statusEl.title = title || text;
    };
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.hasKey) {
        set('ok', 'AI 已就绪', `统一 AI 代理正常 · 模型 ${data.model}`);
      } else {
        set('warn', 'AI 未配置密钥', '服务已启动，但 .env 里缺少 MIMO_API_KEY，AI 功能会提示未配置密钥');
      }
    } catch (err) {
      set('error', '服务不可用', '无法访问 /api/health：' + err.message);
    }
  })();
})();
