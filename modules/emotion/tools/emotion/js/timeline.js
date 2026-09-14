/* ========================================
   情绪时间轴模块
   像朋友圈一样滑动浏览历史情绪记录
   支持关键词搜索 + 心情筛选
   ======================================== */

const EmotionTimeline = {
  containerId: 'timeline-section',
  pageSize: 7,
  currentPage: 0,
  searchKeyword: '',
  moodFilter: null,   // null = 全部；1-5 = 指定心情

  /**
   * 初始化
   */
  init() {
    this.render();
  },

  /**
   * 按日期分组记录
   */
  groupByDate(records) {
    const groups = {};
    records.forEach(r => {
      const date = formatDate(r.timestamp);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(r);
    });

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  },

  /**
   * 应用搜索和筛选
   */
  getFilteredRecords() {
    let records = EmotionRecorder.records.slice();

    // 心情筛选
    if (this.moodFilter !== null) {
      records = records.filter(r => r.mood === this.moodFilter);
    }

    // 关键词搜索（备注 / 地点名）
    const kw = this.searchKeyword.trim().toLowerCase();
    if (kw) {
      records = records.filter(r => {
        const note = (r.note || '').toLowerCase();
        const locName = EmotionRecorder.getLocationName(r.locationId).toLowerCase();
        return note.includes(kw) || locName.includes(kw);
      });
    }

    return records.sort((a, b) => b.timestamp - a.timestamp);
  },

  /**
   * 渲染时间轴
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const allCount = EmotionRecorder.records.length;

    // 完全无数据
    if (allCount === 0) {
      container.innerHTML = `
        <div class="timeline-empty">
          <div class="timeline-empty-icon">📝</div>
          <p>还没有情绪记录</p>
          <p class="timeline-empty-hint">点击地图上的地点，开始记录你的心情吧！</p>
        </div>
      `;
      return;
    }

    const filtered = this.getFilteredRecords();
    const grouped = this.groupByDate(filtered);
    const totalPages = Math.max(1, Math.ceil(grouped.length / this.pageSize));

    if (this.currentPage >= totalPages) this.currentPage = totalPages - 1;
    if (this.currentPage < 0) this.currentPage = 0;

    const pageData = grouped.slice(
      this.currentPage * this.pageSize,
      (this.currentPage + 1) * this.pageSize
    );

    const isFiltering = this.searchKeyword.trim() !== '' || this.moodFilter !== null;

    container.innerHTML = `
      <div class="timeline-header">
        <h3 class="timeline-title">🕐 情绪时间轴</h3>
        <div class="timeline-pagination">
          <button class="btn-sm btn-secondary" ${this.currentPage === 0 ? 'disabled' : ''}
                  id="timeline-prev">← 上一页</button>
          <span class="timeline-page-info">${this.currentPage + 1} / ${totalPages}</span>
          <button class="btn-sm btn-secondary" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''}
                  id="timeline-next">下一页 →</button>
        </div>
      </div>

      <!-- 搜索与筛选 -->
      <div class="timeline-filters">
        <div class="timeline-search">
          <span class="search-icon">🔍</span>
          <input type="text" class="timeline-search-input" id="timeline-search"
                 placeholder="搜索备注或地点..." value="${this.escapeAttr(this.searchKeyword)}">
          ${this.searchKeyword ? '<button class="search-clear" id="timeline-search-clear">✕</button>' : ''}
        </div>
        <div class="timeline-mood-chips">
          <button class="mood-chip ${this.moodFilter === null ? 'active' : ''}" data-mood="all">全部</button>
          ${EmotionRecorder.moods.map(m => `
            <button class="mood-chip ${this.moodFilter === m.level ? 'active' : ''}"
                    data-mood="${m.level}" title="${m.label}">
              <img src="${m.img}" alt="${m.label}">
            </button>
          `).join('')}
        </div>
      </div>

      ${isFiltering ? `
        <div class="timeline-filter-summary">
          找到 <strong>${filtered.length}</strong> 条记录
          ${this.moodFilter !== null ? `· 心情：${this.getMoodLabel(this.moodFilter)}` : ''}
        </div>
      ` : ''}

      ${filtered.length === 0 ? `
        <div class="timeline-empty">
          <div class="timeline-empty-icon">🔍</div>
          <p>没有找到匹配的记录</p>
          <p class="timeline-empty-hint">试试换个关键词，或点「全部」清除筛选</p>
        </div>
      ` : `
        <div class="timeline-container">
          <div class="timeline-line"></div>
          ${pageData.map(([date, records]) => this.renderDayGroup(date, records)).join('')}
        </div>
      `}
    `;

    this.bindPagination(totalPages);
    this.bindFilters();
  },

  /**
   * HTML 属性转义
   */
  escapeAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  /**
   * 获取心情标签
   */
  getMoodLabel(level) {
    const m = EmotionRecorder.moods.find(x => x.level === level);
    return m ? m.label : '';
  },

  /**
   * 渲染一天的记录组
   */
  renderDayGroup(dateStr, records) {
    const d = new Date(dateStr);
    const dateCN = formatDateCN(d);
    const avgMood = records.reduce((s, r) => s + r.mood, 0) / records.length;
    const moodInfo = this.getMoodInfo(avgMood);
    const todayStr = typeof MockDate !== 'undefined' ? formatDate(MockDate.getDate()) : formatDate(new Date());
    const isToday = dateStr === todayStr;

    return `
      <div class="timeline-day ${isToday ? 'is-today' : ''}">
        <div class="timeline-dot" style="background: ${moodInfo.cssColor}"></div>
        <div class="timeline-card card">
          <div class="timeline-card-header">
            <span class="timeline-date">${isToday ? '📌 今天' : dateCN}</span>
            <span class="timeline-avg-mood" style="color: ${moodInfo.cssColor}">
              ${avgMood.toFixed(1)} · ${moodInfo.label}
            </span>
          </div>
          <div class="timeline-records">
            ${records.map(r => this.renderRecord(r)).join('')}
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 渲染单条记录
   */
  renderRecord(record) {
    const mood = EmotionRecorder.moods.find(m => m.level === record.mood);
    const locName = EmotionRecorder.getLocationName(record.locationId);
    const time = new Date(record.timestamp);
    const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

    return `
      <div class="timeline-record">
        ${mood ? `<img class="timeline-record-img" src="${mood.img}" alt="${mood.label}">` : '<span class="timeline-record-emoji">❓</span>'}
        <div class="timeline-record-info">
          <span class="timeline-record-location">📍 ${locName}</span>
          <span class="timeline-record-time">${timeStr}</span>
        </div>
        ${record.note ? `<span class="timeline-record-note">"${this.escapeAttr(record.note)}"</span>` : ''}
        <button class="timeline-record-del" data-id="${record.id}" title="删除这条记录">🗑️</button>
      </div>
    `;
  },

  /**
   * 获取情绪信息
   */
  getMoodInfo(mood) {
    if (mood >= 4.5) return { emoji: '😊', label: '开心', cssColor: '#51CF66' };
    if (mood >= 3.5) return { emoji: '😌', label: '平静', cssColor: '#4A90D9' };
    if (mood >= 2.5) return { emoji: '😐', label: '一般', cssColor: '#FFD43B' };
    if (mood >= 1.5) return { emoji: '😟', label: '焦虑', cssColor: '#FF922B' };
    return { emoji: '😢', label: '低落', cssColor: '#FF6B6B' };
  },

  /**
   * 绑定搜索与筛选
   */
  bindFilters() {
    const searchInput = document.getElementById('timeline-search');
    const clearBtn = document.getElementById('timeline-search-clear');

    if (searchInput) {
      // 保持焦点
      searchInput.addEventListener('input', (e) => {
        this.searchKeyword = e.target.value;
        this.currentPage = 0;
        this.render();
        // 重新聚焦并把光标放到末尾
        const newInput = document.getElementById('timeline-search');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(newInput.value.length, newInput.value.length);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.searchKeyword = '';
        this.currentPage = 0;
        this.render();
      });
    }

    // 心情筛选标签
    const chips = document.querySelectorAll('.mood-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.mood;
        this.moodFilter = val === 'all' ? null : parseInt(val);
        this.currentPage = 0;
        this.render();
      });
    });

    // 删除单条记录
    const delBtns = document.querySelectorAll('.timeline-record-del');
    delBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (confirm('确定要删除这条情绪记录吗？')) {
          EmotionRecorder.deleteRecord(id);
          this.render();
          showToast('已删除该条记录');
        }
      });
    });
  },

  /**
   * 绑定分页事件
   */
  bindPagination(totalPages) {
    const prevBtn = document.getElementById('timeline-prev');
    const nextBtn = document.getElementById('timeline-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentPage > 0) {
          this.currentPage--;
          this.render();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.currentPage < totalPages - 1) {
          this.currentPage++;
          this.render();
        }
      });
    }
  },

  /**
   * 刷新
   */
  refresh() {
    this.currentPage = 0;
    this.render();
  }
};
