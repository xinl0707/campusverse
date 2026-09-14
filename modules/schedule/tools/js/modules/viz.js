/**
 * 数据可视化模块
 * 提供雷达图、统计卡片等可视化组件
 */
const ScheduleViz = {
  /** 当前查看的周次（学期总周数可在设置中调整） */
  weekState: { current: 1, total: 20 },
  _weekGridRerender: null,

  /**
   * 创建雷达图维度分析
   * @param {Object} data - 可视化数据
   * @param {HTMLElement} container - 容器元素
   */
  /**
   * 紧凑五维雷达图
   */
  createRadarChart(data, container) {
    if (!container || !data || !data.radarData) return;
    container.innerHTML = '';

    const { labels, values } = data.radarData;
    const cssW = Math.min(container.clientWidth || 660, 660);
    const cssH = 340;                       // 再大一圈，字和形状都更好认

    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const cx = cssW / 2;
    const cy = cssH / 2 + 4;
    const R = Math.min(cssW / 2 - 92, cssH / 2 - 44);
    const n = labels.length;
    const angle = i => (Math.PI * 2 / n) * i - Math.PI / 2;
    const pt = (i, r) => ({ x: cx + Math.cos(angle(i)) * r, y: cy + Math.sin(angle(i)) * r });

    // 网格环
    ctx.strokeStyle = '#e6e9f2';
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring++) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const p = pt(i % n, R * ring / 4);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // 轴线
    for (let i = 0; i < n; i++) {
      const p = pt(i, R);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke();
    }

    // 数据多边形
    ctx.beginPath();
    values.forEach((v, i) => {
      const p = pt(i, R * Math.max(0, Math.min(100, v)) / 100);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, 'rgba(102,126,234,.42)');
    grad.addColorStop(1, 'rgba(118,75,162,.20)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 顶点 + 标签 + 数值
    ctx.textBaseline = 'middle';
    values.forEach((v, i) => {
      const p = pt(i, R * Math.max(0, Math.min(100, v)) / 100);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#667eea'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

      const lp = pt(i, R + 26);
      ctx.fillStyle = '#4a5268';
      ctx.font = '14.5px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = Math.abs(lp.x - cx) < 12 ? 'center' : (lp.x > cx ? 'left' : 'right');
      ctx.fillText(labels[i], lp.x, lp.y);

      ctx.fillStyle = v >= 70 ? '#e04a4a' : (v >= 45 ? '#e08a00' : '#2fa36b');
      ctx.font = 'bold 13.5px system-ui, sans-serif';
      ctx.fillText(String(Math.round(v)), lp.x, lp.y + 18);
    });
  },

  /**
   * 绘制雷达图网格
   */
  drawRadarGrid(ctx, center, radius, divisions) {
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    for (let i = 1; i <= divisions; i++) {
      const r = (radius / divisions) * i;
      ctx.beginPath();
      ctx.arc(center, center, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  /**
   * 绘制雷达图数据区域
   */
  drawRadarArea(ctx, values, center, radius) {
    const maxVal = 100;
    const angleStep = (Math.PI * 2) / values.length;

    ctx.fillStyle = 'rgba(102, 126, 234, 0.2)';
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;

    ctx.beginPath();
    values.forEach((value, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const r = (value / maxVal) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 绘制数据点
    values.forEach((value, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const r = (value / maxVal) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#667eea';
      ctx.fill();
    });
  },

  /**
   * 绘制雷达图标签
   */
  drawRadarLabels(ctx, labels, center, radius) {
    ctx.font = '14px PingFang SC';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const angleStep = (Math.PI * 2) / labels.length;

    labels.forEach((label, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const x = center + (radius + 30) * Math.cos(angle);
      const y = center + (radius + 30) * Math.sin(angle);

      ctx.fillStyle = '#718096';
      ctx.fillText(label, x, y);
    });
  },

  /**
   * 创建统计卡片
   * @param {Array} stats - 统计数据数组
   * @param {HTMLElement} container - 容器元素
   */
  createStatCards(stats, container) {
    container.innerHTML = '';

    stats.forEach(stat => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `
        <div class="stat-value">${stat.value}</div>
        <div class="stat-label">${stat.label}</div>
      `;
      container.appendChild(card);
    });
  },

  /**
   * 判断课程在指定周次是否发生
   */
  isCourseInWeek(course, week) {
    const wt = course.weekType || '每周';
    const anchor = parseInt(course.startWeek) || 1;
    if (wt === '单周') return week % 2 === 1;
    if (wt === '双周') return week % 2 === 0;
    if (wt === '隔周') return (week - anchor) % 2 === 0;
    return true;
  },

  /**
   * 综合判断：周次奇偶 + 持续周数（短期课程）
   */
  isCourseVisibleInWeek(course, week) {
    if (!this.isCourseInWeek(course, week)) return false;
    const start = parseInt(course.startWeek) || 1;
    const dur = parseInt(course.durationWeeks) || 20;
    return week >= start && week <= start + dur - 1;
  },

  /**
   * 统计某周每门课的节数（同名课程合并为一门）
   */
  /** 同一门课同一天同一时段只留一条（数据层万一没清洗时的兜底） */
  uniqueCourses(list) {
    const seen = new Set();
    return (list || []).filter(c => {
      const k = `${String(c.name || '').replace(/\s+/g, '')}|${c.day}|${c.startTime}|${c.endTime}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  },

  countSessionsByCourse(courses, week) {
    const map = new Map();
    for (const c of this.uniqueCourses(courses)) {
      if (!this.isCourseVisibleInWeek(c, week)) continue;
      const key = (c.name || '未命名').trim();
      const item = map.get(key) || { name: key, count: 0, hours: 0, teacher: c.teacher, location: c.location };
      item.count += 1;
      item.hours += this.durationInHours(c);
      map.set(key, item);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  },

  durationInHours(course) {
    const s = this.toMin(course.startTime), e = this.toMin(course.endTime);
    return Math.max(0, (e - s)) / 60;
  },

  toMin(t) {
    const [h, m] = String(t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  },

  /**
   * 时间轴课表（星期为列、时间向下、每节课一个大色块）
   * @param {Array} courses
   * @param {HTMLElement} container
   * @param {Object} opts { week, onEdit, onDelete, compact, showToolbar, onChangeWeek }
   */
  createWeekGrid(courses, container, opts = {}) {
    const week = opts.week || this.weekState.current;
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const palette = [
      'linear-gradient(135deg,#667eea,#764ba2)',
      'linear-gradient(135deg,#f093fb,#f5576c)',
      'linear-gradient(135deg,#4facfe,#00f2fe)',
      'linear-gradient(135deg,#43e97b,#38f9d7)',
      'linear-gradient(135deg,#fa709a,#fee140)',
      'linear-gradient(135deg,#30cfd0,#330867)',
      'linear-gradient(135deg,#a8edea,#fed6e3)',
      'linear-gradient(135deg,#ff9a9e,#fecfef)',
      'linear-gradient(135deg,#5ee7df,#b490ca)',
      'linear-gradient(135deg,#f6d365,#fda085)'
    ];
    const colorOf = (name) => {
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
      return palette[h % palette.length];
    };

    // 渲染前的最后一道保险：同一门课同一天、同一时段只画一个模块
    const visible = this.uniqueCourses(courses.filter(c => this.isCourseVisibleInWeek(c, week)));

    // ---- 顶部工具条：周次切换 + 每门课节数统计 ----
    const stats = this.countSessionsByCourse(courses, week);
    const totalSessions = stats.reduce((s, x) => s + x.count, 0);
    const totalHours = stats.reduce((s, x) => s + x.hours, 0);

    const toolbar = `
      <div class="tg-toolbar">
        <div class="tg-weeknav">
          <button class="tg-nav" onclick="ScheduleViz.changeWeek(-1)" ${week <= 1 ? 'disabled' : ''}>◀</button>
          <select class="tg-weekselect" onchange="ScheduleViz.setWeek(this.value)">
            ${Array.from({ length: this.weekState.total }, (_, i) =>
              `<option value="${i + 1}" ${i + 1 === week ? 'selected' : ''}>第 ${i + 1} 周</option>`).join('')}
          </select>
          <button class="tg-nav" onclick="ScheduleViz.changeWeek(1)" ${week >= this.weekState.total ? 'disabled' : ''}>▶</button>
          <span class="tg-summary">${totalSessions} 节 · ${totalHours.toFixed(1)} 小时</span>
        </div>
        <div class="tg-chips">
          ${stats.map(s => `<span class="tg-chip" title="${s.name}">${s.name} <b>×${s.count}</b></span>`).join('')
            || '<span class="tg-chip tg-chip-empty">这周没有课 🎉</span>'}
        </div>
      </div>`;

    if (visible.length === 0) {
      container.innerHTML = `
        ${toolbar}
        <div class="tg-empty">
          <div style="font-size:40px;">🌴</div>
          <div>第 ${week} 周没有安排课程</div>
          <div style="font-size:12px;opacity:.7;">切换上方周次查看其他周</div>
        </div>`;
      this.bindWeekGridEvents(container, opts);
      this.registerGridHook(container, opts, courses);
      return;
    }

    // ---- 计算时间范围 ----
    let minT = Math.min(...visible.map(c => this.toMin(c.startTime)));
    let maxT = Math.max(...visible.map(c => this.toMin(c.endTime)));
    minT = Math.min(Math.floor(minT / 30) * 30, this.toMin('08:00'));
    maxT = Math.max(Math.ceil(maxT / 30) * 30, this.toMin('12:00'));

    const slots = Math.round((maxT - minT) / 30);
    // 行高自适应：尽量让整表在一屏内看完，不出现垂直滚动
    const budget = opts.compact ? 480 : 620;
    const rowH = Math.max(16, Math.min(34, budget / slots));
    const gridH = slots * rowH;

    // ---- 每个星期列内部：重叠课程分道 ----
    const buildDayCol = (day) => {
      const list = visible.filter(c => c.day === day).sort((a, b) => this.toMin(a.startTime) - this.toMin(b.startTime));
      if (list.length === 0) {
        return `<div class="tg-col"><div class="tg-free">空闲</div></div>`;
      }
      // 贪心分道：同一时间重叠的课程并排显示
      const laneEnds = [];
      list.forEach(c => {
        const s = this.toMin(c.startTime);
        let lane = laneEnds.findIndex(e => e <= s);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = this.toMin(c.endTime);
        c._lane = lane;
      });
      const laneCount = laneEnds.length;

      return `<div class="tg-col">${list.map(c => {
        const top = (this.toMin(c.startTime) - minT) / 30 * rowH;
        const h = Math.max(rowH * 0.9, (this.toMin(c.endTime) - this.toMin(c.startTime)) / 30 * rowH - 3);
        const w = 100 / laneCount;
        const left = c._lane * w;
        const nm = (c.name || '未命名').trim();
        const short = nm.length > 9 ? nm.slice(0, 8) + '…' : nm;
        const tall = h >= 44;
        const badge = c.weekType && c.weekType !== '每周' ? `<span class="tg-badge">${c.weekType}</span>` : '';
        // 学分：填了才显示，没填不占位
        const cr = Number(c.credits) > 0 ? `<span class="tg-cr">${Number(c.credits)}学分</span>` : '';
        return `
          <button class="tg-block" data-id="${c.id}" title="${nm}&#10;${dayNames[day - 1]} ${c.startTime}-${c.endTime}&#10;${c.location || ''}${c.teacher ? ' · ' + c.teacher : ''}&#10;第${c.startWeek || 1}-${(c.startWeek || 1) + (c.durationWeeks || 16) - 1}周${Number(c.credits) > 0 ? ' · ' + c.credits + ' 学分' : ''}"
                  style="top:${top}px; height:${h}px; left:calc(${left}% + 2px); width:calc(${w}% - 4px); background:${colorOf(nm)};">
            <span class="tg-name">${short}</span>${cr}
            ${tall ? `<span class="tg-time">${c.startTime}-${c.endTime}</span>
                      <span class="tg-loc">${c.location || ''}</span>` : ''}
            ${badge}
          </button>`;
      }).join('')}</div>`;
    };

    // ---- 左侧时间刻度 ----
    let gutter = '';
    for (let i = 0; i <= slots; i += 2) {
      const t = minT + i * 30;
      const hh = String(Math.floor(t / 60)).padStart(2, '0');
      const mm = String(t % 60).padStart(2, '0');
      gutter += `<div class="tg-tick" style="top:${i * rowH}px;"><span>${hh}:${mm}</span></div>`;
    }

    container.innerHTML = `
      ${toolbar}
      <div class="tg-wrap" style="--tg-rowh:${rowH}px;">
        <div class="tg-gutter" style="height:${gridH}px;">${gutter}</div>
        <div class="tg-main" style="height:${gridH}px;">
          <div class="tg-head">${dayNames.map(d => `<div class="tg-headcell">${d}</div>`).join('')}</div>
          <div class="tg-body" style="height:${gridH - 26}px;">
            ${[1, 2, 3, 4, 5, 6, 7].map(buildDayCol).join('')}
          </div>
        </div>
      </div>`;

    this.bindWeekGridEvents(container, opts);
    this.registerGridHook(container, opts, courses);
  },

  /**
   * 登记周次切换重绘钩子（编辑弹窗与分析弹窗可同时存活）
   */
  registerGridHook(container, opts, courses) {
    if (opts.noWeekHook) return;
    this._gridHooks = (this._gridHooks || []).filter(h => h.el !== container);
    this._gridHooks.push({
      el: container,
      run: () => {
        if (!document.body.contains(container)) return false;      // 弹窗已关闭
        const fresh = (opts.getSource && opts.getSource()) || courses;
        // 不锁定 week：跟随 weekState.current，才能实现周次翻页
        this.createWeekGrid(fresh, container, { ...opts, week: undefined, noWeekHook: false });
        return true;
      }
    });
  },

  setWeek(w) {
    this.weekState.current = parseInt(w) || 1;
    this._gridHooks = (this._gridHooks || []).filter(h => document.body.contains(h.el));
    this._gridHooks.forEach(h => h.run());
  },

  changeWeek(delta) {
    const next = Math.min(this.weekState.total, Math.max(1, this.weekState.current + delta));
    this.setWeek(next);
  },

  bindWeekGridEvents(container, opts) {
    container.querySelectorAll('.tg-block').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (opts.onEdit) opts.onEdit(id);
      });
    });
  },

  /**
   * 创建课表日历视图（旧接口，转发到周课表渲染器）
   */
  createCalendarView(courses, container) {
    const paint = () => {
      const data = (window.ScheduleManager && ScheduleManager.getAllCourses().length > 0)
        ? ScheduleManager.getAllCourses()
        : courses;
      this.createWeekGrid(data, container, {
        week: this.weekState.current,
        onEdit: (id) => { if (window.ScheduleApp) ScheduleApp.showEditCourseModal(id); }
      });
    };
    paint();
  },

  /**
   * 创建风险提示卡片
   * @param {Array} risks - 风险分析数组
   * @param {HTMLElement} container - 容器元素
   */
  createRiskCards(risks, container) {
    container.innerHTML = '';

    if (risks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">🎉</div>
        <div class="empty-state-title">作息良好</div>
        <div class="empty-state-text">目前没有发现明显的作息风险</div>
      `;
      container.appendChild(empty);
      return;
    }

    risks.forEach(risk => {
      const card = document.createElement('div');
      card.className = 'card';

      let icon = 'ℹ️';
      let bgColor = 'bg-gradient-8';
      let textColor = 'var(--text-main)';

      switch (risk.severity) {
        case 'danger':
          icon = '⚠️';
          bgColor = 'bg-gradient-2';
          textColor = 'white';
          break;
        case 'warning':
          icon = '🔶';
          bgColor = 'bg-gradient-5';
          textColor = 'white';
          break;
        case 'info':
          icon = 'ℹ️';
          bgColor = 'bg-gradient-3';
          textColor = 'white';
          break;
      }

      card.innerHTML = `
        <div class="card-header">
          <div class="card-title">
            <span>${icon}</span>
            <span>${risk.label}</span>
          </div>
          <span class="badge badge-${risk.severity}">${risk.severity === 'danger' ? '高' : risk.severity === 'warning' ? '中' : '低'}风险</span>
        </div>
        <div class="card-body" style="color:${textColor}">${risk.description}</div>
      `;

      container.appendChild(card);
    });
  },

  /**
   * 创建特殊模式徽章列表
   * @param {Array} patterns - 特殊模式数组
   * @param {HTMLElement} container - 容器元素
   */
  createPatternTags(patterns, container) {
    container.innerHTML = '';

    patterns.forEach(pattern => {
      const tag = document.createElement('span');
      tag.className = `tag tag-${pattern.severity === 'warning' ? 'warning' : 'info'}`;

      let icon = '📅';
      if (pattern.type === 'singleWeek') icon = '单周';
      else if (pattern.type === 'doubleWeek') icon = '双周';
      else if (pattern.type === 'shortTerm') icon = '⏰';
      else if (pattern.type === 'everyOtherWeek') icon = '间隔';

      tag.innerHTML = `<strong>${icon}</strong> ${pattern.description}`;
      container.appendChild(tag);
    });
  },

  /**
   * 生成完整的数据可视化面板
   * @param {Object} analysisResult - 分析结果
   * @returns {string} HTML 字符串
   */
  generateVisualizationPanel(analysisResult) {
    const { visualizationData, specialPatterns, scheduleRisks, fragmentTime } = analysisResult;

    return `
      <!-- 概览统计 -->
      <div class="grid grid-cols-4" style="margin-bottom: 24px;">
        <div class="stat-card">
          <div class="stat-value">${visualizationData.totalHours}h</div>
          <div class="stat-label">每周课时</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${visualizationData.totalCourses}</div>
          <div class="stat-label">课程总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${fragmentTime.totalFragmentDays}天</div>
          <div class="stat-label">碎片天数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${specialPatterns.length}种</div>
          <div class="stat-label">特殊模式</div>
        </div>
      </div>

      <!-- 雷达图 -->
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <div class="card-title">📊 维度分析雷达图</div>
        </div>
        <div id="radarChart" style="height: 300px;"></div>
      </div>

      <!-- 课表日历 -->
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <div class="card-title">📅 本周课表</div>
        </div>
        <div id="calendarView"></div>
      </div>

      <!-- 风险提示 -->
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <div class="card-title">⚡ 作息风险评估</div>
        </div>
        <div id="riskContainer"></div>
      </div>

      <!-- 特殊模式 -->
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <div class="card-title">🔍 特殊上课模式</div>
        </div>
        <div id="patternContainer"></div>
      </div>

      <!-- 碎片时间建议 -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">💡 学习建议</div>
        </div>
        <div class="card-body">${fragmentTime.overallSuggestion}</div>
      </div>
    `;
  }
};

window.ScheduleViz = ScheduleViz;
