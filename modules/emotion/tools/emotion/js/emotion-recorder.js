/* ========================================
   情绪记录面板模块
   负责情绪选择、记录、显示
   ======================================== */

const EmotionRecorder = {
  records: [],
  containerId: 'emotion-panel',
  currentLocation: null,

  // 5级情绪配置
  moods: [
    { level: 5, emoji: '😊', label: '开心', color: 'var(--mood-happy)', cssColor: '#51CF66', weather: '☀️', img: 'assets/happy.png' },
    { level: 4, emoji: '😌', label: '平静', color: 'var(--mood-calm)', cssColor: '#4A90D9', weather: '⛅', img: 'assets/calm.png' },
    { level: 3, emoji: '😐', label: '一般', color: 'var(--mood-neutral)', cssColor: '#FFD43B', weather: '🌤️', img: 'assets/nutral.png' },
    { level: 2, emoji: '😟', label: '焦虑', color: 'var(--mood-anxious)', cssColor: '#FF922B', weather: '🌧️', img: 'assets/anxious.png' },
    { level: 1, emoji: '😢', label: '低落', color: 'var(--mood-sad)', cssColor: '#FF6B6B', weather: '⛈️', img: 'assets/sad.png' }
  ],

  /**
   * 初始化
   */
  init() {
    this.loadData();
    this.bindEvents();
  },

  /**
   * 加载数据
   */
  loadData() {
    this.records = StorageManager.load('emotion_records') || [];
  },

  /**
   * 保存数据
   */
  saveData() {
    StorageManager.save('emotion_records', this.records);
  },

  /**
   * 绑定事件
   */
  bindEvents() {
    // 监听地图地点选择事件
    document.addEventListener('locationSelected', (e) => {
      this.currentLocation = e.detail;
      this.showPanel();
    });
  },

  /**
   * 显示记录面板
   */
  showPanel() {
    const panel = document.getElementById(this.containerId);
    if (!panel || !this.currentLocation) return;

    const loc = this.currentLocation;
    panel.innerHTML = this.buildPanelHTML(loc);
    panel.classList.add('active');

    // 绑定情绪选择事件
    this.bindMoodEvents(panel);
  },

  /**
   * 构建面板 HTML
   */
  buildPanelHTML(loc) {
    const recentRecords = this.getRecentRecords(loc.id, 5);

    return `
      <div class="emotion-panel-header">
        <span class="emotion-panel-icon">${loc.icon}</span>
        <div>
          <h3 class="emotion-panel-title">${loc.name}</h3>
          <p class="emotion-panel-desc">${loc.desc || ''}</p>
        </div>
        ${!loc.isPreset ? `<button class="emotion-panel-delete" id="emotion-panel-delete" title="删除此地点">🗑️</button>` : ''}
        <button class="emotion-panel-close" id="emotion-panel-close">✕</button>
      </div>

      <div class="emotion-panel-body">
        <p class="emotion-panel-question">你现在在${loc.name}，心情如何？</p>

        <div class="emotion-choices">
          ${this.moods.map(mood => `
            <button class="emotion-choice-btn" data-level="${mood.level}"
                    style="--mood-color: ${mood.cssColor}">
              <img class="emotion-choice-img" src="${mood.img}" alt="${mood.label}">
              <span class="emotion-choice-label">${mood.label}</span>
              <span class="emotion-choice-weather">${mood.weather}</span>
            </button>
          `).join('')}
        </div>

        <div class="emotion-note-section">
          <textarea class="textarea-field emotion-note-input"
                    placeholder="写点什么...（可选）"
                    rows="3" id="emotion-note"></textarea>
        </div>

        <div class="emotion-date-section">
          <button class="emotion-date-toggle" id="emotion-date-toggle">
            <span>🕐 补记其他时间</span>
            <span class="toggle-arrow">▾</span>
          </button>
          <div class="emotion-date-fields" id="emotion-date-fields" style="display:none;">
            <input type="date" class="input-field emotion-date-input" id="emotion-date">
            <input type="time" class="input-field emotion-time-input" id="emotion-time">
          </div>
        </div>

        <button class="btn-primary emotion-submit-btn" id="emotion-submit" disabled>
          记录心情
        </button>

        ${recentRecords.length > 0 ? `
          <div class="emotion-history">
            <h4>最近记录</h4>
            <div class="emotion-history-list">
              ${recentRecords.map(r => {
                const mood = this.moods.find(m => m.level === r.mood);
                return `
                  <div class="emotion-history-item">
                    <img class="emotion-history-img" src="${mood ? mood.img : ''}" alt=""> 
                    <span class="emotion-history-date">${formatDateCN(r.timestamp)}</span>
                    <span class="emotion-history-note">${r.note || ''}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  /**
   * 绑定情绪选择按钮事件
   */
  bindMoodEvents(panel) {
    let selectedMood = null;

    // 关闭按钮
    const closeBtn = panel.querySelector('#emotion-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        panel.classList.remove('active');
        panel.innerHTML = '';
      });
    }

    // 删除地点按钮（仅自定义地点显示）
    const deleteBtn = panel.querySelector('#emotion-panel-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (!this.currentLocation) return;
        const locName = this.currentLocation.name;
        if (confirm(`确定要删除地点「${locName}」吗？\n相关的情绪记录也会一并删除。`)) {
          // 删除该地点的所有情绪记录
          const locId = this.currentLocation.id;
          this.records = this.records.filter(r => r.locationId !== locId);
          this.saveData();

          // 删除地点
          CampusMap.removeCustomLocation(locId);

          // 关闭面板
          panel.classList.remove('active');
          panel.innerHTML = '';

          showToast(`🗑️ 已删除「${locName}」`);
        }
      });
    }

    // 情绪选择按钮
    const choiceBtns = panel.querySelectorAll('.emotion-choice-btn');
    const submitBtn = panel.querySelector('#emotion-submit');

    choiceBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // 取消之前的选择
        choiceBtns.forEach(b => b.classList.remove('selected'));
        // 选中当前
        btn.classList.add('selected');
        selectedMood = parseInt(btn.dataset.level);
        submitBtn.disabled = false;
      });
    });

    // 补记时间开关
    const dateToggle = panel.querySelector('#emotion-date-toggle');
    const dateFields = panel.querySelector('#emotion-date-fields');
    const dateInput = panel.querySelector('#emotion-date');
    const timeInput = panel.querySelector('#emotion-time');

    if (dateToggle && dateFields) {
      // 默认填入当前日期
      const now = typeof MockDate !== 'undefined' ? MockDate.getDate() : new Date();
      if (dateInput) dateInput.value = formatDate(now);
      if (timeInput) {
        timeInput.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      }

      dateToggle.addEventListener('click', () => {
        const isHidden = dateFields.style.display === 'none';
        dateFields.style.display = isHidden ? 'block' : 'none';
        dateToggle.classList.toggle('expanded', isHidden);
      });
    }

    // 提交按钮
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        if (!selectedMood || !this.currentLocation) return;

        const noteInput = panel.querySelector('#emotion-note');
        const note = noteInput ? noteInput.value.trim() : '';

        // 计算时间戳（支持补记）
        let timestamp = null;
        const fieldsVisible = dateFields && dateFields.style.display !== 'none';
        if (fieldsVisible && dateInput && dateInput.value) {
          const timeStr = (timeInput && timeInput.value) ? timeInput.value : '12:00';
          const dt = new Date(dateInput.value + 'T' + timeStr + ':00');
          if (!isNaN(dt.getTime())) {
            timestamp = dt.getTime();
          }
        }

        this.recordEmotion(this.currentLocation.id, selectedMood, note, timestamp);

        // 关闭侧边面板
        panel.classList.remove('active');
        panel.innerHTML = '';

        // 刷新地图
        if (typeof CampusMap !== 'undefined') {
          CampusMap.refresh();
        }

        // 低落 / 焦虑时，先送上满屏的温暖话语，而不是普通的记录成功弹窗
        if (typeof ComfortExperience !== 'undefined' &&
            ComfortExperience.shouldComfort(selectedMood)) {
          ComfortExperience.show(selectedMood, this.currentLocation);
          return;
        }

        // 其余心情：显示庆祝弹窗
        this.showCelebrate(selectedMood, this.currentLocation);
      });
    }
  },

  /**
   * 显示情绪记录成功弹窗
   * @param {number} mood - 情绪等级 1-5
   * @param {Object} location - 地点对象
   */
  showCelebrate(mood, location) {
    const overlay = document.getElementById('emotion-celebrate');
    if (!overlay) return;

    const moodData = this.moods.find(m => m.level === mood);
    const emoji = document.getElementById('celebrate-emoji');
    const title = document.getElementById('celebrate-title');
    const weather = document.getElementById('celebrate-weather');
    const loc = document.getElementById('celebrate-location');
    const particles = document.getElementById('celebrate-particles');

    if (emoji) {
      const moodData = this.moods.find(m => m.level === mood);
      emoji.innerHTML = moodData ? `<img src="${moodData.img}" alt="${moodData.label}" style="width:64px;height:auto;">` : '😊';
    }
    if (title) title.textContent = this.getCelebrateText(mood);
    if (weather) weather.textContent = moodData ? `${moodData.weather} 今天是${moodData.label}的一天` : '';
    if (loc) loc.textContent = `📍 ${location.name}`;

    // 生成粒子
    if (particles) {
      particles.innerHTML = '';
      this.spawnParticles(particles, mood);
    }

    // 显示弹窗
    overlay.classList.add('active');

    // 点击关闭
    const closeHandler = () => {
      overlay.classList.remove('active');
      overlay.removeEventListener('click', closeHandler);
    };
    // 延迟绑定，避免弹窗自身的点击立即关闭
    setTimeout(() => {
      overlay.addEventListener('click', closeHandler);
    }, 400);
  },

  /**
   * 获取庆祝文案
   */
  getCelebrateText(mood) {
    const texts = {
      5: '太棒了，心情超好！🎉',
      4: '不错哦，心情平静美好 ☁️',
      3: '记录完成，平淡也是真 📝',
      2: '辛苦了，记得照顾好自己 💙',
      1: '没关系，明天会更好的 🌈'
    };
    return texts[mood] || '心情已记录！✨';
  },

  /**
   * 生成粒子效果
   */
  spawnParticles(container, mood) {
    const particlesByMood = {
      5: ['🌟', '✨', '🎉', '💫', '⭐', '🎊'],
      4: ['☁️', '🌤️', '💚', '🍃', '🌸', '💙'],
      3: ['📝', '📌', '🔖', '📎', '✏️', '📋'],
      2: ['💙', '🫂', '🌤️', '🌱', '🍃', '💜'],
      1: ['🌈', '🌻', '💪', '🌱', '🍀', '🤗']
    };
    const emojis = particlesByMood[mood] || particlesByMood[3];
    const count = 10;

    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'celebrate-particle';
      p.textContent = emojis[i % emojis.length];

      // 随机位置（从卡片中心向外扩散）
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const distance = 60 + Math.random() * 40;
      const centerX = 50; // 百分比
      const centerY = 30;
      const pX = centerX + Math.cos(angle) * (distance / 2.6);
      const pY = centerY - Math.sin(angle) * (distance / 3);

      p.style.left = pX + '%';
      p.style.top = pY + '%';
      p.style.animationDelay = (i * 0.06) + 's';
      p.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';

      container.appendChild(p);
    }
  },

  /**
   * 记录一条情绪
   * @param {string} locationId - 地点 ID
   * @param {number} mood - 情绪等级 1-5
   * @param {string} note - 备注
   */
  recordEmotion(locationId, mood, note = '', customTimestamp = null) {
    const record = {
      id: generateId('emo'),
      locationId,
      mood,
      note,
      timestamp: customTimestamp || (typeof MockDate !== 'undefined' ? MockDate.now() : Date.now())
    };

    this.records.push(record);
    this.saveData();

    // 检查成就
    if (typeof Achievements !== 'undefined') {
      Achievements.checkAll(this.records);
    }

    return record;
  },

  /**
   * 获取某个地点的最近 N 条记录
   */
  getRecentRecords(locationId, limit = 5) {
    return this.records
      .filter(r => r.locationId === locationId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  },

  /**
   * 获取今天的记录
   */
  getTodayRecords() {
    const today = formatDate(new Date());
    return this.records
      .filter(r => formatDate(r.timestamp) === today)
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  /**
   * 获取本周的记录
   */
  getWeekRecords() {
    const { start, end } = getWeekRange();
    return this.records
      .filter(r => {
        const d = formatDate(r.timestamp);
        return d >= start && d <= end;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  /**
   * 获取某天的平均情绪
   * @param {string} dateStr - 日期字符串 YYYY-MM-DD
   * @returns {number|null}
   */
  getDayAverage(dateStr) {
    const dayRecords = this.records.filter(r => formatDate(r.timestamp) === dateStr);
    if (dayRecords.length === 0) return null;
    return dayRecords.reduce((sum, r) => sum + r.mood, 0) / dayRecords.length;
  },

  /**
   * 获取某天的情绪分布
   */
  getDayMoodDistribution(dateStr) {
    const dayRecords = this.records.filter(r => formatDate(r.timestamp) === dateStr);
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    dayRecords.forEach(r => { dist[r.mood]++; });
    return dist;
  },

  /**
   * 获取地点名称
   */
  getLocationName(locationId) {
    const loc = CampusMap.locations.find(l => l.id === locationId);
    return loc ? loc.name : '未知地点';
  },

  /**
   * 删除一条记录
   */
  deleteRecord(recordId) {
    this.records = this.records.filter(r => r.id !== recordId);
    this.saveData();
    if (typeof CampusMap !== 'undefined') {
      CampusMap.refresh();
    }
  }
};
