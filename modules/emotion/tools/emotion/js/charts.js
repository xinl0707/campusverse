/* ========================================
   数据可视化模块
   负责情绪趋势图、分布图等图表绘制
   ======================================== */

const EmotionCharts = {
  /**
   * 绘制情绪趋势折线图（周视图）
   * @param {string} containerId - 容器 ID
   */
  drawWeeklyTrend(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { start } = getWeekRange();
    const days = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = formatDate(d);
      const avg = EmotionRecorder.getDayAverage(dateStr);
      const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      days.push({
        label: dayNames[i],
        date: dateStr,
        value: avg
      });
    }

    container.innerHTML = this.buildTrendChartHTML(days, '本周情绪趋势');
  },

  /**
   * 绘制情绪趋势折线图（自定义天数）
   * @param {string} containerId - 容器 ID
   * @param {number} daysCount - 天数
   */
  drawTrend(containerId, daysCount = 7) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const days = [];
    const now = new Date();

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = formatDate(d);
      const avg = EmotionRecorder.getDayAverage(dateStr);
      days.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        date: dateStr,
        value: avg
      });
    }

    container.innerHTML = this.buildTrendChartHTML(days, `${daysCount}天情绪趋势`);
  },

  /**
   * 构建趋势图 HTML
   */
  buildTrendChartHTML(days, title) {
    const maxValue = 5;
    const chartHeight = 180;
    const chartWidth = 100; // 百分比

    // 生成 SVG 折线图
    const points = days.map((d, i) => {
      const x = (i / (days.length - 1 || 1)) * 90 + 5;
      const y = d.value !== null ? (1 - (d.value - 1) / (maxValue - 1)) * 80 + 10 : null;
      return { x, y, ...d };
    });

    const validPoints = points.filter(p => p.y !== null);
    const pathD = validPoints.map((p, i) => {
      const cmd = i === 0 ? 'M' : 'L';
      return `${cmd} ${p.x} ${p.y}`;
    }).join(' ');

    return `
      <div class="chart-container">
        <h4 class="chart-title">${title}</h4>
        <div class="trend-chart">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="trend-svg">
            <!-- 网格线 -->
            <line x1="5" y1="10" x2="95" y2="10" stroke="#eee" stroke-width="0.3"/>
            <line x1="5" y1="30" x2="95" y2="30" stroke="#eee" stroke-width="0.3"/>
            <line x1="5" y1="50" x2="95" y2="50" stroke="#eee" stroke-width="0.3"/>
            <line x1="5" y1="70" x2="95" y2="70" stroke="#eee" stroke-width="0.3"/>
            <line x1="5" y1="90" x2="95" y2="90" stroke="#eee" stroke-width="0.3"/>

            <!-- Y 轴标签 -->
            <text x="2" y="12" font-size="3" fill="#999">5</text>
            <text x="2" y="32" font-size="3" fill="#999">4</text>
            <text x="2" y="52" font-size="3" fill="#999">3</text>
            <text x="2" y="72" font-size="3" fill="#999">2</text>
            <text x="2" y="92" font-size="3" fill="#999">1</text>

            <!-- 折线 -->
            ${pathD ? `<path d="${pathD}" fill="none" stroke="#4A90D9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}

            <!-- 数据点 -->
            ${validPoints.map(p => `
              <circle cx="${p.x}" cy="${p.y}" r="2" fill="#4A90D9" stroke="white" stroke-width="0.8"/>
            `).join('')}
          </svg>
          <div class="trend-labels">
            ${points.map(p => `
              <div class="trend-label-item">
                <span class="trend-day">${p.label}</span>
                <span class="trend-value">${p.value !== null ? p.value.toFixed(1) : '-'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 绘制情绪分布饼图（用 CSS 实现）
   * @param {string} containerId - 容器 ID
   * @param {Object} distribution - { 5: n, 4: n, 3: n, 2: n, 1: n }
   */
  drawMoodDistribution(containerId, distribution) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (total === 0) {
      container.innerHTML = '<p class="no-data">暂无数据</p>';
      return;
    }

    const moods = [
      { level: 5, emoji: '😊', label: '开心', color: '#51CF66' },
      { level: 4, emoji: '😌', label: '平静', color: '#4A90D9' },
      { level: 3, emoji: '😐', label: '一般', color: '#FFD43B' },
      { level: 2, emoji: '😟', label: '焦虑', color: '#FF922B' },
      { level: 1, emoji: '😢', label: '低落', color: '#FF6B6B' }
    ];

    // 用渐变色计算饼图角度
    let cumPercent = 0;
    const gradientParts = [];
    moods.forEach(mood => {
      const count = distribution[mood.level] || 0;
      const percent = (count / total) * 100;
      if (percent > 0) {
        gradientParts.push(`${mood.color} ${cumPercent}% ${cumPercent + percent}%`);
        cumPercent += percent;
      }
    });

    const gradient = gradientParts.length > 0
      ? `conic-gradient(${gradientParts.join(', ')})`
      : `conic-gradient(#eee 0% 100%)`;

    container.innerHTML = `
      <div class="chart-container">
        <h4 class="chart-title">情绪分布</h4>
        <div class="distribution-chart">
          <div class="pie-chart" style="background: ${gradient}"></div>
          <div class="pie-legend">
            ${moods.map(mood => {
              const count = distribution[mood.level] || 0;
              const percent = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
              return `
                <div class="legend-item">
                  <span class="legend-dot" style="background: ${mood.color}"></span>
                  <span class="legend-emoji">${mood.emoji}</span>
                  <span class="legend-label">${mood.label}</span>
                  <span class="legend-value">${count}次 (${percent}%)</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 绘制地点情绪对比图
   * @param {string} containerId - 容器 ID
   */
  drawLocationComparison(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const locationStats = {};
    EmotionRecorder.records.forEach(r => {
      const locName = EmotionRecorder.getLocationName(r.locationId);
      if (!locationStats[locName]) {
        locationStats[locName] = { sum: 0, count: 0 };
      }
      locationStats[locName].sum += r.mood;
      locationStats[locName].count++;
    });

    const locAverages = Object.entries(locationStats)
      .map(([name, stats]) => ({
        name,
        avg: stats.sum / stats.count,
        count: stats.count
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8);

    if (locAverages.length === 0) {
      container.innerHTML = '<p class="no-data">暂无数据</p>';
      return;
    }

    container.innerHTML = `
      <div class="chart-container">
        <h4 class="chart-title">各地点情绪对比</h4>
        <div class="bar-chart">
          ${locAverages.map(loc => {
            const percent = ((loc.avg - 1) / 4) * 100;
            let color = '#51CF66';
            if (loc.avg < 2) color = '#FF6B6B';
            else if (loc.avg < 3) color = '#FF922B';
            else if (loc.avg < 4) color = '#FFD43B';
            else if (loc.avg < 4.5) color = '#4A90D9';

            return `
              <div class="bar-item">
                <span class="bar-label">${loc.name}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: ${percent}%; background: ${color}"></div>
                </div>
                <span class="bar-value">${loc.avg.toFixed(1)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
};
