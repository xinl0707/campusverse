/* ========================================
   情绪模块主逻辑入口
   负责初始化、页面导航、各模块协调
   ======================================== */

const EmotionApp = {
  currentTab: 'map',
  _renderToken: 0,
  _aiTimers: {},

  /**
   * 初始化应用
   */
  init() {
    console.log('🎓 情绪地图模块初始化中...');

    try {
      // 初始化各模块
      EmotionRecorder.init();
      LocationManager.init();
      EmotionDiary.init();
      Achievements.init();
      TestTools.init();

      // 初始化地图
      CampusMap.init('map-container');

      // 绑定导航事件
      this.bindNavigation();

      // 绑定添加地点按钮
      this.bindAddLocation();

      // 绑定总结按钮
      this.bindSummaryButtons();

      // 渲染初始页面
      this.switchTab('map');

      // 检查成就
      Achievements.checkAll(EmotionRecorder.records);

      console.log('✅ 情绪地图模块初始化完成');
    } catch (error) {
      console.error('❌ 初始化失败:', error);
    }
  },

  /**
   * 绑定导航事件
   */
  bindNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === this.currentTab) return;
        this.switchTab(tab);
      });
    });
  },

  /**
   * 切换标签页
   * @param {string} tab - 标签名
   */
  switchTab(tab) {
    this.currentTab = tab;
    this._renderToken++;
    const token = this._renderToken;

    // 更新导航按钮状态
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // 隐藏所有内容区
    document.querySelectorAll('.tab-content').forEach(el => {
      el.style.display = 'none';
    });

    // 显示目标内容区（重播入场动画）
    const target = document.getElementById(`tab-${tab}`);
    if (target) {
      target.style.display = 'block';
      target.classList.remove('tab-enter');
      // 强制重排以重启动画
      void target.offsetWidth;
      target.classList.add('tab-enter');
    }

    // 重内容（图表）先显示骨架，下一帧再渲染真实内容，避免切换卡顿感
    const heavyTabs = ['diary', 'wall', 'achievements'];
    if (heavyTabs.includes(tab)) {
      this.showTabSkeleton(tab);
      requestAnimationFrame(() => {
        // 若期间又切走了，放弃渲染
        if (token !== this._renderToken) return;
        this.renderTabContent(tab);
      });
    } else {
      this.renderTabContent(tab);
    }
  },

  /**
   * 渲染标签页真实内容
   */
  renderTabContent(tab) {
    switch (tab) {
      case 'map':
        CampusMap.render();
        break;
      case 'timeline':
        EmotionTimeline.refresh();
        break;
      case 'diary':
        this.renderDiaryTab();
        break;
      case 'wall':
        ExpressionWall.render();
        break;
      case 'achievements':
        Achievements.render();
        break;
    }
  },

  /**
   * 显示标签页骨架屏
   */
  showTabSkeleton(tab) {
    if (tab === 'diary') {
      // 三个图表区域先占位，避免切换时出现空白
      const s = this.skeletonCard(180);
      ['weekly-trend-chart', 'today-distribution', 'location-comparison'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = s;
      });
      return;
    }

    const host = document.getElementById(
      tab === 'wall' ? 'expression-wall-section' : 'achievements-section'
    );
    if (host) {
      host.innerHTML = `<div class="tab-skeleton" id="tab-skeleton">${this.skeletonCard(200)}</div>`;
    }
  },

  /**
   * 骨架卡片
   */
  skeletonCard(h) {
    return `
      <div class="skeleton-card" style="min-height:${h}px">
        <div class="skeleton-line w40"></div>
        <div class="skeleton-line w80"></div>
        <div class="skeleton-line w60"></div>
      </div>
    `;
  },

  /**
   * 移除骨架屏
   */
  clearSkeleton() {
    const sk = document.getElementById('tab-skeleton');
    if (sk) sk.remove();
  },

  /**
   * 渲染回忆录标签页
   */
  renderDiaryTab() {
    const container = document.getElementById('tab-diary');
    if (!container) return;

    // 渲染图表
    EmotionCharts.drawWeeklyTrend('weekly-trend-chart');

    const now = typeof MockDate !== 'undefined' ? MockDate.getDate() : new Date();
    const today = formatDate(now);
    const todayDist = EmotionRecorder.getDayMoodDistribution(today);
    EmotionCharts.drawMoodDistribution('today-distribution', todayDist);
    EmotionCharts.drawLocationComparison('location-comparison');

    this.clearSkeleton();
  },

  /**
   * 绑定添加地点按钮
   */
  bindAddLocation() {
    const addBtn = document.getElementById('add-location-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        LocationManager.showAddModal();
      });
    }
  },

  /**
   * 绑定总结按钮
   */
  bindSummaryButtons() {
    // 日总结按钮
    const dailyBtn = document.getElementById('generate-daily-btn');
    if (dailyBtn) {
      dailyBtn.addEventListener('click', () => {
        this.runSummary({
          btn: dailyBtn,
          btnLabel: '📅 生成今日总结',
          displayId: 'daily-summary-display',
          type: 'daily',
          skeletonTitle: '正在回顾你今天的情绪…',
          generate: () => EmotionDiary.generateDailySummary(),
          onDone: (summary) => EmotionDiary.renderSummaryCard({
            type: 'daily',
            date: formatDate(typeof MockDate !== 'undefined' ? MockDate.getDate() : new Date()),
            content: summary,
            createdAt: Date.now()
          }),
          toast: '日总结已生成 ✨'
        });
      });
    }

    // 周总结按钮
    const weeklyBtn = document.getElementById('generate-weekly-btn');
    if (weeklyBtn) {
      weeklyBtn.addEventListener('click', () => {
        this.runSummary({
          btn: weeklyBtn,
          btnLabel: '📊 生成本周总结',
          displayId: 'weekly-summary-display',
          type: 'weekly',
          skeletonTitle: '正在分析你这一周的情绪…',
          generate: () => EmotionDiary.generateWeeklySummary(),
          onDone: (summary) => EmotionDiary.renderSummaryCard({
            type: 'weekly',
            startDate: getWeekRange().start,
            endDate: getWeekRange().end,
            content: summary,
            createdAt: Date.now()
          }),
          toast: '周总结已生成 📊'
        });
      });
    }
  },

  /**
   * 执行一次 AI 总结（含骨架屏 + 进度文案）
   */
  async runSummary(opts) {
    const { btn, btnLabel, displayId, type, skeletonTitle, generate, onDone, toast } = opts;
    const display = document.getElementById(displayId);

    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> 生成中…';

    // 显示骨架屏 + 轮播进度文案
    if (display) {
      display.innerHTML = this.aiSkeletonHTML(type, skeletonTitle);
    }
    this.startProgressTicker(displayId, type);

    let ok = true;
    try {
      const summary = await generate();
      if (display) display.innerHTML = onDone(summary);
      showToast(toast);
    } catch (error) {
      ok = false;
      if (display) {
        display.innerHTML = `
          <div class="ai-error-card">
            <div class="ai-error-icon">😥</div>
            <div class="ai-error-title">生成失败</div>
            <div class="ai-error-desc">AI 暂时无法连接，请稍后再试</div>
            <button class="btn-secondary btn-sm" onclick="document.getElementById('${displayId}').innerHTML=''">
              关闭
            </button>
          </div>
        `;
      }
      showToast('生成失败，请稍后重试 😥');
    } finally {
      this.stopProgressTicker(displayId);
      btn.disabled = false;
      btn.textContent = btnLabel;
    }

    return ok;
  },

  /**
   * AI 骨架屏 HTML
   */
  aiSkeletonHTML(type, title) {
    const label = type === 'daily' ? '📅 日总结' : '📊 周总结';
    return `
      <div class="summary-card skeleton-summary">
        <div class="summary-header">
          <span class="summary-type">${label}</span>
          <span class="ai-progress-text" data-progress>${title}</span>
        </div>
        <div class="skeleton-line w90"></div>
        <div class="skeleton-line w100"></div>
        <div class="skeleton-line w75"></div>
        <div class="skeleton-line w85"></div>
        <div class="skeleton-line w50"></div>
      </div>
    `;
  },

  /**
   * 轮播进度文案，缓解等待焦虑
   */
  startProgressTicker(displayId, type) {
    const steps = type === 'daily'
      ? ['正在回顾你今天的情绪…', '正在整理你走过的地方…', '正在给你写一句悄悄话…', '马上就好啦…']
      : ['正在分析你这一周的情绪…', '正在寻找你的情绪规律…', '正在准备有趣的小建议…', '马上就好啦…'];

    let i = 0;
    const display = document.getElementById(displayId);

    const tick = () => {
      const el = display ? display.querySelector('[data-progress]') : null;
      if (el) {
        i = (i + 1) % steps.length;
        el.style.opacity = '0';
        setTimeout(() => {
          el.textContent = steps[i];
          el.style.opacity = '1';
        }, 150);
      }
    };

    this._aiTimers[displayId] = setInterval(tick, 2200);
  },

  /**
   * 停止进度文案轮播
   */
  stopProgressTicker(displayId) {
    if (this._aiTimers[displayId]) {
      clearInterval(this._aiTimers[displayId]);
      delete this._aiTimers[displayId];
    }
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  EmotionApp.init();
});
