/* ========================================
   安慰收尾特效：爱心 + 华丽粒子
   视觉语言与开场动画一致：
     渐变线条描绘 → 填充成形 → 光芒涟漪 → 文字浮现
   在此之上叠加更华丽的粒子层
   ======================================== */

const ComfortFinale = {
  canvasId: 'comfort-finale',
  textId: 'finale-text',

  canvas: null,
  ctx: null,
  dpr: 1,

  // 时间轴（毫秒，相对 startTime）
  T_RAY:    [0, 700],        // 旋转光芒淡入
  T_DRAW:   [180, 1280],     // 心形轮廓描绘
  T_FILL:   [1180, 2050],    // 渐变填充
  T_RING:   1320,            // 光环开始扩散
  T_SPARK:  1450,            // 华丽粒子浮现
  T_BURST:  1700,            // 一次爆发
  T_TEXT:   2050,            // 文字浮现
  FADE_FROM: 3500,
  DURATION: 4900,

  // 配色（与开场动画同源：暖橙 → 玫瑰）
  gradFrom: '#FFC49B',
  gradMid:  '#FF9A9E',
  gradTo:   '#F2708F',

  particleColors: [
    '#FFD86B', '#FFC93C', '#FFC49B', '#FF9A9E',
    '#F2708F', '#FFFFFF', '#FFB3C6', '#E8C4FF'
  ],

  // 运行状态
  sparkles: [],
  minis: [],
  rings: [],
  raf: null,
  startTime: 0,
  token: 0,
  active: false,
  heartCx: 0,
  heartCy: 0,
  heartSize: 0,

  // 精灵图缓存
  _sprites: {},
  _rays: null,

  /* ==================== 生命周期 ==================== */

  play() {
    const canvas = document.getElementById(this.canvasId);
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    this.canvas = canvas;
    this.ctx = ctx;

    // 高清适配（上限 2 倍，兼顾清晰与性能）
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * this.dpr);
    canvas.height = Math.floor(h * this.dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const token = ++this.token;
    this.active = true;

    // 心形几何
    const size = Math.min(w * 0.30, h * 0.27);
    this.heartSize = size;
    this.heartCx = w / 2;
    this.heartCy = h / 2 + size * 0.02;
    this._outlinePts = this._buildOutline(size);

    this.sparkles = [];
    this.minis = [];
    this.rings = [];
    this._burstDone = false;
    this._textShown = false;

    canvas.classList.add('active');
    this._showText(false);

    this.startTime = performance.now();
    this._loop(token);

    return true;
  },

  stop() {
    this.active = false;
    this.token++;

    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }

    if (this.canvas) {
      this.canvas.classList.remove('active');
    }

    this._showText(false);
    this._clearCanvas();
  },

  isActive() {
    return this.active;
  },

  /* ==================== 心形几何 ==================== */

  /**
   * 心脏参数方程 → 归一化坐标
   */
  heartPoint(t, size) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t)
      - 5 * Math.cos(2 * t)
      - 2 * Math.cos(3 * t)
      - Math.cos(4 * t));
    return { x: (x / 17) * size, y: (y / 17) * size };
  },

  /**
   * 生成轮廓采样点，并算出垂直居中偏移
   * （参数方程的心形不以原点为中心，需自行校正）
   */
  _buildOutline(size) {
    const N = 260;
    const pts = [];
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i <= N; i++) {
      const p = this.heartPoint((i / N) * Math.PI * 2, size);
      pts.push(p);
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    this._heartDY = -(minY + maxY) / 2;
    return pts;
  },

  /* ==================== 主循环 ==================== */

  _loop(token) {
    if (!this.active || token !== this.token) return;

    const t = performance.now() - this.startTime;
    this._draw(t);

    if (t < this.DURATION) {
      this.raf = requestAnimationFrame(() => this._loop(token));
    } else {
      this._finish(token);
    }
  },

  /**
   * 播完后的收尾：保留最后一帧整体淡出，然后回到地图
   */
  _finish(token) {
    if (token !== this.token) return;

    // 停止绘制，但保留最后一帧交给 CSS 淡出
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }

    this.canvas.classList.remove('active');
    this._fadeTextOut();

    const done = () => {
      if (token !== this.token) return;

      this.active = false;
      this._clearCanvas();

      // 爱心落幕后，回到地图
      this._returnToMap();
    };

    // 给淡出留出时间（与 CSS transition 对齐）
    setTimeout(done, 580);
  },

  /**
   * 清空画布
   */
  _clearCanvas() {
    if (!this.canvas) return;
    const ctx = this.ctx;
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.sparkles = [];
    this.minis = [];
    this.rings = [];
  },

  /**
   * 回到地图界面
   */
  _returnToMap() {
    if (typeof EmotionApp === 'undefined' || !EmotionApp.switchTab) return;

    // 已经在情绪地图上就无需切换
    if (EmotionApp.currentTab === 'map') return;

    EmotionApp.switchTab('map');
  },

  _draw(t) {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = this.heartCx;
    const cy = this.heartCy;
    const size = this.heartSize;

    ctx.clearRect(0, 0, w, h);

    // 整体淡出
    let fade = 1;
    if (t > this.FADE_FROM) {
      fade = Math.max(0, 1 - (t - this.FADE_FROM) / (this.DURATION - this.FADE_FROM));
    }

    // 心跳（轮廓画完后开始）
    let pulse = 1;
    if (t > this.T_DRAW[1]) {
      const p = (t - this.T_DRAW[1]) / 1000;
      pulse = 1 + Math.sin(p * Math.PI * 2 * 1.1) * 0.038;
    }

    ctx.save();
    ctx.globalAlpha = fade;

    // 1. 旋转光芒
    this._drawRays(t, cx, cy, size, fade);

    // 2. 扩散光环
    this._drawRings(t, cx, cy, size, fade);

    // 3. 渐变填充
    this._drawFill(t, cx, cy, size, pulse, fade);

    // 4. 轮廓描绘
    this._drawOutline(t, cx, cy, size, pulse, fade);

    // 5. 华丽粒子
    this._drawParticles(t, cx, cy, size, fade);

    ctx.restore();

    // 6. 文字浮现
    this._tickText(t);
  },

  /* ==================== 绘制层 ==================== */

  /**
   * 旋转光芒（预渲染精灵，避免逐帧建渐变）
   */
  _drawRays(t, cx, cy, size, fade) {
    const [from, to] = this.T_RAY;
    if (t < from) return;

    const a = Math.min(1, (t - from) / (to - from)) * 0.9;
    const R = size * 3.1;
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.00013);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade * a * 0.75;
    ctx.drawImage(this._raysSprite(), -R, -R, R * 2, R * 2);
    ctx.restore();
  },

  /**
   * 向外扩散的光环（呼应开场动画的涟漪）
   */
  _drawRings(t, cx, cy, size, fade) {
    if (t < this.T_RING) return;

    const PERIOD = 1500;
    const COUNT = 3;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < COUNT; i++) {
      const phase = ((t - this.T_RING) / PERIOD + i / COUNT) % 1;
      const r = size * (1.05 + phase * 1.5);
      const alpha = Math.sin(phase * Math.PI) * 0.5;

      if (alpha <= 0.01) continue;

      ctx.globalAlpha = fade * alpha;
      ctx.strokeStyle = this.gradFrom;
      ctx.lineWidth = 2.2 * (1 - phase * 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  },

  /**
   * 心形渐变填充（与开场动画的心形同色系）
   */
  _drawFill(t, cx, cy, size, pulse, fade) {
    const [from, to] = this.T_FILL;
    if (t < from) return;

    const a = Math.min(1, (t - from) / (to - from));
    const eased = 1 - Math.pow(1 - a, 2);
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.translate(0, this._heartDY);
    ctx.scale(pulse, pulse);

    // 外发光
    const glow = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 1.7);
    glow.addColorStop(0, `rgba(255, 154, 158, ${0.34 * eased * fade})`);
    glow.addColorStop(0.55, `rgba(242, 112, 143, ${0.14 * eased * fade})`);
    glow.addColorStop(1, 'rgba(242, 112, 143, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.7, 0, Math.PI * 2);
    ctx.fill();

    // 心形本体
    const g = ctx.createLinearGradient(0, -size, 0, size);
    g.addColorStop(0, this.gradFrom);
    g.addColorStop(0.5, this.gradMid);
    g.addColorStop(1, this.gradTo);

    ctx.globalAlpha = fade * eased * 0.9;
    ctx.fillStyle = g;
    this._heartPath(ctx, size, 0);
    ctx.fill();

    // 内侧高光
    ctx.globalAlpha = fade * eased * 0.35;
    const inner = ctx.createLinearGradient(0, -size * 0.7, 0, size * 0.3);
    inner.addColorStop(0, 'rgba(255,255,255,0.85)');
    inner.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = inner;
    this._heartPath(ctx, size * 0.62, -size * 0.22);
    ctx.fill();

    ctx.restore();
  },

  /**
   * 轮廓逐段描绘（开场动画的"画出来"手感）
   */
  _drawOutline(t, cx, cy, size, pulse, fade) {
    const [from, to] = this.T_DRAW;
    if (t < from) return;

    const p = Math.min(1, (t - from) / (to - from));
    const pts = this._outlinePts;
    const count = Math.max(2, Math.floor(p * (pts.length - 1)));
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.translate(0, this._heartDY);
    ctx.scale(pulse, pulse);

    // 渐变描边
    const g = ctx.createLinearGradient(-size, -size, size, size);
    g.addColorStop(0, this.gradFrom);
    g.addColorStop(0.55, this.gradMid);
    g.addColorStop(1, this.gradTo);

    ctx.globalAlpha = fade;
    ctx.strokeStyle = g;
    ctx.lineWidth = 4.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255, 154, 158, 0.85)';
    ctx.shadowBlur = 16;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= count; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // 描绘中：笔尖的辉光
    if (p < 1) {
      const head = pts[count];
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade;
      ctx.shadowBlur = 0;
      ctx.drawImage(
        this._sprite('dot', '#FFF6D8'),
        head.x - 16, head.y - 16, 32, 32
      );
    }

    ctx.restore();
  },

  /**
   * 华丽粒子层
   */
  _drawParticles(t, cx, cy, size, fade) {
    if (t < this.T_SPARK) return;

    const ctx = this.ctx;

    // 首帧生成粒子
    if (this.sparkles.length === 0) {
      this._spawnSparkles(cx, cy, size);
      this._spawnMinis(cx, cy, size);
    }

    // 一次爆发
    if (!this._burstDone && t >= this.T_BURST) {
      this._burstDone = true;
      this._spawnBurst(cx, cy, size, t);
    }

    const age = (t - this.T_SPARK) / 1000;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // —— 星光 ——
    this.sparkles.forEach(s => {
      const life = age - s.delay;
      if (life < 0 || life > s.life) return;

      const k = life / s.life;
      const alpha = Math.sin(Math.min(1, k) * Math.PI) * s.alpha;
      const drift = s.drift * life;
      const x = cx + Math.cos(s.angle) * (s.radius + drift);
      const y = cy + Math.sin(s.angle) * (s.radius + drift) * 0.9;
      const twinkle = 0.55 + 0.45 * Math.sin(life * s.twinkleSpeed + s.twinklePhase);
      const r = s.size * (0.7 + 0.5 * twinkle);

      ctx.globalAlpha = fade * alpha * twinkle;
      ctx.drawImage(
        this._sprite('star', s.color),
        x - r * 2, y - r * 2, r * 4, r * 4
      );
    });

    // —— 小爱心 ——
    this.minis.forEach(m => {
      const life = age - m.delay;
      if (life < 0 || life > m.life) return;

      const k = life / m.life;
      const alpha = Math.sin(Math.min(1, k) * Math.PI) * 0.9;
      const x = m.x + Math.sin(life * m.swaySpeed + m.swayPhase) * m.sway;
      const y = m.y - m.rise * life;
      const r = m.size * (0.85 + 0.3 * Math.sin(life * 3));

      ctx.globalAlpha = fade * alpha;
      ctx.drawImage(
        this._sprite('heart', m.color),
        x - r * 2, y - r * 2, r * 4, r * 4
      );
    });

    ctx.restore();
  },

  /* ==================== 粒子生成 ==================== */

  _spawnSparkles(cx, cy, size) {
    const isNarrow = window.innerWidth < 640;
    const count = isNarrow ? 96 : 150;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      // 贴着心形边缘向外铺开
      const radius = size * (0.75 + Math.random() * 1.55);
      this.sparkles.push({
        angle,
        radius,
        drift: 12 + Math.random() * 46,
        size: 1.6 + Math.random() * 3.0,
        alpha: 0.45 + Math.random() * 0.55,
        twinkleSpeed: 2.4 + Math.random() * 4.2,
        twinklePhase: Math.random() * Math.PI * 2,
        delay: Math.random() * 1.6,
        life: 2.0 + Math.random() * 2.2,
        color: this.particleColors[Math.floor(Math.random() * this.particleColors.length)]
      });
    }
  },

  _spawnMinis(cx, cy, size) {
    const isNarrow = window.innerWidth < 640;
    const count = isNarrow ? 26 : 46;

    for (let i = 0; i < count; i++) {
      this.minis.push({
        x: cx + (Math.random() - 0.5) * size * 2.0,
        y: cy + (Math.random() - 0.5) * size * 1.1,
        rise: 22 + Math.random() * 42,
        sway: 8 + Math.random() * 20,
        swaySpeed: 1.1 + Math.random() * 1.8,
        swayPhase: Math.random() * Math.PI * 2,
        size: 3.5 + Math.random() * 5.5,
        delay: Math.random() * 1.9,
        life: 2.2 + Math.random() * 2.0,
        color: this.particleColors[Math.floor(Math.random() * this.particleColors.length)]
      });
    }
  },

  _spawnBurst(cx, cy, size, t) {
    const isNarrow = window.innerWidth < 640;
    const count = isNarrow ? 54 : 88;
    // 爆发粒子从此刻起算寿命，才能"炸"得干脆
    const base = (t - this.T_SPARK) / 1000;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      this.sparkles.push({
        angle,
        radius: size * 0.35,
        drift: 190 + Math.random() * 230,
        size: 1.8 + Math.random() * 3.2,
        alpha: 0.6 + Math.random() * 0.4,
        twinkleSpeed: 3.5 + Math.random() * 4,
        twinklePhase: Math.random() * Math.PI * 2,
        delay: base,
        life: 0.9 + Math.random() * 0.9,
        color: this.particleColors[Math.floor(Math.random() * this.particleColors.length)]
      });
    }
  },

  /* ==================== 精灵图 ==================== */

  /**
   * 心形路径（dy 为垂直微调）
   */
  _heartPath(ctx, size, dy) {
    const s = size / 17;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      const px = 16 * Math.pow(Math.sin(t), 3) * s;
      const py = -(13 * Math.cos(t)
        - 5 * Math.cos(2 * t)
        - 2 * Math.cos(3 * t)
        - Math.cos(4 * t)) * s;
      if (i === 0) ctx.moveTo(px, py + (dy || 0));
      else ctx.lineTo(px, py + (dy || 0));
    }
    ctx.closePath();
  },

  _sprite(kind, color) {
    const key = kind + '|' + color;
    if (this._sprites[key]) return this._sprites[key];

    const S = 64;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    if (!g) return c;

    if (kind === 'dot') {
      const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      grad.addColorStop(0, color);
      grad.addColorStop(0.26, color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
      g.fill();

    } else if (kind === 'star') {
      // 四角星光
      const m = S / 2;
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 10;
      g.beginPath();
      g.moveTo(m, 2);
      g.quadraticCurveTo(m + 5, m - 5, S - 2, m);
      g.quadraticCurveTo(m + 5, m + 5, m, S - 2);
      g.quadraticCurveTo(m - 5, m + 5, 2, m);
      g.quadraticCurveTo(m - 5, m - 5, m, 2);
      g.closePath();
      g.fill();

    } else {
      // 小爱心
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 8;
      this._heartPath(g, S * 0.42, S * 0.432);
      g.fill();
    }

    this._sprites[key] = c;
    return c;
  },

  _raysSprite() {
    if (this._rays) return this._rays;

    const S = 512;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    if (!g) return c;

    const cx = S / 2, cy = S / 2, R = S / 2;
    const N = 20;

    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const w = 0.036;
      const grad = g.createLinearGradient(
        cx, cy,
        cx + Math.cos(a) * R, cy + Math.sin(a) * R
      );
      grad.addColorStop(0, 'rgba(255, 214, 140, 0)');
      grad.addColorStop(0.30, 'rgba(255, 214, 140, 0.30)');
      grad.addColorStop(0.62, 'rgba(255, 180, 150, 0.16)');
      grad.addColorStop(1, 'rgba(255, 170, 160, 0)');

      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, R, a - w, a + w);
      g.closePath();
      g.fill();
    }

    // 中心镂空，避免糊住爱心
    g.globalCompositeOperation = 'destination-out';
    const mask = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.66);
    mask.addColorStop(0, 'rgba(0,0,0,1)');
    mask.addColorStop(0.42, 'rgba(0,0,0,0.85)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mask;
    g.fillRect(0, 0, S, S);

    this._rays = c;
    return c;
  },

  /* ==================== 文字层 ==================== */

  _showText(show) {
    const el = document.getElementById(this.textId);
    if (!el) return;

    if (show) {
      el.style.animation = '';
      el.style.transition = '';
      el.style.opacity = '';
      el.classList.add('show');
      return;
    }

    // 复位（不播动画）
    el.classList.remove('show');
    el.style.animation = 'none';
    el.style.transition = 'none';
    el.style.opacity = '0';
  },

  /**
   * 文字随舞台一起淡出
   */
  _fadeTextOut() {
    const el = document.getElementById(this.textId);
    if (!el || !el.classList.contains('show')) return;

    // 先锁住当前可见状态（动画是 forwards，直接移除会瞬间消失）
    el.style.animation = 'none';
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetWidth;

    el.style.transition = 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.opacity = '0';
    el.classList.remove('show');
  },

  /**
   * 到点后浮现文字
   */
  _tickText(t) {
    if (this._textShown) return;
    if (t >= this.T_TEXT) {
      this._textShown = true;
      this._showText(true);
    }
  }
};
