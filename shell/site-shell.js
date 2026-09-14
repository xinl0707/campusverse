/* ============================================================================
   CampusVerse · 双界校园 —— 模块页统一外壳脚本
   ----------------------------------------------------------------------------
   由 server.js 注入到四个模块的入口页。职责：
     1. 在全页模式（非 iframe）下渲染左边缘导航条，可一键回总站 / 切换到别的模块
     2. 被工作台 iframe 嵌入时自动隐藏（工作台自带顶部导航，避免两套导航打架）
     3. 所有链接用 target="_top"，即使未隐藏也不会把总站塞进 iframe 里

   纯原生 JS，无依赖，不污染模块自身的全局变量。
   ============================================================================ */
(() => {
  'use strict';

  // 被 iframe 嵌入（工作台）时不渲染，交给工作台顶部导航
  if (window.self !== window.top) return;
  if (window.__cvShellMounted) return;
  window.__cvShellMounted = true;

  /** 站点目录（与 server.js 的 MOUNTS / MODULE_HOME 保持一致） */
  const HOME = '/';
  const WORKBENCH = '/workbench/';
  const MODULES = [
    { key: 'simulator', icon: '🎮', name: '大学模拟器', path: '/simulator/simulator/' },
    { key: 'emotion',   icon: '🗺️', name: '情绪地图',   path: '/emotion/tools/emotion/' },
    { key: 'schedule',  icon: '💣', name: '课表排雷',   path: '/schedule/tools/' },
    { key: 'diary',     icon: '📝', name: '日记帮写',   path: '/diary/tools/' },
  ];

  /** 当前页面属于哪个模块（用前缀匹配） */
  const currentKey = (() => {
    const p = location.pathname;
    const hit = MODULES.find(m => p.startsWith('/' + m.key + '/') || p === '/' + m.key);
    return hit ? hit.key : '';
  })();

  /* ---------------- 构建 DOM ---------------- */

  const rail = document.createElement('div');
  rail.className = 'cvshell-rail';

  const handle = document.createElement('button');
  handle.className = 'cvshell-handle';
  handle.type = 'button';
  handle.setAttribute('aria-label', '展开站点导航');
  handle.innerHTML = '<span class="cvshell-handle-icon">🏫</span><span class="cvshell-handle-text">双界校园</span>';
  rail.appendChild(handle);

  const panel = document.createElement('nav');
  panel.className = 'cvshell-panel';

  const title = document.createElement('div');
  title.className = 'cvshell-title';
  title.innerHTML = 'CampusVerse<b>双界校园 · 站点导航</b>';
  panel.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'cvshell-list';

  const makeItem = (icon, name, href, isCurrent, tag) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'cvshell-item' + (isCurrent ? ' is-current' : '');
    a.href = href;
    a.target = '_top';                     // 非 iframe 场景等价于本页跳转，iframe 场景跳出框架
    a.innerHTML =
      `<span class="cvshell-item-icon">${icon}</span><span>${name}</span>` +
      (tag ? `<span class="cvshell-item-tag">${tag}</span>` : '');
    li.appendChild(a);
    return li;
  };

  list.appendChild(makeItem('🏠', '总站首页', HOME, false, ''));
  list.appendChild(makeItem('🧭', '四合一工作台', WORKBENCH, false, 'NEW'));

  const sep = document.createElement('li');
  sep.className = 'cvshell-sep';
  list.appendChild(sep);

  MODULES.forEach(m => {
    list.appendChild(makeItem(m.icon, m.name, m.path, m.key === currentKey, m.key === currentKey ? '当前' : ''));
  });

  panel.appendChild(list);

  const foot = document.createElement('div');
  foot.className = 'cvshell-foot';
  foot.textContent = 'Esc 收起 · 悬停展开';
  panel.appendChild(foot);

  rail.appendChild(panel);
  document.body.appendChild(rail);

  /* ---------------- 交互 ---------------- */

  let pinned = false;   // 点击把手后固定展开（触屏设备没有 hover）
  const open = () => rail.classList.add('is-open');
  const close = () => { if (!pinned) rail.classList.remove('is-open'); };

  handle.addEventListener('click', (e) => {
    e.stopPropagation();
    pinned = !pinned;
    pinned ? open() : rail.classList.remove('is-open');
  });

  rail.addEventListener('mouseenter', open);
  rail.addEventListener('mouseleave', close);
  rail.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    pinned = false;
    rail.classList.remove('is-open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      pinned = false;
      rail.classList.remove('is-open');
    }
  });

  // 初始给一次轻微提示：页面加载 1.2 秒后自动展开 2 秒，告诉用户这里有导航
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(() => { if (!pinned) open(); }, 1200);
    setTimeout(() => { if (!pinned) rail.classList.remove('is-open'); }, 3400);
  }
})();
