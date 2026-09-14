/* ========================================
   温暖安慰弹幕
   记录「低落」心情时，用满屏的温柔话语接住你
   —— 复刻参考视频「一份神秘礼物」的效果
   ======================================== */

const ComfortExperience = {
  containerId: 'comfort-overlay',
  fieldId: 'comfort-field',

  // 触发的心情等级（1 = 低落；想让它也在"焦虑"时出现，改成 [1, 2] 即可）
  triggerMoods: [1],

  // 气泡配色（柔和马卡龙色，取自参考视频）
  colors: [
    '#FDF4C8', '#FBE3C8', '#FBD8DF', '#D9EFD0',
    '#FFFFFF', '#F7C9C9', '#E3E8FA', '#FFF0D9',
    '#F5D9F0', '#E8F4E0', '#FDEDD3', '#FDE2E8'
  ],

  // 温暖的话
  messages: [
    // —— 来自参考视频 ——
    '早安，开启美好一天！', '保持好心情', '天冷了，多穿衣服', '照顾好自己',
    '要天天开心吖~', '多喝水哦~', '别熬夜', '好好爱自己', '下次再试就好',
    '穿舒服的鞋，不累脚', '要按时吃饭', '你已经很棒啦，别苛责自己',
    '等待不会被辜负', '吃饭要有幸福感', '加油，你一定能做好的！',
    '你值得被世界温柔以待', '保持微笑吖', '顺顺利利', '今天也要加油',
    '今天过得开心嘛', '累了就歇，别硬撑', '每天都有小惊喜', '做件喜欢的小事',
    '早点休息', '压力大的话，出去散散步吧', '梦想成真', '难过就抱抱自己',
    'emo了，睡一觉', '湿头发别睡觉', '愿你遇小幸', '明天是新开始',
    '多吃水果', '发现生活小美好', '别多想啦，开心最重要', '愿你常感温暖',
    '愿你睡个好觉', '买杯热饮暖手', '情绪最重要', '想倾诉就找我',
    '抬头就是好天气', '你比想象中坚强', '不开心就跟我说', '慢慢做，不着急',
    '别给自己太大压力', '午餐吃热乎的', '冬天睡前泡泡脚', '备点零食饿了垫',
    '空调别对着头吹', '过马路看红绿灯', '别纠结过去', '你的努力我看见',
    '愿你所有烦恼都消失', '好心情一整天', '愿你的路顺利', '我站在你这边',
    '愿你笑容常在', '小愿望悄悄实现', '出门记得带伞', '手机及时充电',
    '和喜欢的人聊聊', '睡个好觉', '慢慢来，会好的', '今天的你已经很努力了',
    '允许自己休息一下', '哭出来也没关系', '你值得被好好对待',
    '一切都会慢慢变好', '我在这里陪着你',

    // —— 照顾好自己 ——
    '记得吃早餐', '出门带好钥匙', '睡前把手机放远一点', '记得开窗通风',
    '冷了记得加围巾', '走路别看手机', '洗完澡喝杯温水', '记得涂护手霜',
    '少喝冰的', '记得给家里打个电话', '晒晒太阳会好一点', '房间里放点绿植',
    '换个舒服的枕头', '记得拉伸一下肩颈', '眼睛累了就闭一会',
    '睡前听点轻音乐', '把想说的话写下来', '给花浇浇水', '整理一下桌面',
    '换一床干净的被单', '买束花给自己', '泡个热水澡吧', '记得按时吃药',
    '胃不舒服就喝点粥', '久坐了站起来走走',

    // —— 你已经很好了 ——
    '你已经做得很好了', '慢一点也没关系', '不用跟谁比', '你有自己的节奏',
    '不完美也很可爱', '今天也辛苦了', '你比昨天更勇敢', '你的感受很重要',
    '允许自己不懂', '允许自己失败', '停下来也是前进', '你不需要一直坚强',
    '休息不是偷懒', '你的努力会有人看见', '你已经走了很远', '你值得被偏爱',
    '你本来就很好', '不必讨好所有人', '你做的事有意义', '你的存在让世界更温柔',
    '你有在认真生活', '不是你的错', '你可以慢慢想', '你很好，真的',

    // —— 我陪着你 ——
    '难过的时候可以哭', '委屈就说出来', '不用假装没事', '我懂你的不容易',
    '抱抱你', '给你一个大大的拥抱', '你不是一个人', '有人一直惦记你',
    '随时可以找我聊天', '你的心事值得被听见', '我一直都在', '需要的时候我就在',
    '别一个人扛着', '说出来会好受些', '有我在呢',

    // —— 愿你所愿 ——
    '愿你今天被温柔对待', '愿你所求皆如愿', '愿你被爱包围', '愿你不缺好运气',
    '愿你夜里睡得很沉', '愿你醒来心情很好', '愿你有糖吃', '愿你事事顺心',
    '愿你被理解', '愿你不必内耗', '愿你被世界偏爱', '愿你的等待都有回音',
    '愿你笑口常开', '愿你身体健康', '愿你心里有光', '愿你的努力有回报',
    '愿你被自己善待', '愿你今天顺利', '愿你有个好梦', '愿你总有热汤喝',
    '愿你被温柔以待', '愿你所念皆如愿', '愿你不被辜负', '愿你每天都平安'
  ],

  // 状态
  _bubbles: [],
  _animations: [],
  _timers: [],
  _token: 0,
  _active: false,
  _closeHandler: null,

  /**
   * 判断该心情是否需要安慰
   */
  shouldComfort(moodLevel) {
    return this.triggerMoods.indexOf(moodLevel) !== -1;
  },

  /**
   * 展示安慰弹幕
   * @param {number} moodLevel - 心情等级
   * @param {Object} location - 地点
   */
  show(moodLevel, location) {
    const overlay = document.getElementById(this.containerId);
    const field = document.getElementById(this.fieldId);
    if (!overlay || !field) return false;

    const token = ++this._token;
    this._active = true;
    this._clearTimers();

    // 顶部问候语
    const greeting = document.getElementById('comfort-greeting');
    if (greeting) {
      greeting.textContent = moodLevel === 1
        ? '今天辛苦了，这份小礼物送给你'
        : '别担心，慢慢来就好';
    }

    // 清空旧内容
    field.innerHTML = '';
    this._bubbles = [];
    this._animations = [];

    // 生成气泡
    const bubbles = this._buildBubbles(field);
    this._bubbles = bubbles;

    // 展开
    overlay.classList.remove('active');
    void overlay.offsetWidth;
    overlay.classList.add('active');

    // 逐个飘入
    this._animateIn(bubbles, token);

    // 结尾提示
    this._timers.push(setTimeout(() => {
      if (this._token !== token) return;
      const foot = document.getElementById('comfort-footer');
      if (foot) foot.classList.add('show');
    }, 11200));

    // 自动收尾：无需点击，直接过渡到爱心特效
    this._timers.push(setTimeout(() => {
      if (this._token !== token) return;
      this.hide();
    }, 15500));

    // 点击关闭
    this._closeHandler = () => this.hide();
    overlay.addEventListener('click', this._closeHandler);

    return true;
  },

  /**
   * 按抖动网格铺满可视区域，避免气泡扎堆
   */
  _buildBubbles(field) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isNarrow = w < 640;

    // 按视口面积反推格子尺寸，保证不同屏幕上的"饱满度"一致
    const target = isNarrow ? 100 : 195;   // 目标气泡数（气泡变大，数量略降）
    const aspect = isNarrow ? 2.3 : 3.0;   // 格子宽高比（跟随气泡变宽）
    const cellArea = (w * h) / target;
    const cellH = Math.sqrt(cellArea / aspect);
    const cellW = cellH * aspect;

    const cols = Math.max(3, Math.ceil(w / cellW));
    const rows = Math.max(6, Math.ceil(h / cellH));
    const cw = w / cols;
    const ch = h / rows;

    // 收集所有格子位置
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          x: c * cw + cw / 2,
          y: r * ch + ch / 2
        });
      }
    }

    // 打乱格子，让相邻气泡的内容没有规律
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = cells[i]; cells[i] = cells[j]; cells[j] = t;
    }

    // 打乱文案
    const msgs = this.messages.slice();
    for (let i = msgs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = msgs[i]; msgs[i] = msgs[j]; msgs[j] = t;
    }

    const frag = document.createDocumentFragment();
    const list = [];

    cells.forEach((cell, i) => {
      const el = document.createElement('div');
      el.className = 'comfort-bubble';
      el.textContent = msgs[i % msgs.length];

      const bg = this.colors[Math.floor(Math.random() * this.colors.length)];
      const fontSize = isNarrow
        ? 12 + Math.random() * 3.5
        : 14.5 + Math.random() * 4.5;

      // 抖动幅度控制在半个格子内，铺满同时不露白
      const jx = (Math.random() - 0.5) * cw * 0.72;
      const jy = (Math.random() - 0.5) * ch * 0.66;

      el.style.background = bg;
      el.style.fontSize = fontSize.toFixed(1) + 'px';
      el.style.left = Math.round(cell.x + jx) + 'px';
      el.style.top = Math.round(cell.y + jy) + 'px';
      el.style.zIndex = String(1 + Math.floor(Math.random() * 6));

      frag.appendChild(el);
      list.push({ el, order: (i * 7919) % cells.length });
    });

    field.appendChild(frag);
    return list;
  },

  /**
   * 渐显：每个气泡从全透明淡入，约 0.2 秒，无位移、无旋转
   */
  _animateIn(bubbles, token) {
    const total = bubbles.length;
    // 铺满整屏的总时长
    const spread = 11000;
    const FADE = 200;

    bubbles.forEach((b) => {
      const delay = (b.order / total) * spread + Math.random() * 120;

      if (typeof b.el.animate === 'function') {
        const anim = b.el.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: FADE, delay, easing: 'ease-out', fill: 'both' }
        );
        this._animations.push(anim);
      } else {
        b.el.style.transition = `opacity ${FADE}ms ease-out ${delay}ms`;
        b.el.style.opacity = '1';
      }
    });
  },

  /**
   * 关闭并清理
   */
  hide() {
    const overlay = document.getElementById(this.containerId);
    if (!overlay) return;

    this._token++;
    this._active = false;
    this._clearTimers();

    if (this._closeHandler) {
      overlay.removeEventListener('click', this._closeHandler);
      this._closeHandler = null;
    }

    overlay.classList.remove('active');

    // 取消动画，释放资源
    this._animations.forEach(a => {
      try { a.cancel(); } catch (e) { /* 忽略 */ }
    });
    this._animations = [];

    const foot = document.getElementById('comfort-footer');
    if (foot) foot.classList.remove('show');

    const field = document.getElementById(this.fieldId);
    setTimeout(() => {
      if (this._active) return;
      if (field) field.innerHTML = '';
      this._bubbles = [];

      // 弹幕退场的同时，爱心舞台交叉淡入（背景同色，过渡无缝）
      if (typeof ComfortFinale !== 'undefined' && !ComfortFinale.isActive()) {
        ComfortFinale.play();
      }
    }, 300);
  },

  _clearTimers() {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
  },

  isActive() {
    return this._active;
  }
};
