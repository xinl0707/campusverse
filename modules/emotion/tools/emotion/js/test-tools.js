/* ========================================
   测试工具模块
   提供日期跳转和数据恢复功能
   ======================================== */

const TestTools = {
  _backupData: null,
  _isTesting: false,

  /**
   * 初始化
   */
  init() {
    this._backupData = null;
    this._isTesting = false;
    this.render();
    this.bindEvents();
  },

  /**
   * 渲染测试工具栏
   */
  render() {
    const container = document.getElementById('test-tools');
    if (!container) return;

    container.innerHTML = `
      <div class="test-toolbar">
        <div class="test-toolbar-title">🧪 测试工具</div>

        <div class="test-date-display">
          <span class="test-date-label">当前日期</span>
          <span class="test-date-value" id="test-current-date">${formatDateCN(MockDate.getDate())}</span>
          <span class="test-date-badge" id="test-mode-badge" style="display:none">测试中</span>
        </div>

        <div class="test-actions">
          <button class="btn-sm btn-secondary" id="test-prev-day" title="回到昨天">⬅️ 昨天</button>
          <button class="btn-sm btn-primary" id="test-next-day" title="跳到明天">明天 ➡️</button>
          <button class="btn-sm btn-secondary" id="test-jump-3" title="跳3天">+3天</button>
          <button class="btn-sm btn-secondary" id="test-jump-7" title="跳7天">+7天</button>
        </div>

        <div class="test-actions">
          <button class="btn-sm btn-danger" id="test-backup" title="备份当前数据">💾 备份数据</button>
          <button class="btn-sm btn-secondary" id="test-restore" title="恢复备份数据" disabled>🔄 恢复数据</button>
          <button class="btn-sm btn-secondary" id="test-reset-date" title="回到今天">📅 回到今天</button>
          <button class="btn-sm btn-danger" id="test-reset-all" title="清除所有数据">🗑️ 清除全部</button>
        </div>

        <div class="test-actions">
          <button class="btn-sm btn-secondary" id="test-preview-ach" title="预览成就解锁特效">🏆 预览成就特效</button>
          <button class="btn-sm btn-secondary" id="test-replay-intro" title="重播开场动画">🎬 重播开场</button>
          <button class="btn-sm btn-secondary" id="test-preview-comfort" title="预览安慰弹幕">💗 预览安慰弹幕</button>
          <button class="btn-sm btn-secondary" id="test-preview-finale" title="预览爱心烟花">🎆 预览爱心烟花</button>
        </div>
      </div>
    `;
  },

  /**
   * 绑定事件
   */
  bindEvents() {
    // 昨天
    const prevBtn = document.getElementById('test-prev-day');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        MockDate.prevDay();
        this.updateDateDisplay();
        this.refreshAll();
        showToast(`📅 回到 ${formatDateCN(MockDate.getDate())}`);
      });
    }

    // 明天
    const nextBtn = document.getElementById('test-next-day');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        MockDate.nextDay();
        this.updateDateDisplay();
        this.refreshAll();
        showToast(`📅 跳到 ${formatDateCN(MockDate.getDate())}`);
      });
    }

    // 跳3天
    const jump3Btn = document.getElementById('test-jump-3');
    if (jump3Btn) {
      jump3Btn.addEventListener('click', () => {
        MockDate.jumpTo(MockDate.getOffset() + 3);
        this.updateDateDisplay();
        this.refreshAll();
        showToast(`📅 跳到 ${formatDateCN(MockDate.getDate())}`);
      });
    }

    // 跳7天
    const jump7Btn = document.getElementById('test-jump-7');
    if (jump7Btn) {
      jump7Btn.addEventListener('click', () => {
        MockDate.jumpTo(MockDate.getOffset() + 7);
        this.updateDateDisplay();
        this.refreshAll();
        showToast(`📅 跳到 ${formatDateCN(MockDate.getDate())}`);
      });
    }

    // 备份数据
    const backupBtn = document.getElementById('test-backup');
    if (backupBtn) {
      backupBtn.addEventListener('click', () => {
        this.backup();
      });
    }

    // 恢复数据
    const restoreBtn = document.getElementById('test-restore');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => {
        this.restore();
      });
    }

    // 回到今天
    const resetDateBtn = document.getElementById('test-reset-date');
    if (resetDateBtn) {
      resetDateBtn.addEventListener('click', () => {
        MockDate.reset();
        this.updateDateDisplay();
        this.refreshAll();
        showToast('📅 已回到今天');
      });
    }

    // 清除全部
    const resetAllBtn = document.getElementById('test-reset-all');
    if (resetAllBtn) {
      resetAllBtn.addEventListener('click', () => {
        const info = this.getDataSummary();
        const msg =
          '⚠️ 确定要清除所有数据吗？\n\n' +
          '将删除：\n' +
          `· ${info.records} 条情绪记录\n` +
          `· ${info.locations} 个自定义地点\n` +
          '· 所有 AI 总结与成就进度\n\n' +
          '此操作不可恢复！';
        if (confirm(msg)) {
          this.resetAll();
        }
      });
    }

    // 预览成就特效
    const previewAchBtn = document.getElementById('test-preview-ach');
    if (previewAchBtn) {
      previewAchBtn.addEventListener('click', () => {
        const defs = Achievements.definitions;
        const pick = defs[Math.floor(Math.random() * defs.length)];
        Achievements.playUnlockEffect(pick, () => {});
      });
    }

    // 重播开场动画
    const replayIntroBtn = document.getElementById('test-replay-intro');
    if (replayIntroBtn) {
      replayIntroBtn.addEventListener('click', () => {
        if (typeof IntroAnimation === 'undefined' || !IntroAnimation.replay()) {
          showToast('开场动画不可重播，请刷新页面');
        }
      });
    }

    // 预览安慰弹幕
    const previewComfortBtn = document.getElementById('test-preview-comfort');
    if (previewComfortBtn) {
      previewComfortBtn.addEventListener('click', () => {
        if (typeof ComfortExperience === 'undefined') return;
        ComfortExperience.show(1, { name: '教学楼' });
      });
    }

    // 预览爱心烟花收尾
    const previewFinaleBtn = document.getElementById('test-preview-finale');
    if (previewFinaleBtn) {
      previewFinaleBtn.addEventListener('click', () => {
        if (typeof ComfortFinale === 'undefined') return;
        ComfortFinale.stop();
        setTimeout(() => ComfortFinale.play(), 60);
      });
    }
  },

  /**
   * 更新日期显示
   */
  updateDateDisplay() {
    const dateEl = document.getElementById('test-current-date');
    const badgeEl = document.getElementById('test-mode-badge');
    if (dateEl) {
      dateEl.textContent = formatDateCN(MockDate.getDate());
    }
    if (badgeEl) {
      badgeEl.style.display = MockDate.isTestMode() ? 'inline-block' : 'none';
    }
  },

  /**
   * 刷新所有模块（重新从 localStorage 载入并重绘）
   */
  refreshAll() {
    // 1. 重新载入各模块内存数据
    if (typeof EmotionRecorder !== 'undefined') EmotionRecorder.loadData();
    if (typeof EmotionDiary !== 'undefined') EmotionDiary.loadData();
    if (typeof Achievements !== 'undefined') Achievements.loadData();

    // 2. 地图（内部会 reload locations + emotions，并重绘）
    if (typeof CampusMap !== 'undefined') {
      CampusMap.selectedLocation = null;
      CampusMap.refresh();
    }

    // 3. 重绘各个视图
    if (typeof EmotionTimeline !== 'undefined') EmotionTimeline.refresh();
    if (typeof ExpressionWall !== 'undefined') ExpressionWall.render();
    if (typeof Achievements !== 'undefined') Achievements.render();

    // 4. 回忆录图表 + 清空 AI 总结展示区
    if (typeof EmotionCharts !== 'undefined') {
      EmotionCharts.drawWeeklyTrend('weekly-trend-chart');

      const now = typeof MockDate !== 'undefined' ? MockDate.getDate() : new Date();
      const todayDist = EmotionRecorder.getDayMoodDistribution(formatDate(now));
      EmotionCharts.drawMoodDistribution('today-distribution', todayDist);
      EmotionCharts.drawLocationComparison('location-comparison');
    }

    const dailyDisplay = document.getElementById('daily-summary-display');
    const weeklyDisplay = document.getElementById('weekly-summary-display');
    if (dailyDisplay) dailyDisplay.innerHTML = '';
    if (weeklyDisplay) weeklyDisplay.innerHTML = '';

    // 5. 关闭可能残留的弹窗
    const celebrate = document.getElementById('emotion-celebrate');
    if (celebrate) celebrate.classList.remove('active');
    const unlock = document.getElementById('achievement-unlock');
    if (unlock) unlock.classList.remove('active');
  },

  /**
   * 备份所有情绪数据
   */
  backup() {
    this._backupData = {
      emotion_records: StorageManager.load('emotion_records'),
      emotion_custom_locations: StorageManager.load('emotion_custom_locations'),
      emotion_summaries: StorageManager.load('emotion_summaries'),
      emotion_achievements: StorageManager.load('emotion_achievements'),
      mockDateOffset: MockDate.getOffset(),
      timestamp: Date.now()
    };

    const restoreBtn = document.getElementById('test-restore');
    if (restoreBtn) restoreBtn.disabled = false;

    const info = this.getDataSummary();
    showToast(`💾 已备份 ${info.records} 条记录`);
    console.log('📦 数据备份完成:', this._backupData);
  },

  /**
   * 获取当前数据摘要（用于提示文案）
   */
  getDataSummary() {
    const records = StorageManager.load('emotion_records') || [];
    const locations = StorageManager.load('emotion_custom_locations') || [];
    return { records: records.length, locations: locations.length };
  },

  /**
   * 恢复备份数据
   */
  restore() {
    if (!this._backupData) {
      showToast('⚠️ 还没有备份过数据');
      return;
    }

    if (!confirm('确定要恢复到备份时的数据吗？\n当前所有记录将被覆盖。')) return;

    // 写回 localStorage
    StorageManager.save('emotion_records', this._backupData.emotion_records || []);
    StorageManager.save('emotion_custom_locations', this._backupData.emotion_custom_locations || []);
    StorageManager.save('emotion_summaries', this._backupData.emotion_summaries || []);
    StorageManager.save('emotion_achievements', this._backupData.emotion_achievements || []);

    // 恢复日期偏移
    MockDate.jumpTo(this._backupData.mockDateOffset || 0);
    this.updateDateDisplay();

    // 关键：重新载入内存 + 重绘所有视图
    this.refreshAll();

    const info = this.getDataSummary();
    showToast(`🔄 已恢复 ${info.records} 条记录`);
    console.log('✅ 数据恢复完成');
  },

  /**
   * 清除所有数据
   */
  resetAll() {
    // 1. 停止可能正在播放的成就动画
    if (typeof Achievements !== 'undefined') {
      if (Achievements._unlockClose) {
        Achievements._unlockClose();
        Achievements._unlockClose = null;
      }
      Achievements._unlockQueue = [];
      Achievements._unlockPlaying = false;
      Achievements._unlockToken++;
    }

    // 2. 清除 localStorage 中的情绪模块数据
    const keys = Object.keys(localStorage).filter(k => k.startsWith('tools_emotion'));
    keys.forEach(k => localStorage.removeItem(k));
    console.log('🗑️ 已清除存储键:', keys);

    // 3. 清空各模块的内存状态（关键：否则下次保存会把旧数据写回去）
    if (typeof EmotionRecorder !== 'undefined') {
      EmotionRecorder.records = [];
      EmotionRecorder.currentLocation = null;
    }

    if (typeof CampusMap !== 'undefined') {
      CampusMap.locations = CampusMap.presetLocations.slice();
      CampusMap.emotions = [];
      CampusMap.selectedLocation = null;
      CampusMap.dragLocation = null;
      CampusMap.isDragging = false;
      CampusMap.isPanning = false;
      CampusMap.view = { scale: 1, x: 0, y: 0 };
    }

    if (typeof EmotionDiary !== 'undefined') EmotionDiary.summaries = [];
    if (typeof Achievements !== 'undefined') {
      Achievements.achievements = [];
      Achievements._unlockQueue = [];
      Achievements._showingUnlock = false;
    }
    if (typeof EmotionTimeline !== 'undefined') {
      EmotionTimeline.searchKeyword = '';
      EmotionTimeline.moodFilter = null;
      EmotionTimeline.currentPage = 0;
    }

    // 4. 重置测试用日期
    MockDate.reset();
    this.updateDateDisplay();

    // 5. 备份也随之失效，避免"恢复"把已清的数据救回来
    this._backupData = null;
    const restoreBtn = document.getElementById('test-restore');
    if (restoreBtn) restoreBtn.disabled = true;

    // 6. 重绘所有视图
    this.refreshAll();

    showToast('🗑️ 所有数据已清除');
    console.log('✅ 数据清除完成');
  }
};
