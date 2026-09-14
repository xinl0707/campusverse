/**
 * 小游戏系统：4 属性 ×（巅峰 + 低谷）= 8 个小游戏 + buff 解锁
 * 新版布局：左面板 · 中舞台 · 右面板（参考图风格）
 * 依赖全局：$ , STAT_NAMES , showToast , renderStats , proceedAfterChoice , escapeHtml (app.js)
 *           gameState , STAT_KEYS , clamp , applyEffects , hasBuff , unlockBuff , BUFF_META , activeBuffs (game-engine.js)
 */
'use strict';

const STAT_SHORT = { energy: '精力', study: '学业', social: '人际', mental: '心态' };

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============ 八个小游戏元数据 ============ */
const MINI_GAMES = {
  // 巅峰
  cake: {
    title: '舍友生日会 · 做蛋糕挑战', stat: 'social', kind: 'peak', buff: 'dorm_pet', theme: 'orange',
    scene: '你推开门的瞬间灯亮了，室友们举着还没装饰的蛋糕跳了出来：「快把它变好看！」',
    location: '寝室', time: '晚上', background: 'dorm',
    perfectStory: '你做的蛋糕颜值、口感双在线，惊艳全场舍友。大家特意拍下照片发宿舍群、朋友圈，当晚全员为你点赞，解锁「宿舍团宠」——短期人际互动收益翻倍！'
  },
  run: {
    title: '晨间运动打卡', stat: 'energy', kind: 'peak', buff: 'energy_master', theme: 'green',
    scene: '今天状态极佳、活力拉满，你决定挑战晨间运动打卡。出发！',
    location: '操场', time: '清晨', background: 'gym',
    perfectStory: '你全程节奏完美、耐力拉满，拿下晨间打卡第一名，路过的同学纷纷侧目夸赞，校园运动打卡榜公示你的成绩，解锁「活力达人」——后续体力消耗永久小幅降低！'
  },
  quiz: {
    title: '课堂即兴答题', stat: 'study', kind: 'peak', buff: 'study_gain', theme: 'blue',
    scene: '这节课你状态极好，老师忽然点名让你即兴作答，全班目光聚了过来。',
    location: '教室', time: '上午', background: 'classroom',
    perfectStory: '你的答题逻辑清晰、拓展到位，精准接住老师的追加提问，当堂被当众表扬、树立为班级榜样，课后还有同学主动找你请教。解锁「学霸光环」——学习收益永久小幅提升！'
  },
  meditate: {
    title: '自我治愈冥想', stat: 'mental', kind: 'peak', buff: 'emotion_immune', theme: 'purple',
    scene: '内心极度平稳、无内耗，你盘腿坐下，准备做一次彻底的自我治愈冥想。',
    location: '校园', time: '深夜', background: 'outdoor',
    perfectStory: '你彻底梳理干净内心杂念，捕捉到专属正向治愈瞬间，内心达到极致平和。解锁「情绪免扰」——后续所有负面事件带来的属性衰减直接减半！'
  },
  // 低谷
  social: {
    title: '社交破冰', stat: 'social', kind: 'low', buff: 'social_warm', theme: 'pink',
    scene: '你陷入独处尴尬困境，社交疏离感袭来。试着打破僵局吧。',
    location: '校园', time: '下午', background: 'campus',
    perfectStory: '你的每一次回应都温柔得体、分寸刚好，成功打破社交僵局，身边的人主动对你放下隔阂，愿意主动搭话、结伴同行，彻底清除「社交疏离」负面状态！'
  },
  stayup: {
    title: '困意抵抗', stat: 'energy', kind: 'low', buff: 'tough_body', theme: 'orange',
    scene: '身心疲惫、昏昏欲睡，整日萎靡不振。撑住，别让困意击垮你！',
    location: '自习室', time: '晚上', background: 'library',
    perfectStory: '你成功对抗全程困意，顶住极致疲惫保持清醒，身体状态快速回血。解锁「抗压体魄」——短期熬夜、劳累不会再大幅降低精力数值！'
  },
  errorfix: {
    title: '错题查漏', stat: 'study', kind: 'low', buff: 'study_catchup', theme: 'blue',
    scene: '知识断层、听课吃力，你面临学业落后危机。来一场高效的查漏补缺。',
    location: '自习室', time: '下午', background: 'library',
    perfectStory: '你精准纠错所有错题，吃透全部薄弱知识点，老师察觉到你的进步特意给予鼓励，彻底消除厌学情绪。解锁「查漏补缺」——后续学习收益小幅提升！'
  },
  emotion: {
    title: '情绪疏导', stat: 'mental', kind: 'low', buff: 'self_heal', theme: 'purple',
    scene: '焦虑内耗严重，情绪低落、心态失衡。做一次彻底的情绪疏导吧。',
    location: '校园', time: '夜晚', background: 'outdoor',
    perfectStory: '你成功疏导所有负面情绪，和内耗、焦虑彻底和解，心态焕然一新。解锁「自愈人格」——后续心态属性的恢复速度大幅提升！'
  }
};

const GRADE_TEXT = { perfect: '完美通关！', excellent: '表现优秀！', pass: '勉强过关。', fail: '状况百出……' };
const EVAL_TEXT = ['状态极差', '昏昏欲睡', '勉强清醒', '渐入佳境', '状态极佳', '完美发挥'];

/* ============ 运行态 ============ */
const mg = { active: false, id: null, event: null, finished: false, stage: null, timers: [] };
let cakeState = {};

/* ============ 辅助 ============ */
function mgPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function mgShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function mgFlash(text, parent) {
  const s = parent || $('mg-stage');
  if (!s) return;
  const f = document.createElement('div'); f.className = 'mg-flash'; f.textContent = text;
  s.appendChild(f); setTimeout(() => f.remove(), 900);
}
function mgTimer(fn, ms) {
  const t = setInterval(() => { if (mg.active) fn(); }, ms);
  mg.timers.push(t); return t;
}
function mgClearTimers() { mg.timers.forEach(t => clearInterval(t)); mg.timers = []; }
function mgTimeout(fn, ms) { const t = setTimeout(() => { if (mg.active) fn(); }, ms); mg.timers.push(t); return t; }

/* ============ 新布局控制（$ 由 app.js 提供全局） ============ */
function mgSetLeft(html) { const el = $('mg-panel-left'); if (el) el.innerHTML = html; }
function mgSetRight(html) { const el = $('mg-panel-right'); if (el) el.innerHTML = html; }
function mgSetStage(html) { const el = $('mg-stage'); if (el) { el.innerHTML = html; el.className = 'mg-stage mg-' + (mg.id || ''); } }
function mgSetTitle(title, desc, badge) {
  $('mg-title').textContent = title || '';
  $('mg-desc').textContent = desc || '';
  const b = $('mg-badge');
  if (b) b.textContent = badge || '';
}
function mgSetEventTip(text) { const el = $('mg-event-tip'); if (el) el.textContent = text; }
function mgSetEval(value, text) {
  const v = clamp(Math.round(value), 0, 100);
  const fill = $('mg-eval-fill'); if (fill) fill.style.width = v + '%';
  const txt = $('mg-eval-text'); if (txt) txt.textContent = text || EVAL_TEXT[Math.floor(v / 20)] || EVAL_TEXT[0];
}
function mgEvalFromScore(s) { mgSetEval(s, EVAL_TEXT[Math.floor(clamp(s, 0, 100) / 20)]); }

function mgMeter(label, value, icon, colorClass = '') {
  const v = clamp(Math.round(value), 0, 100);
  return `
    <div class="mg-meter ${colorClass}">
      <div class="mg-meter-head"><span class="mg-meter-icon">${icon}</span><span>${label}</span><span>${v}%</span></div>
      <div class="mg-meter-bar"><div class="mg-meter-fill" style="width:${v}%"></div></div>
    </div>`;
}
function mgStatCard(icon, label, value, unit = '') {
  return `<div class="mg-stat-card"><span class="mg-stat-icon">${icon}</span><div><div class="mg-stat-label">${label}</div><div class="mg-stat-val">${value}${unit}</div></div></div>`;
}
function mgActionButton(text, onClick, cls = '') {
  const b = document.createElement('button');
  b.className = 'mg-action-btn ' + cls; b.type = 'button'; b.textContent = text;
  b.addEventListener('click', onClick); return b;
}

/* ============ 构造小游戏事件 ============ */
function buildMiniGameEvent(special) {
  const map = {
    peak:   { energy: 'run',     study: 'quiz',     social: 'cake',     mental: 'meditate' },
    crisis: { energy: 'stayup',  study: 'errorfix', social: 'social',   mental: 'emotion' }
  };
  const gid = map[special.type][special.stat];
  const meta = MINI_GAMES[gid];
  return {
    id: 'minigame_' + special.type + '_' + special.stat,
    special: special.type, stat: special.stat,
    category: (special.type === 'peak' ? '巅峰·' : '低谷·') + STAT_SHORT[special.stat],
    scene: meta.scene, location: meta.location, time: meta.time, background: meta.background,
    imageFilename: null, _miniGame: gid,
    options: [{ text: '继续', effects: {} }]
  };
}

/* ============ 启动 / 关闭 ============ */
function launchMiniGame(event) {
  mg.active = true; mg.id = event._miniGame; mg.event = event; mg.finished = false; mg.timers = [];
  $('options-list').classList.add('hidden');
  const overlay = $('minigame-overlay'); overlay.classList.remove('hidden');
  const meta = MINI_GAMES[mg.id];
  mgSetTitle(meta.title, event.scene || '', event.special === 'peak' ? '✨ 巅峰事件' : '⚠️ 低谷事件');
  const themeMap = { orange:'#F97316', green:'#22C55E', blue:'#3B82F6', purple:'#A855F7', pink:'#EC4899' };
  overlay.style.setProperty('--mg-theme', themeMap[meta.theme] || themeMap.orange);
  $('mg-close').onclick = () => { if (!mg.finished) { mgClearTimers(); finishMiniGame(0); } };
  $('mg-result').classList.add('hidden'); $('mg-result').innerHTML = '';
  mgSetEventTip('游戏开始，集中注意力！'); mgSetEval(0, '准备中');
  const starters = { cake:startCake, run:startRun, quiz:startQuiz, meditate:startMeditate, social:startSocial, stayup:startStayup, errorfix:startErrorfix, emotion:startEmotion };
  (starters[mg.id] || startCake)();
}

function closeMiniGame() {
  mg.active = false; mgClearTimers();
  $('minigame-overlay').classList.add('hidden');
  $('options-list').classList.remove('hidden');
}

/* ============ 结算 ============ */
function finishMiniGame(score) {
  if (mg.finished) return;
  mg.finished = true; mg.active = false; mgClearTimers();
  score = clamp(Math.round(score), 0, 100);
  const meta = MINI_GAMES[mg.id]; const stat = meta.stat;
  const grade = score >= 90 ? 'perfect' : score >= 70 ? 'excellent' : score >= 40 ? 'pass' : 'fail';
  const perfect = grade === 'perfect';
  const changed = applyEffects(computeMiniGameDeltas(stat, grade));
  renderStats(true);
  if (perfect && meta.buff && !hasBuff(meta.buff)) {
    unlockBuff(meta.buff); const m = BUFF_META[meta.buff];
    showToast(`✨ 解锁 buff：${m.icon} ${m.name} —— ${m.desc}`, 'success');
  }
  renderBuffBar();
  showMiniGameResult(stat, grade, changed, perfect ? (meta.perfectStory || '') : '');
}

function computeMiniGameDeltas(stat, grade) {
  const base = { perfect: { main: 12, sub: 4 }, excellent: { main: 8, sub: 3 }, pass: { main: 4, sub: 1 }, fail: { main: -4, sub: 0 } }[grade];
  const subMap = { energy: 'mental', study: 'mental', social: 'mental', mental: 'social' };
  const d = { energy: 0, study: 0, social: 0, mental: 0 };
  d[stat] = base.main; if (base.sub) d[subMap[stat]] += base.sub;
  return d;
}

function showMiniGameResult(stat, grade, changed, perfectStory) {
  const r = $('mg-result');
  const sign = v => (v > 0 ? '+' : '') + v; const cls = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
  const deltaHtml = STAT_KEYS.map(k => {
    const v = changed[k] || 0;
    return `<div class="delta-item"><span class="delta-name">${STAT_NAMES[k]}</span><span class="delta-val ${cls(v)}">${v === 0 ? '±0' : sign(v)}</span></div>`;
  }).join('');
  r.innerHTML = `
    <div class="mg-result-grade mg-${grade}">${GRADE_TEXT[grade]}</div>
    <div class="mg-result-deltas">${deltaHtml}</div>
    ${perfectStory ? `<p class="mg-result-story">${escapeHtml(perfectStory)}</p>` : ''}
    <button class="btn-primary btn-lg" id="mg-continue">继续</button>`;
  r.classList.remove('hidden');
  $('mg-continue').addEventListener('click', () => { closeMiniGame(); proceedAfterChoice(); });
}

/* ============ 1. 做蛋糕（人际·巅峰）—— 参考图风格 ============ */

function startCake() {
  const STAGES = [
    {
      title: '阶段 1 · 备料',
      bubble: '「面粉、鸡蛋、糖都在这，咱先把料备齐？」',
      failLine: '手一抖，糖撒了一桌，得重新称量一次。',
      options: [
        { text: '仔细称量分次下料',   eff: { social: 3, mental: 2 },  risk: 'low',     hint: '人际+3 心态+2', flavor: '一克一克称量，面糊细腻无颗粒。' },
        { text: '凭感觉快速下料',     eff: { energy: -2 },           risk: 'high',    hint: '精力-2',       flavor: '图快下手，味道全凭运气。' },
        { text: '舍友协助分拣原料',   eff: { social: 6, energy: -1 }, risk: 'mid',     hint: '人际+6 精力-1', flavor: '舍友帮你分装好，井井有条。', help: true }
      ]
    },
    {
      title: '阶段 2 · 搅拌面糊',
      bubble: '「面糊要顺滑，别起筋了哦。」',
      failLine: '搅太急，面糊起筋成了面疙瘩。',
      options: [
        { text: '匀速慢搅防起筋',     eff: { mental: 3 },  risk: 'low',  hint: '心态+3', flavor: '手腕匀速画圈，面糊亮泽顺滑。' },
        { text: '高速搅拌省时间',     eff: { energy: -3 }, risk: 'high', hint: '精力-3', flavor: '图省事开高速，手都搅麻了。' },
        { text: '与舍友轮流搅拌',     eff: { social: 4 },  risk: 'mid',  hint: '人际+4', flavor: '两人轮流，节奏稳得很。', help: true }
      ]
    },
    {
      title: '阶段 3 · 烘烤蛋糕胚',
      bubble: '「烤箱叮一声就靠你盯着啦。」',
      failLine: '温控没盯住，表皮有点焦。',
      options: [
        { text: '定时看守观察',       eff: { mental: 4 }, risk: 'low',     hint: '心态+4',     flavor: '守在烤箱前，金黄完美出炉。' },
        { text: '设好时间短暂休息',   eff: { energy: 2 }, risk: 'mid',     hint: '精力+2',     flavor: '小憩片刻，回来刚刚好。' },
        { text: '升温加速烘烤',       eff: {},            risk: 'extreme', hint: '无属性变化', flavor: '猛升温赌速度，心悬到了嗓子眼。' }
      ]
    },
    {
      title: '阶段 4 · 奶油装饰',
      bubble: '「最后一步，给它穿上漂亮外衣！」',
      failLine: '手一滑，奶油抹歪了。',
      options: [
        { text: '稳妥草莓简约造型',     eff: { social: 5, mental: 3 }, risk: 'low', hint: '人际+5 心态+3', flavor: '草莓点缀，干净又治愈。' },
        { text: '果酱饼干创意造型',     eff: { social: 0 },            risk: 'mid', hint: '创意加分',       flavor: '脑洞大开，造型很出片。', creative: true },
        { text: '和舍友共同设计装饰',   eff: { social: 7 },            risk: 'low', hint: '人际+7',         flavor: '两人一起摆，温馨又有梗。', help: true }
      ]
    }
  ];
  const RISK = {
    low:     { label: '风险低',   p: 0.05, cls: 'low' },
    mid:     { label: '风险中',   p: 0.22, cls: 'mid' },
    high:    { label: '风险高',   p: 0.48, cls: 'high' },
    extreme: { label: '风险极高', p: 0.75, cls: 'extreme' }
  };
  const HELP_BONUS = 2;     // 选「求助舍友」的隐藏加成（人际）
  const EASTER_COUNT = 3;   // 彩蛋：≥3 次求助舍友
  const EASTER_BONUS = 5;   // 彩蛋额外人际

  cakeState = { stage: 0, mistakes: 0, helps: 0, session: { energy: 0, study: 0, social: 0, mental: 0 } };
  const STAGE_COUNT = STAGES.length;

  function applyStep(step) {
    const changed = applyEffects(step);
    STAT_KEYS.forEach(k => { cakeState.session[k] = (cakeState.session[k] || 0) + (changed[k] || 0); });
    renderStats(true);
    refreshBars();
  }
  function refreshBars() {
    STAT_KEYS.forEach(k => {
      const fill = document.querySelector('.dcake-stat[data-k="' + k + '"] .dcake-stat-fill');
      const val = document.querySelector('.dcake-stat[data-k="' + k + '"] .dcake-stat-val');
      if (fill) fill.style.width = gameState.current[k] + '%';
      if (val) val.textContent = gameState.current[k];
    });
  }
  function statMini(k, label) {
    const v = gameState.current[k];
    return '<div class="dcake-stat" data-k="' + k + '"><span class="dcake-stat-name">' + label + '</span>' +
      '<div class="dcake-stat-bar"><div class="dcake-stat-fill" style="width:' + v + '%"></div></div>' +
      '<span class="dcake-stat-val">' + v + '</span></div>';
  }
  function cakeLayers(n) {
    let h = '';
    if (n >= 1) h += '<div class="dcake-cake-base"></div>';
    if (n >= 2) h += '<div class="dcake-cake-batter"></div>';
    if (n >= 3) h += '<div class="dcake-cake-baked"></div>';
    if (n >= 4) h += '<div class="dcake-cake-cream"></div>';
    return h + '<div class="dcake-cake-plate"></div>';
  }
  function renderStage() {
    const st = STAGES[cakeState.stage];
    mgSetLeft(
      '<div class="mg-panel-title">🎂 做蛋糕进度</div>' +
      STAGES.map((s, i) => '<div class="mg-stage-row ' + (i === cakeState.stage ? 'active' : '') + ' ' + (i < cakeState.stage ? 'done' : '') + '">' +
        '<span class="mg-stage-icon">' + ['①','②','③','④'][i] + '</span><span>' + s.title + '</span></div>').join('') +
      '<div class="dcake-info">😣 累计失误：<b>' + cakeState.mistakes + '</b> / 4</div>' +
      '<div class="dcake-info">🤝 舍友协助：<b>' + cakeState.helps + '</b> / ' + STAGE_COUNT +
        (cakeState.helps >= EASTER_COUNT ? ' <span class="dcake-egg">🥚彩蛋达成</span>' : '') + '</div>'
    );
    mgSetStage(
      '<div class="dcake-scene dcake-stage-' + (cakeState.stage + 1) + '">' +
        '<div class="dcake-room"></div>' +
        '<div class="dcake-bubble">' + escapeHtml(st.bubble) + '</div>' +
      '</div>'
    );
    mgSetRight('<div class="mg-panel-title">' + st.title + ' · 选择</div><div class="dcake-opts" id="dcake-opts"></div>');
    const box = document.getElementById('dcake-opts');
    st.options.forEach((o, idx) => {
      const r = RISK[o.risk];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dcake-opt dcake-risk-' + r.cls;
      b.innerHTML = '<span class="dcake-opt-text">' + escapeHtml(o.text) + '</span>' +
        '<span class="dcake-opt-meta">' +
          '<span class="dcake-risk dcake-risk-' + r.cls + '">' + r.label + '</span>' +
          (o.hint ? '<span class="dcake-hint">' + o.hint + '</span>' : '') +
          (o.help ? '<span class="dcake-help">🤝求助</span>' : '') +
        '</span>';
      b.addEventListener('click', () => choose(idx));
      box.appendChild(b);
    });
    mgSetEventTip(st.bubble);
    mgSetEval(cakeState.stage / STAGE_COUNT * 100, '制作中 ' + (cakeState.stage + 1) + '/' + STAGE_COUNT);
  }
  function choose(idx) {
    if (!mg.active) return;
    const st = STAGES[cakeState.stage];
    const o = st.options[idx];
    const step = Object.assign({}, o.eff);
    if (o.help) { cakeState.helps++; step.social = (step.social || 0) + HELP_BONUS; }
    applyStep(step);
    const r = RISK[o.risk];
    if (Math.random() < r.p) {
      cakeState.mistakes++;
      mgFlash('😣 失误！' + st.failLine);
    } else {
      mgFlash(o.help ? '🤝 ' + o.flavor : o.flavor);
    }
    cakeState.stage++;
    if (cakeState.stage >= STAGE_COUNT) mgTimeout(settle, 650);
    else mgTimeout(renderStage, 480);
  }
  function settle() {
    if (!mg.active) return;
    const m = cakeState.mistakes;
    let grade, settleDelta, story;
    if (m === 0) {
      grade = 'perfect';
      settleDelta = { social: 15, mental: 5 };
      story = '🎉 完美！全程零失误，蛋糕惊艳全场舍友。快门声此起彼伏——<b>解锁「回忆相册」</b>，这段温馨被永久珍藏。';
    } else if (m <= 2) {
      grade = 'pass';
      settleDelta = { social: 8 };
      story = '✅ 合格！虽有几次小失误，成品依旧讨喜，舍友们很满意。';
    } else {
      grade = 'fail';
      settleDelta = { social: 3, mental: -4 };
      story = '🌀 翻车了……蛋糕有点惨，但大家笑作一团——<b>解锁「特殊趣味回忆」</b>，这锅黑暗料理日后必成宿舍名场面。';
    }
    if (cakeState.helps >= EASTER_COUNT) {
      settleDelta.social = (settleDelta.social || 0) + EASTER_BONUS;
      story += ' <br>🥚 彩蛋：你全程 ' + cakeState.helps + ' 次拉上舍友并肩作战，默契拉满，<b>额外人际 +' + EASTER_BONUS + '</b>！';
    }
    applyStep(settleDelta);
    showDormResult(grade, story);
  }
  function showDormResult(grade, story) {
    const r = $('mg-result');
    const gradeText = { perfect: '完美出炉！', pass: '顺利过关', fail: '有点翻车' }[grade];
    const deltaHtml = STAT_KEYS.map(k => {
      const v = cakeState.session[k] || 0;
      const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
      return '<div class="delta-item"><span class="delta-name">' + STAT_NAMES[k] + '</span>' +
        '<span class="delta-val ' + cls + '">' + (v === 0 ? '±0' : (v > 0 ? '+' : '') + v) + '</span></div>';
    }).join('');
    r.innerHTML = '<div class="mg-result-grade mg-' + grade + '">' + gradeText + '</div>' +
      '<div class="mg-result-deltas">' + deltaHtml + '</div>' +
      '<p class="mg-result-story">' + story + '</p>' +
      '<button class="btn-primary btn-lg" id="mg-continue">继续</button>';
    r.classList.remove('hidden');
    $('mg-continue').addEventListener('click', () => { closeMiniGame(); proceedAfterChoice(); });
  }

  mgSetEventTip('宿舍做蛋糕开始！每一步都要权衡风险哦～');
  renderStage();
}

/* ============ 2. 晨间打卡闯关（精力·巅峰） ============ */
function startRun() {
  // 关卡池：每局随机抽取 5 个不重复的关卡内容；每个关卡对应一张背景图
  const WEATHER_POOL = [
    { icon: '🌬️', name: '顺风助力', good: 'sprint', tip: '顺风，点【冲刺】借力加速', bg: 'assets/run/run1.png' },
    { icon: '🪜', name: '台阶障碍', good: 'charge', tip: '障碍，点【蓄力】稳住重心', bg: 'assets/run/run2.png' },
    { icon: '💨', name: '突发阵风', good: 'rest', tip: '阵风，点【休息】调整呼吸', bg: 'assets/run/run3.png' },
    { icon: '🌧️', name: '细雨湿滑', good: 'rest', tip: '路面湿滑，点【休息】放慢节奏', bg: 'assets/run/run4.png' },
    { icon: '☀️', name: '阳光正好', good: 'sprint', tip: '天气给力，点【冲刺】拉满状态', bg: 'assets/run/run5.png' },
    { icon: '🏔️', name: '上坡路段', good: 'charge', tip: '坡陡费力，点【蓄力】稳住步伐', bg: 'assets/run/run6.png' },
    { icon: '🌫️', name: '雾气朦胧', good: 'rest', tip: '视线受阻，点【休息】看清路况', bg: 'assets/run/run7.png' },
    { icon: '⚡', name: '体力骤降', good: 'rest', tip: '突然腿软，点【休息】回血', bg: 'assets/run/run8.png' },
    { icon: '🔥', name: '状态火热', good: 'sprint', tip: '手感正烫，点【冲刺】乘胜追击', bg: 'assets/run/run9.png' },
    { icon: '🪨', name: '碎石颠簸', good: 'charge', tip: '碎石硌脚，点【蓄力】护住脚踝', bg: 'assets/run/run10.png' }
  ];
  const acts = { sprint: '🏃 冲刺', charge: '💪 蓄力', rest: '🧘 休息' };
  let round = 0, score = 40, streak = 0, fail = false, maxRound = 5;
  const levels = mgShuffle(WEATHER_POOL).slice(0, 5); // 随机生成 5 个关卡
  function render() {
    if (fail || round >= maxRound) { finishMiniGame(clamp(score, 0, 100)); return; }
    const w = levels[round];
    mgSetLeft(`<div class="mg-panel-title">打卡路线（随机 5 关）</div>` +
      levels.map((x, i) => `<div class="mg-stage-row ${i === round ? 'active' : ''} ${i < round ? 'done' : ''}"><span class="mg-stage-icon">${x.icon}</span><span>${x.name}</span></div>`).join('') +
      mgMeter('体力储备', score, '⚡', 'green'));
    mgSetStage(`
      <div class="run-top">
        <div class="run-round">第 ${round + 1} / ${maxRound} 关</div>
        <div class="run-weather">${w.icon} <span>${w.name}</span></div>
      </div>
      <div class="run-scene" style="background-image:url('${w.bg}')"></div>`);
    mgSetRight(`<div class="mg-panel-title">选择动作</div><div id="run-actions" class="mg-actions"></div>`);
    mgSetEventTip(w.tip);
    const box = document.getElementById('run-actions');
    Object.keys(acts).forEach(a => {
      const b = mgActionButton(acts[a], () => {
        if (fail || !mg.active) return;
        if (a === w.good) {
          score += 7; streak = a === 'sprint' ? streak + 1 : 0;
          if (streak >= 3) { score -= 10; streak = 0; mgFlash('⚠️ 连续冲刺脱力！'); }
          else mgFlash('✅ 节奏刚好');
        } else { score -= 6; streak = 0; if (score < 0) { fail = true; mgFlash('😵 体力透支'); } else mgFlash('❌ 节奏乱了'); }
        round++; if (round >= maxRound || fail) finishMiniGame(clamp(score, 0, 100)); else render();
      }); box.appendChild(b);
    });
    mgEvalFromScore(score);
  }
  round = 0; render();
}

/* ============ 3. 课堂即兴答题（学业·巅峰） ============ */
function startQuiz() {
  const POOL = [
    { q: '老师突然点名让你解释「供给侧改革」', opts: ['用生活中的例子类比说明', '照本宣科念定义', '直接说不会'], ok: 0 },
    { q: '数学课上被追问积分题的换元思路', opts: ['乱写一步蒙混', '先写设 t=… 再逐步推导', '说这题超纲'], ok: 1 },
    { q: '英语课即兴用英文介绍家乡', opts: ['沉默不语', '嘲笑题目无聊', '磕绊但完整说几句'], ok: 2 },
    { q: '实验课数据异常，老师问原因', opts: ['甩锅仪器坏了', '分析可能的误差来源', '装作没听见'], ok: 1 },
    { q: '历史课被问某事件的根本原因', opts: ['从经济与社会结构分析', '背一个表面现象', '反问老师这考吗'], ok: 0 },
    { q: '编程课代码跑不通被点名排查', opts: ['死盯屏幕不说话', '重启电脑假装修好', '加日志逐段定位'], ok: 2 },
    { q: '文学课被要求即兴赏析一句诗', opts: ['念一遍就坐下', '说这诗没意义', '结合意象谈感受'], ok: 2 },
    { q: '课堂辩论对方抛出反例', opts: ['承认并补充限定条件', '慌乱否认', '人身攻击对方'], ok: 0 },
    { q: '物理课被问「为什么天空是蓝的」', opts: ['说不知道', '扯到无关话题', '用瑞利散射通俗解释'], ok: 2 },
    { q: '小组 pre 中 PPT 突然打不开', opts: ['僵在台上不动', '抱怨设备太烂', '口头讲要点救场'], ok: 2 },
    { q: '老师让你评价同学的观点', opts: ['一味附和', '当众直接否定', '先肯定再提不同角度'], ok: 2 },
    { q: '课堂被要求用三个词总结本节', opts: ['愣住不说话', '说「都记住了」', '提炼核心词并简述'], ok: 2 }
  ];
  const steps = mgShuffle(POOL).slice(0, 5);
  let step = 0, score = 20, correctCount = 0, combo = 0, accuracy = 0, bestCombo = 0;
  function render() {
    if (step >= steps.length) {
      const bonus = accuracy >= 75 ? 20 : accuracy >= 50 ? 10 : 0;
      finishMiniGame(clamp(score + bonus, 0, 120)); return;
    }
    const s = steps[step];
    mgSetLeft(`<div class="mg-panel-title">课堂即兴答题</div>` +
      steps.map((x, i) => `<div class="mg-stage-row ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}"><span class="mg-stage-icon">${['📘','📗','📙','📕','📒','📔'][i % 6]}</span><span>第 ${i + 1} 题</span></div>`).join('') +
      mgMeter('正确率', accuracy, '✅', 'blue'));
    mgSetStage(`<div class="quiz-scene" style="background-image:url('assets/quiz.png')"><div class="quiz-board">${s.q}</div><div class="quiz-opts" id="quiz-opts"></div></div>`);
    mgSetRight(`<div class="mg-panel-title">实时数据</div>${mgStatCard('🎯', '正确率', accuracy, '%')}${mgStatCard('🔥', '连击', combo)}${mgStatCard('📝', '已答', step + '/' + steps.length)}`);
    const box = document.getElementById('quiz-opts');
    s.opts.forEach((o, idx) => {
      const b = mgActionButton(o, () => {
        if (idx === s.ok) { score += 18; correctCount++; combo++; bestCombo = Math.max(bestCombo, combo); accuracy = Math.round(correctCount / (step + 1) * 100); mgFlash('✅ 答得漂亮'); }
        else { score = Math.max(0, score - 10); combo = 0; accuracy = Math.round(correctCount / (step + 1) * 100); mgFlash('❌ 再想想'); }
        step++; render();
      }, 'mg-chip'); box.appendChild(b);
    });
    mgSetEventTip(mgPick(['老师追问：这一步的关键假设是什么？', '注意：回归题设，别被表象带偏。', '提示：逻辑链要一环扣一环。', '同学投来期待的目光，稳住。', '教授微微点头，继续。']));
    mgEvalFromScore(score);
  }
  render();
}

/* ============ 4. 杂念清理（心态·巅峰） ============ */
function startMeditate() {
  let negatives = 0, missedNeg = 0, wrongClick = 0, rare = 0, spawned = 0, total = 12, score = 0;
  mgSetLeft(`<div class="mg-panel-title">冥想状态</div>${mgMeter('平静度', score, '🌿', 'purple')}${mgStatCard('🧘', '已清理', negatives)}${mgStatCard('🌟', '稀有收集', rare)}`);
  mgSetStage(`<div class="meditate-scene" style="background-image:url('assets/meditate.png')"><div class="mg-bubble-area" id="meditate-area"></div></div>`);
  mgSetRight(`<div class="mg-panel-title">操作说明</div><div class="mg-instruction">点击红色杂念消除</div><div class="mg-instruction">留住金色正向气泡</div><div class="mg-instruction">误点正向会扣分</div>`);
  mgSetEventTip('杂念来了，保持专注，只点红色气泡。');
  const area = document.getElementById('meditate-area');
  const timer = mgTimer(() => {
    if (spawned >= total) return;
    spawned++;
    const isNeg = Math.random() < 0.6;
    const isRare = !isNeg && Math.random() < 0.5;
    const b = document.createElement('div');
    b.className = 'mg-bubble ' + (isNeg ? 'neg' : isRare ? 'rare' : 'pos');
    b.textContent = isNeg ? mgPick(['😣', '😰', '😞', '🌫️', '💢']) : isRare ? mgPick(['✨', '🌟']) : mgPick(['🌿', '☀️', '💗']);
    b.style.left = (10 + Math.random() * 70) + '%'; b.style.animationDuration = (2.5 + Math.random() * 1.5) + 's';
    b.addEventListener('click', () => {
      if (isNeg) { negatives++; score = Math.min(100, score + 7); b.remove(); mgFlash('✅ 杂念清除'); }
      else if (isRare) { wrongClick++; score = Math.max(0, score - 5); b.remove(); mgFlash('❌ 误点稀有'); }
      else { score += 2; b.remove(); }
      update();
    });
    b.addEventListener('animationend', () => { if (isNeg) missedNeg++; else if (isRare) rare++; b.remove(); update(); if (spawned >= total && area.children.length === 0) end(); });
    area.appendChild(b);
  }, 600);
  function update() {
    mgSetLeft(`<div class="mg-panel-title">冥想状态</div>${mgMeter('平静度', score, '🌿', 'purple')}${mgStatCard('🧘', '已清理', negatives)}${mgStatCard('🌟', '稀有收集', rare)}`);
    mgEvalFromScore(score);
  }
  function end() { if (!mg.active) return; clearInterval(timer); let s = score; if (missedNeg === 0 && wrongClick === 0 && rare >= 2) s = 100; finishMiniGame(s); }
  mgTimeout(end, 12000);
}

/* ============ 5. 社交破冰（人际·低谷） ============ */
function startSocial() {
  const POOL = [
    { q: '室友新买的杯子被你碰倒了', bg: 'assets/social/social1.png', opts: ['假装没看见', '道歉并帮擦干净', '吐槽杯子丑'], ok: 1 },
    { q: '课堂上被点名却答不上来', bg: 'assets/social/social2.png', opts: ['低头不语', '诚实说不会，课后补', '小声吐槽老师'], ok: 1 },
    { q: '路人不小心撞到你', bg: 'assets/social/social3.png', opts: ['瞪回去', '笑着说没事', '抱怨对方不长眼'], ok: 1 },
    { q: '社团招新，你很想加入却没人搭话', bg: 'assets/social/social4.png', opts: ['默默走开', '主动上前自我介绍', '假装高冷'], ok: 1 },
    { q: '小组作业队友一直划水', bg: 'assets/social/social5.png', opts: ['当众发火', '私下沟通分工', '直接告老师'], ok: 1 },
    { q: '同学在朋友圈发了你的丑照', bg: 'assets/social/social6.png', opts: ['骂回去', '私聊请他删掉', '也发他的丑照'], ok: 1 },
    { q: '你迟到了，全班都看着你', bg: 'assets/social/social7.png', opts: ['溜到座位不说话', '轻声道歉快坐下', '抱怨堵车'], ok: 1 },
    { q: '新同学请教你，你也不会', bg: 'assets/social/social8.png', opts: ['随便糊弄', '一起查资料', '说这题太简单'], ok: 1 },
    { q: '聚餐时你被安排在角落', bg: 'assets/social/social9.png', opts: ['低头玩手机', '主动加入话题', '生气离席'], ok: 1 },
    { q: '舍友失眠来找你聊天', bg: 'assets/social/social10.png', opts: ['装睡', '陪他聊聊', '嫌他烦'], ok: 1 },
    { q: '你帮了别人却被说多管闲事', bg: 'assets/social/social11.png', opts: ['委屈沉默', '温和解释初衷', '立刻翻脸'], ok: 1 },
    { q: '班级投票你没被提名', bg: 'assets/social/social12.png', opts: ['阴阳怪气', '大方祝贺当选者', '拉帮结派'], ok: 1 }
  ];
  const scenes = mgShuffle(POOL).slice(0, 5);
  let i = 0, score = 30;
  function render() {
    if (i >= scenes.length) { finishMiniGame(score); return; }
    const s = scenes[i];
    mgSetLeft(`<div class="mg-panel-title">社交场景（随机）</div>` +
      scenes.map((x, idx) => `<div class="mg-stage-row ${idx === i ? 'active' : ''} ${idx < i ? 'done' : ''}"><span class="mg-stage-icon">${['🌟','💬','🤝','🎈','🍀'][idx % 5]}</span><span>场景 ${idx + 1}</span></div>`).join('') +
      mgMeter('破冰进度', i / scenes.length * 100, '💬', 'pink'));
    mgSetStage(`<div class="social-scene" style="background-image:url('${s.bg}')"><div class="social-bubble">${s.q}</div></div>`);
    mgSetRight(`<div class="mg-panel-title">你的回应</div><div id="social-opts" class="mg-actions"></div>`);
    const box = document.getElementById('social-opts');
    s.opts.forEach((o, idx) => {
      const b = mgActionButton(o, () => {
        if (idx === s.ok) { score += 22; mgFlash('💗 得体回应'); }
        else if (idx === 2) { score -= 12; mgFlash('😅 社死操作'); }
        else { score += 6; mgFlash('😐 还可以更好'); }
        i++; render();
      }, 'mg-chip'); box.appendChild(b);
    });
    mgSetEventTip(mgPick(['气氛有点僵，选个得体的回应。', '注意分寸，温柔一点。', '破冰的关键是真诚。']));
    mgEvalFromScore(score);
  }
  render();
}

/* ============ 6. 困意抵抗（精力·低谷）—— 参考图 1 ============ */
function startStayup() {
  let energy = 35, alertness = 40, round = 0, maxRound = 5, fail = false;
  const STATES_POOL = [
    { icon: '😪', name: '眼皮沉重', good: 'wake', tip: '眼皮快撑不住了，快洗脸提神！', bg: 'assets/stayup/stayup1.png' },
    { icon: '💭', name: '走神犯困', good: 'stretch', tip: '思绪飘走了，站起来拉伸一下。', bg: 'assets/stayup/stayup2.png' },
    { icon: '🥱', name: '低头瞌睡', good: 'nap', tip: '头要栽到桌上了，短暂小憩恢复。', bg: 'assets/stayup/stayup3.png' },
    { icon: '🌫️', name: '脑子发木', good: 'stretch', tip: '反应变慢，起身活动唤醒身体。', bg: 'assets/stayup/stayup4.png' },
    { icon: '😵', name: '视线模糊', good: 'wake', tip: '眼睛酸涩，去洗把脸清醒一下。', bg: 'assets/stayup/stayup5.png' },
    { icon: '🥴', name: '午后犯困', good: 'nap', tip: '午后血糖低，小憩比硬撑更好。', bg: 'assets/stayup/stayup6.png' }
  ];
  // 开场洗牌后取 maxRound 个不重复状态，保证一局内各关内容不重复
  const levels = mgShuffle(STATES_POOL).slice(0, Math.min(maxRound, STATES_POOL.length));
  const acts = { wake: '☕ 洗脸提神', stretch: '🤸 站起拉伸', nap: '😴 短暂小憩' };
  function render() {
    if (fail || round >= maxRound) { finishMiniGame(clamp((energy + alertness) / 2, 0, 100)); return; }
    const s = levels[round];
    mgSetLeft(`<div class="mg-panel-title">身体状态</div>${mgMeter('体力', energy, '⚡', 'orange')}${mgMeter('清醒度', alertness, '👁️', 'orange')}`);
    mgSetStage(`
      <div class="stayup-top">
        <div class="stayup-round">第 ${round + 1} / ${maxRound} 关</div>
        <div class="stayup-state-chip">${s.icon} <span>${s.name}</span></div>
      </div>
      <div class="stayup-scene" style="background-image:url('${s.bg}')"></div>`);
    mgSetRight(`<div class="mg-panel-title">对抗困意</div><div id="stayup-actions" class="mg-actions"></div>`);
    const box = document.getElementById('stayup-actions');
    Object.keys(acts).forEach(a => {
      const b = mgActionButton(acts[a], () => {
        if (a === s.good) {
          energy = Math.min(100, energy + 8); alertness = Math.min(100, alertness + 12);
          mgFlash('✅ 清醒一点');
        } else {
          energy = Math.max(0, energy - 5); alertness = Math.max(0, alertness - 8);
          if (alertness <= 0) { fail = true; mgFlash('😵 昏睡了'); }
          else mgFlash('❌ 更困了');
        }
        round++; render();
      }); box.appendChild(b);
    });
    mgSetEventTip(s.tip);
    mgEvalFromScore((energy + alertness) / 2);
  }
  render();
}

/* ============ 7. 错题查漏（学业·低谷）—— 参考图 2 ============ */
function startErrorfix() {
  const POOL = [
    { q: '下列哪一项是正确推导？', opts: ['只看结论', '跳过过程', '梳理条件再推', '凭感觉选'], ok: 2 },
    { q: '面对错题，应该先做什么？', opts: ['直接翻答案', '分析错因', '抱怨题目难', '死记硬背'], ok: 1 },
    { q: '巩固知识最好的方式是？', opts: ['重复做同类题', '只看笔记', '考前突击', '逃避弱科'], ok: 0 },
    { q: '公式记混时，正确做法是？', opts: ['硬套碰运气', '回归定义推导', '抄别人答案', '放弃该题'], ok: 1 },
    { q: '同一类题总错，说明？', opts: ['运气不好', '知识点有漏洞', '题出错了', '不用管'], ok: 1 },
    { q: '订正时最有用的动作是？', opts: ['把正确步骤写一遍', '只看一眼', '等老师讲', '划掉重做不总结'], ok: 0 },
    { q: '错题本的正确打开方式是？', opts: ['抄题不回顾', '定期重做复盘', '装饰得好看', '用完即弃'], ok: 1 },
    { q: '遇到「看似会做却错」的题，应？', opts: ['归咎粗心', '细查每一步依据', '扔一边', '怪试卷'], ok: 1 },
    { q: '哪类错误最该优先解决？', opts: ['偶然笔误', '反复出现的基础错', '超纲题', '别人错的'], ok: 1 },
    { q: '复习效率低，首先该？', opts: ['延长熬夜时间', '定位薄弱点', '换更多资料', '刷短视频放松'], ok: 1 },
    { q: '概念理解不清时，最好？', opts: ['背结论', '从例子反推概念', '跳过', '赌考试不考'], ok: 1 },
    { q: '错题复盘的关键一步是？', opts: ['对答案就走', '归纳通用方法', '记仇出题人', '留到明天'], ok: 1 }
  ];
  const questions = mgShuffle(POOL).slice(0, 5);
  let idx = 0, score = 20, correct = 0, combo = 0, accuracy = 0;
  function render() {
    if (idx >= questions.length) {
      const bonus = accuracy >= 80 ? 20 : accuracy >= 60 ? 10 : 0;
      finishMiniGame(clamp(score + bonus, 0, 120)); return;
    }
    const q = questions[idx];
    mgSetLeft(`<div class="mg-panel-title">错题查漏</div><div class="mg-question-box">${q.q}</div><div id="errorfix-opts" class="errorfix-opts"></div>` +
      mgMeter('正确率', accuracy, '✅', 'blue'));
    mgSetStage(`<div class="errorfix-scene" style="background-image:url('assets/errorfix.png')"></div>`);
    mgSetRight(`<div class="mg-panel-title">实时数据</div>${mgStatCard('🎯', '正确率', accuracy, '%')}${mgStatCard('🔥', '连击', combo)}${mgStatCard('📝', '进度', idx + '/' + questions.length)}`);
    const box = document.getElementById('errorfix-opts');
    q.opts.forEach((o, i) => {
      const b = mgActionButton(o, () => {
        if (i === q.ok) { score += 18; correct++; combo++; accuracy = Math.round(correct / (idx + 1) * 100); mgFlash('✅ 答对了'); }
        else { score = Math.max(0, score - 10); combo = 0; accuracy = Math.round(correct / (idx + 1) * 100); mgFlash('❌ 再想想'); }
        idx++; render();
      }, 'mg-chip'); box.appendChild(b);
    });
    mgSetEventTip(mgPick(['这题上次错过！谨慎选择。', '老师批注：思路清楚了吗？', '注意：错题要回归知识点本身。', '把同类题的方法归纳一下。']));
    mgEvalFromScore(score);
  }
  render();
}

/* ============ 8. 情绪疏导（心态·低谷）—— 参考图 3 ============ */
function startEmotion() {
  let pressure = 71, score = 0, missedNeg = 0, wrongClick = 0, spawned = 0, total = 14, pile = 0;
  const thoughts = {
    neg: ['担心挂科', '怕被讨厌', '没完成计划', '焦虑', '内耗', '自卑'],
    pos: ['我可以慢慢来', '深呼吸', '会好的', '平静', '安心'],
    rare: ['✨治愈', '🌈释然']
  };
  mgSetLeft(`<div class="mg-panel-title">心理状态</div>${mgMeter('压力值', pressure, '🔥', 'purple')}${mgStatCard('🌊', '已疏导', score / 7)}${mgStatCard('⚠️', '堆积', pile)}`);
  mgSetStage(`<div class="emotion-scene" style="background-image:url('assets/meditate.png')"><div class="mg-bubble-area" id="emotion-area"></div></div>`);
  mgSetRight(`<div class="mg-panel-title">操作说明</div><div class="mg-instruction">点击清理杂念</div><div class="mg-instruction">保留平静想法</div><div class="mg-instruction">避免误点治愈</div>`);
  mgSetEventTip('杂念太快！先处理最焦虑的。');
  const area = document.getElementById('emotion-area');
  const timer = mgTimer(() => {
    if (spawned >= total) return;
    spawned++;
    const r = Math.random();
    const isNeg = r < 0.55;
    const isRare = !isNeg && r < 0.75;
    const b = document.createElement('div');
    b.className = 'mg-bubble ' + (isNeg ? 'neg' : isRare ? 'rare' : 'pos');
    b.textContent = isNeg ? mgPick(thoughts.neg) : isRare ? mgPick(thoughts.rare) : mgPick(thoughts.pos);
    b.style.left = (8 + Math.random() * 80) + '%'; b.style.animationDuration = (1.8 + Math.random() * 1.2) + 's';
    b.addEventListener('click', () => {
      if (isNeg) { score += 7; pile = Math.max(0, pile - 1); pressure = Math.max(0, pressure - 5); b.remove(); mgFlash('✅ 疏导成功'); }
      else if (isRare) { wrongClick++; pressure = Math.min(100, pressure + 5); b.remove(); mgFlash('❌ 误点治愈'); }
      else { pressure = Math.max(0, pressure - 2); b.remove(); }
      update();
    });
    b.addEventListener('animationend', () => { if (isNeg) { missedNeg++; pile++; pressure = Math.min(100, pressure + 4); } b.remove(); update(); if (pile >= 5) finishMiniGame(score - 30); else if (spawned >= total && area.children.length === 0) finishMiniGame(score); });
    area.appendChild(b);
  }, 500);
  function update() {
    mgSetLeft(`<div class="mg-panel-title">心理状态</div>${mgMeter('压力值', pressure, '🔥', 'purple')}${mgStatCard('🌊', '已疏导', Math.floor(score / 7))}${mgStatCard('⚠️', '堆积', pile)}`);
    mgEvalFromScore(100 - pressure);
  }
  mgTimeout(() => { if (mg.active) finishMiniGame(score); }, 12000);
}

/* ============ buff 栏渲染 ============ */
function renderBuffBar() {
  const bar = $('buff-bar'); if (!bar) return;
  const buffs = (typeof activeBuffs === 'function') ? activeBuffs() : [];
  if (!buffs.length) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  bar.innerHTML = buffs.map(b => `<span class="buff-chip buff-${b.type}" title="${escapeHtml(b.desc)}">${b.icon} ${escapeHtml(b.name)}${b.turnsLeft != null ? ' · ' + b.turnsLeft + '回合' : ''}</span>`).join('');
}
