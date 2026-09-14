/* ========================================
   情绪回忆录模块
   负责日总结、周总结、AI 生成分析
   ======================================== */

const EmotionDiary = {
  containerId: 'diary-section',
  summaries: [],

  /**
   * 初始化
   */
  init() {
    this.loadData();
  },

  /**
   * 加载数据
   */
  loadData() {
    this.summaries = StorageManager.load('emotion_summaries') || [];
  },

  /**
   * 保存数据
   */
  saveData() {
    StorageManager.save('emotion_summaries', this.summaries);
  },

  /**
   * 获取今天的情绪数据摘要
   */
  getTodaySummaryData() {
    const today = formatDate(new Date());
    const records = EmotionRecorder.records.filter(r => formatDate(r.timestamp) === today);

    if (records.length === 0) return null;

    const moods = records.map(r => r.mood);
    const avgMood = moods.reduce((a, b) => a + b, 0) / moods.length;
    const locations = [...new Set(records.map(r => EmotionRecorder.getLocationName(r.locationId)))];
    const notes = records.filter(r => r.note).map(r => r.note);
    const moodDist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    records.forEach(r => { moodDist[r.mood]++; });

    return {
      date: today,
      dateCN: formatDateCN(new Date()),
      totalRecords: records.length,
      avgMood: avgMood.toFixed(1),
      locations,
      notes,
      moodDistribution: moodDist,
      firstMood: records.length > 0 ? records[records.length - 1].mood : null,
      lastMood: records.length > 0 ? records[0].mood : null
    };
  },

  /**
   * 获取本周的情绪数据摘要
   */
  getWeekSummaryData() {
    const { start, end } = getWeekRange();
    const records = EmotionRecorder.records.filter(r => {
      const d = formatDate(r.timestamp);
      return d >= start && d <= end;
    });

    if (records.length === 0) return null;

    const moods = records.map(r => r.mood);
    const avgMood = moods.reduce((a, b) => a + b, 0) / moods.length;

    // 按天分组
    const dailyData = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = formatDate(d);
      dailyData[dateStr] = records.filter(r => formatDate(r.timestamp) === dateStr);
    }

    // 每日平均
    const dailyAvg = {};
    Object.keys(dailyData).forEach(date => {
      const dayRecords = dailyData[date];
      if (dayRecords.length > 0) {
        dailyAvg[date] = dayRecords.reduce((s, r) => s + r.mood, 0) / dayRecords.length;
      }
    });

    const locations = [...new Set(records.map(r => EmotionRecorder.getLocationName(r.locationId)))];
    const allNotes = records.filter(r => r.note).map(r => r.note);

    return {
      startDate: start,
      endDate: end,
      totalRecords: records.length,
      avgMood: avgMood.toFixed(1),
      dailyAvg,
      locations,
      notes: allNotes.slice(0, 10),
      records
    };
  },

  /**
   * AI 生成日总结
   */
  async generateDailySummary() {
    const data = this.getTodaySummaryData();
    if (!data) {
      return '今天还没有记录心情哦，去地图上点击一个地点开始记录吧！✨';
    }

    const moodLabels = { 5: '开心', 4: '平静', 3: '一般', 2: '焦虑', 1: '低落' };

    const messages = [
      {
        role: 'system',
        content: '你是一个温暖有趣的情绪日记助手。请用轻松活泼的语气，为用户生成一份日情绪总结。要融入幽默感和温暖的建议。用第二人称"你"来对话。'
      },
      {
        role: 'user',
        content: `请为我生成今天的情绪日总结：

日期：${data.dateCN}
今天记录了 ${data.totalRecords} 次心情
平均情绪指数：${data.avgMood}/5
去过的地点：${data.locations.join('、')}
情绪分布：${Object.entries(data.moodDistribution).map(([k, v]) => v > 0 ? `${moodLabels[k]}×${v}` : '').filter(Boolean).join('，')}
心情备注：${data.notes.length > 0 ? data.notes.join('；') : '无'}
情绪变化趋势：${data.firstMood ? `从${moodLabels[data.firstMood]}到${moodLabels[data.lastMood]}` : '保持稳定'}

请生成一份200-250字的日总结，包含：
1. 今日情绪回顾（用生动的语言描述）
2. 一句有趣的点评
3. 一个温暖的建议或鼓励
4. 可以适当使用 emoji 表情`
      }
    ];

    try {
      const result = await callAI(messages, { temperature: 0.9 });
      this.saveDailySummary(data.date, result);
      return result;
    } catch (error) {
      return this.getFallbackDailySummary(data);
    }
  },

  /**
   * AI 生成周总结
   */
  async generateWeeklySummary() {
    const data = this.getWeekSummaryData();
    if (!data) {
      return '本周还没有记录心情哦，开始记录你的情绪之旅吧！🌟';
    }

    const moodLabels = { 5: '开心', 4: '平静', 3: '一般', 2: '焦虑', 1: '低落' };

    // 构建每日摘要
    const dailySummary = Object.entries(data.dailyAvg)
      .map(([date, avg]) => {
        const d = new Date(date);
        const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
        const nearestMood = Math.round(avg);
        return `${dayNames[dayOfWeek - 1]}：${moodLabels[nearestMood] || '无记录'}(${avg.toFixed(1)})`;
      })
      .join('，');

    const messages = [
      {
        role: 'system',
        content: '你是一个温暖有趣的情绪分析助手。请用轻松活泼的语气，为用户生成一份周情绪总结报告。要善于发现规律，给出有洞察力的分析和实用建议。用第二人称"你"来对话。'
      },
      {
        role: 'user',
        content: `请为我生成本周的情绪周总结：

本周时间：${data.startDate} ~ ${data.endDate}
本周共记录 ${data.totalRecords} 次心情
平均情绪指数：${data.avgMood}/5
去过的地点：${data.locations.join('、')}
每日情绪：${dailySummary}
本周心情备注：${data.notes.length > 0 ? data.notes.join('；') : '无'}

请生成一份300-400字的周总结，包含：
1. 本周情绪概览（用数据说话）
2. 情绪规律发现（哪天最好/最差，在哪里最开心/最低落）
3. 3条有趣的建议（基于数据给出具体可行的建议）
4. 一句温暖的下周寄语
5. 适当使用 emoji 表情，让总结更生动`
      }
    ];

    try {
      const result = await callAI(messages, { temperature: 0.9 });
      this.saveWeeklySummary(data.startDate, data.endDate, result);
      return result;
    } catch (error) {
      return this.getFallbackWeeklySummary(data);
    }
  },

  /**
   * 保存日总结
   */
  saveDailySummary(date, content) {
    const summary = {
      id: generateId('summary'),
      type: 'daily',
      date,
      content,
      createdAt: Date.now()
    };
    this.summaries.push(summary);
    this.saveData();
  },

  /**
   * 保存周总结
   */
  saveWeeklySummary(startDate, endDate, content) {
    const summary = {
      id: generateId('summary'),
      type: 'weekly',
      startDate,
      endDate,
      content,
      createdAt: Date.now()
    };
    this.summaries.push(summary);
    this.saveData();
  },

  /**
   * 获取历史总结
   */
  getSummaries(type) {
    return this.summaries
      .filter(s => s.type === type)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  /**
   * AI 调用失败时的兜底日总结
   */
  getFallbackDailySummary(data) {
    const moodLabels = { 5: '😊 开心', 4: '😌 平静', 3: '😐 一般', 2: '😟 焦虑', 1: '😢 低落' };
    const avgMood = parseFloat(data.avgMood);

    let summary = `📅 **${data.dateCN} 情绪回顾**\n\n`;
    summary += `今天你在 ${data.locations.join('、')} 等地方记录了 ${data.totalRecords} 次心情。\n\n`;

    if (avgMood >= 4) {
      summary += '☀️ 今天心情不错呢！继续保持这份好心情吧～\n';
    } else if (avgMood >= 3) {
      summary += '⛅ 今天情绪比较平稳，平淡也是一种幸福呢。\n';
    } else {
      summary += '🌧️ 今天似乎有些低落，没关系，明天又是新的一天！\n';
    }

    summary += '\n💡 **小建议**：多去让你开心的地方走走，保持好心情哦！✨';
    return summary;
  },

  /**
   * AI 调用失败时的兜底周总结
   */
  getFallbackWeeklySummary(data) {
    const avgMood = parseFloat(data.avgMood);

    let summary = `📊 **本周情绪总结** (${data.startDate} ~ ${data.endDate})\n\n`;
    summary += `本周共记录 ${data.totalRecords} 次心情，平均情绪指数 ${data.avgMood}/5。\n\n`;
    summary += `📍 本周去过的地点：${data.locations.join('、')}\n\n`;

    if (avgMood >= 4) {
      summary += '🎉 本周整体心情很棒！看来你的校园生活过得很充实呢～\n';
    } else if (avgMood >= 3) {
      summary += '🌈 本周情绪比较平稳，偶尔有些小波动也是正常的。\n';
    } else {
      summary += '💪 本周可能有些辛苦，但请相信，低谷之后一定是高峰！\n';
    }

    summary += '\n🌟 **下周寄语**：记得多关注自己的情绪变化，好好照顾自己哦！';
    return summary;
  },

  /**
   * 渲染总结卡片
   */
  renderSummaryCard(summary) {
    const dateText = summary.type === 'daily'
      ? formatDateCN(summary.date)
      : `${summary.startDate} ~ ${summary.endDate}`;
    const typeLabel = summary.type === 'daily' ? '📅 日总结' : '📊 周总结';

    return `
      <div class="summary-card card">
        <div class="summary-header">
          <span class="summary-type">${typeLabel}</span>
          <span class="summary-date">${dateText}</span>
        </div>
        <div class="summary-content">
          ${this.formatMarkdown(summary.content)}
        </div>
      </div>
    `;
  },

  /**
   * 简单的 Markdown 格式化
   */
  formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }
};
