/* ========================================
   情绪表情墙模块
   用表情符号拼成视觉化的统计墙
   ======================================== */

const ExpressionWall = {
  containerId: 'expression-wall-section',

  /**
   * 初始化
   */
  init() {
    this.render();
  },

  /**
   * 获取指定时间范围的表情数据
   * @param {string} range - 'week' | 'month' | 'all'
   * @returns {Array}
   */
  getExpressionData(range = 'week') {
    let records;

    if (range === 'week') {
      records = EmotionRecorder.getWeekRecords();
    } else if (range === 'month') {
      const now = new Date();
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      records = EmotionRecorder.records.filter(r => r.timestamp >= monthAgo.getTime());
    } else {
      records = EmotionRecorder.records;
    }

    return records.sort((a, b) => a.timestamp - b.timestamp).map(r => {
      const mood = EmotionRecorder.moods.find(m => m.level === r.mood);
      return mood ? mood.emoji : '❓';
    });
  },

  /**
   * 渲染表情墙
   * @param {string} range - 'week' | 'month' | 'all'
   */
  render(range = 'week') {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const expressions = this.getExpressionData(range);
    const stats = this.getStats(expressions);

    container.innerHTML = `
      <div class="expression-wall-container">
        <div class="expression-wall-header">
          <h3 class="expression-wall-title">🎭 情绪表情墙</h3>
          <div class="expression-range-tabs">
            <button class="range-tab ${range === 'week' ? 'active' : ''}" data-range="week">本周</button>
            <button class="range-tab ${range === 'month' ? 'active' : ''}" data-range="month">本月</button>
            <button class="range-tab ${range === 'all' ? 'active' : ''}" data-range="all">全部</button>
          </div>
        </div>

        ${expressions.length > 0 ? `
          <div class="expression-wall-grid">
            ${expressions.map((emoji, i) => `
              <span class="expression-emoji" style="animation-delay: ${i * 0.05}s"
                    title="第${i + 1}条记录">${emoji}</span>
            `).join('')}
          </div>

          <div class="expression-stats">
            <div class="expression-stat-item">
              <span class="stat-emoji">😊</span>
              <span class="stat-count">${stats.happy}</span>
              <span class="stat-label">开心</span>
            </div>
            <div class="expression-stat-item">
              <span class="stat-emoji">😌</span>
              <span class="stat-count">${stats.calm}</span>
              <span class="stat-label">平静</span>
            </div>
            <div class="expression-stat-item">
              <span class="stat-emoji">😐</span>
              <span class="stat-count">${stats.neutral}</span>
              <span class="stat-label">一般</span>
            </div>
            <div class="expression-stat-item">
              <span class="stat-emoji">😟</span>
              <span class="stat-count">${stats.anxious}</span>
              <span class="stat-label">焦虑</span>
            </div>
            <div class="expression-stat-item">
              <span class="stat-emoji">😢</span>
              <span class="stat-count">${stats.sad}</span>
              <span class="stat-label">低落</span>
            </div>
          </div>

          <div class="expression-summary">
            共 <strong>${expressions.length}</strong> 条记录
            ${stats.mostFrequent ? `，最常见的心情是 <strong>${stats.mostFrequent}</strong>` : ''}
          </div>
        ` : `
          <div class="expression-wall-empty">
            <div class="empty-icon">📝</div>
            <p>还没有表情记录</p>
            <p class="empty-hint">去地图上记录你的心情吧！</p>
          </div>
        `}
      </div>
    `;

    this.bindRangeTabs(container);
  },

  /**
   * 统计表情数据
   */
  getStats(expressions) {
    const stats = { happy: 0, calm: 0, neutral: 0, anxious: 0, sad: 0 };
    const emojiMap = {
      '😊': 'happy',
      '😌': 'calm',
      '😐': 'neutral',
      '😟': 'anxious',
      '😢': 'sad'
    };
    const labelMap = {
      '😊': '😊 开心',
      '😌': '😌 平静',
      '😐': '😐 一般',
      '😟': '😟 焦虑',
      '😢': '😢 低落'
    };

    expressions.forEach(emoji => {
      const key = emojiMap[emoji];
      if (key) stats[key]++;
    });

    // 找出最常见的
    let maxCount = 0;
    let mostFrequent = '';
    Object.entries(stats).forEach(([key, count]) => {
      if (count > maxCount) {
        maxCount = count;
        const emoji = Object.entries(emojiMap).find(([e, k]) => k === key)?.[0] || '';
        mostFrequent = labelMap[emoji] || '';
      }
    });

    return { ...stats, mostFrequent };
  },

  /**
   * 绑定时间范围切换
   */
  bindRangeTabs(container) {
    const tabs = container.querySelectorAll('.range-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const range = tab.dataset.range;
        this.render(range);
      });
    });
  }
};
