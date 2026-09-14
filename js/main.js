/* ============================================================
   CampusVerse · 双界校园 —— 主网页交互脚本
   职责：站点名注入 / 标语打字机 / 导航滚动态 / 滚动渐入 / 模块入口跳转
   ============================================================ */
(() => {
  'use strict';

  /** 是否被系统设置为"减少动态效果"（无障碍） */
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. 站点名注入：config 改一处，全站生效 ---------- */
  document.title = `${SITE_NAME_EN} · ${SITE_NAME_CN}`;
  document.querySelectorAll('[data-site-name-en]').forEach(el => {
    el.textContent = SITE_NAME_EN;
  });
  document.querySelectorAll('[data-site-name-cn]').forEach(el => {
    el.textContent = SITE_NAME_CN;
  });

  /* ---------- 2. Hero 标语打字机 ---------- */
  const tw = document.getElementById('typewriter');
  if (tw) {
    if (REDUCED_MOTION) {
      tw.textContent = SITE_SLOGAN; // 无障碍模式下直接显示全文
    } else {
      let i = 0;
      const timer = setInterval(() => {
        tw.textContent += SITE_SLOGAN[i++];
        if (i >= SITE_SLOGAN.length) clearInterval(timer);
      }, 120);
    }
  }

  /* ---------- 3. 导航栏：滚出 Hero 后加白底 ---------- */
  const nav = document.getElementById('nav');
  const onScroll = () => {
    nav.classList.toggle('nav-scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* 窄屏汉堡菜单 */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });
  // 点任意链接后收起菜单
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => navLinks.classList.remove('open'));
  });

  /* ---------- 4. 滚动渐入（IntersectionObserver，触发一次即止） ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if (REDUCED_MOTION || !('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(el => io.observe(el));
  }

  /* ---------- 5. Toast 气泡 ---------- */
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  const showToast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  };

  /* ---------- 6. 模块入口按钮：读 config，未接入弹提示，绝不死链 ---------- */
  document.querySelectorAll('.enter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.module;
      const url = (MODULE_ENTRY[key] || '').trim();

      if (!url || url.startsWith('#')) {
        showToast('该模块正在接入中，敬请期待～');
        return;
      }
      if (location.protocol === 'file:') {
        // 双击本地预览时相对路径无意义，避免跳到文件管理器报错页
        showToast('本地预览模式：启动服务器后即可进入该模块');
        return;
      }
      if (MODULE_TARGET === '_blank') {
        window.open(url, '_blank');
      } else {
        location.href = url;
      }
    });
  });
})();
