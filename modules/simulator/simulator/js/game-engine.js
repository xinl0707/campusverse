/**
 * 游戏引擎：状态、数值、时钟、事件队列、存档
 */
'use strict';

const SAVE_KEY = 'save';
const SAVE_VERSION = '1.0';
const EVENTS_PER_SEMESTER = 6;   // 每学期 6 个事件
const SEMESTER_NAMES = [
  '大一上', '大一下', '大二上', '大二下',
  '大三上', '大三下', '大四上', '大四下'
];
const STAT_KEYS = ['energy', 'study', 'social', 'mental'];

// 事件预加载队列（后台最多持有 2 个待用事件）
let eventQueue = [];
let isPreloading = false;
let eventSeq = 0;

/** 当前游戏状态（null 表示未开局） */
let gameState = null;

/**
 * 创建新游戏
 * @param {Object} player - {name, gender, school, major, self_mbti}
 */
function newGame(player) {
  gameState = {
    version: SAVE_VERSION,
    player: {
      name: String(player.name || '').slice(0, 20),
      gender: player.gender || '其他',
      school: String(player.school || '').slice(0, 30),
      major: String(player.major || '').slice(0, 30),
      self_mbti: player.self_mbti || 'INFP'
    },
    current: {
      semester: 0,     // 0-7 对应 8 个学期
      month: 0,        // 每学期内第几个事件（0-5）
      energy: 80,
      study: 60,
      social: 50,
      mental: 70
    },
    subs: {
      energy: { body: 85, psycho: 75 },   // 身体精力 / 心理精力
      study: { major: 65, general: 55 },  // 专业课 / 常识课
      social: { friend: 60, romance: 40 } // 朋友关系 / 恋爱关系
    },
    history: {
      events: [],      // 事件全文记录（含场景、选项、玩家选择）
      choices: []      // 选择简记（含属性变化）
    },
    // 本学期起始属性快照（学期总结对比用）
    semesterStart: { energy: 80, study: 60, social: 50, mental: 70 },
    // 全程极值统计（成就系统 / 毕业报告用）
    metrics: {
      min: { energy: 80, study: 60, social: 50, mental: 70 },
      max: { energy: 80, study: 60, social: 50, mental: 70 },
      customCount: 0
    },
    // 已触发过的特殊事件（"学期：类型"，用于同学期冷却）
    specialsUsed: [],
    // 各属性是否已首次达到巅峰或跌入低谷（首达前放大增减幅度，让其更易首次达成）
    firstReached: {},
    // 已解锁的永久 buff（id 数组）与临时 buff（带剩余回合 turnsLeft）
    buffs: [],
    tempBuffs: [],
    // 事件类别排布表 + 游标（保证 48 个事件类别分布均衡，见 CATEGORY_QUOTA）
    categoryPlan: buildCategoryPlan(),
    planCursor: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  eventQueue = [];
  isPreloading = false;
  eventSeq = 0;
}

/** 是否已开局 */
function hasGame() {
  return gameState !== null;
}

/**
 * 彻底清空当前对局（「重新开始」用）
 * 只清内存态，不动存档；事件序号 eventSeq 一并归零，避免新一局的事件 id 与上一局撞车。
 * 注意：这里不重置 isPreloading——若后台仍在生成，让它自然收尾，避免并发预加载。
 */
function resetGame() {
  gameState = null;
  eventQueue = [];
  eventSeq = 0;
}

/** 学期中文名 */
function semesterName() {
  return SEMESTER_NAMES[clamp(gameState.current.semester, 0, 7)];
}

/** 全局已发生的事件数（0-47） */
function eventCount() {
  const { semester, month } = gameState.current;
  return semester * EVENTS_PER_SEMESTER + month;
}

/* ============ 事件类别配额 ============ */

/**
 * 48 个事件的类别配额
 * 实测问题：把类别交给 AI 自选时，它会大量生成学业类事件（语境里满是专业/学期/成绩），
 * 生活类事件被严重挤压。改为系统按配额分配，AI 只负责把指定类别写具体。
 * 合计 48：学业 / 实践 / 宿舍 / 运动 / 社交 / 娱乐 各 8，六类均匀发生。
 */
const CATEGORY_QUOTA = {
  学业: 8, 实践: 8, 宿舍: 8, 运动: 8, 社交: 8, 娱乐: 8
};

/**
 * 生成类别排布表：按配额铺开，尽量均匀且不连续重复
 * @returns {string[]} 长度 48 的类别序列
 */
function buildCategoryPlan() {
  const remaining = {};
  Object.keys(CATEGORY_QUOTA).forEach(k => { remaining[k] = CATEGORY_QUOTA[k]; });
  const total = Object.values(remaining).reduce((a, b) => a + b, 0);

  const plan = [];
  let prev = null;
  while (plan.length < total) {
    const cands = Object.keys(remaining).filter(k => remaining[k] > 0);
    if (!cands.length) break;
    // 先随机打散（用于打破同额并列），再按剩余数量降序取（稳定排序保留随机顺序）
    cands.sort(() => Math.random() - 0.5);
    cands.sort((a, b) => remaining[b] - remaining[a]);
    const pick = cands.find(k => k !== prev) || cands[0];
    plan.push(pick);
    remaining[pick] -= 1;
    prev = pick;
  }
  return plan;
}

/* ============ 属性档位与毕业去向（供 AI 文案对齐） ============ */

/**
 * 属性档位描述：0-100 分五档
 * 用途：把数值翻成人话塞进提示词，避免"精力 5 却写出精力充沛"这类与数据矛盾的文案
 */
const STAT_LEVELS = {
  energy: ['濒临透支', '长期疲惫', '勉强支撑', '状态尚可', '精力充沛'],
  study: ['基础薄弱', '学业吃力', '中规中矩', '学有余力', '成绩优异'],
  social: ['近乎独行', '圈子很小', '有几个朋友', '人缘不错', '左右逢源'],
  mental: ['情绪低谷', '时常低落', '偶有起伏', '比较稳定', '内心笃定']
};

/** 数值 → 档位词 */
function statLevel(key, value) {
  const v = clamp(Number(value) || 0, 0, 100);
  const idx = v < 20 ? 0 : v < 40 ? 1 : v < 60 ? 2 : v < 80 ? 3 : 4;
  return STAT_LEVELS[key][idx];
}

/** 四维属性的一句话快照，如「精力 5/100：濒临透支」 */
function statSnapshot(indent) {
  const c = gameState.current;
  const pad = indent || '';
  return STAT_KEYS.map(k => {
    const name = { energy: '精力', study: '学业', social: '人际', mental: '心态' }[k];
    return `${pad}- ${name} ${c[k]}/100:${statLevel(k, c[k])}`;
  }).join('\n');
}

/**
 * 毕业去向判定（规则优先，保证与属性一致）
 * AI 只负责围绕判定结果写描述，不再自行决定去向
 * @returns {{destination: string, reason: string}}
 */
function pickDestination() {
  const c = gameState.current;
  const s = c.study, o = c.social, m = c.mental, e = c.energy;

  if (s > 80 && e > 60) return { destination: '申请到海外高校深造', reason: '学业突出且体力跟得上，能扛住申请与出国的消耗' };
  if (s > 75 && m > 60) return { destination: '考研上岸', reason: '学业扎实、心态稳定，撑过了备考的长期战' };
  if (o > 70 && m > 70 && e > 65) return { destination: '选择创业', reason: '人际与心态俱佳，且还有体力去折腾' };
  if (s > 65 && o > 65 && m > 55) return { destination: '考公上岸', reason: '学业与人脉都够用，心态也稳' };
  // 心态或学业已经跌破可用线 → 先缓一口气（放在就业判定之前，避免"心态 25 还直接就业"）
  if (m < 40 || s < 40) return { destination: '暂待休整，重新出发', reason: '心态或学业跌破可用线，先把自己找回来' };
  if (s > 55 && o > 55) return { destination: '进入企业就业', reason: '学业与人际都达到就业线' };
  if (o > 60) return { destination: '靠人脉进入一家小公司', reason: '学业平平但人际尚可，靠朋友牵线落脚' };
  return { destination: '边工作边寻找方向', reason: '各项都不突出，先就业再择业' };
}

/**
 * 取下一个事件类别（按生成顺序推进，保证预加载的多个事件不会拿到同一类别）
 * @returns {string} 类别名
 */
function takeCategory() {
  if (!gameState) return '日常';
  if (!Array.isArray(gameState.categoryPlan) || !gameState.categoryPlan.length) {
    gameState.categoryPlan = buildCategoryPlan();
  }
  let i = Number(gameState.planCursor) || 0;
  if (i >= gameState.categoryPlan.length) {
    gameState.categoryPlan = buildCategoryPlan();   // 超出配额则重新洗牌
    i = 0;
  }
  gameState.planCursor = i + 1;
  return gameState.categoryPlan[i];
}

/**
 * 属性权重平衡（设计文档 4.2）
 *
 * 实测问题：精力消耗过快、经常提前见底；学业/人际/心态增长过快、早早封顶。
 * 因此在 AI 给出原始变化量后，由本函数做二次调节：
 *   · 精力：消耗类衰减（越低衰减越强），恢复类额外加成，保证回血给足
 *   · 学业/人际/心态：正向增长按当前值边际递减，避免过早封顶
 *   · 任意维度处于低值时，负向变化减半，避免雪崩式崩盘
 *
 * @param {string} key - 属性键 energy/study/social/mental
 * @param {number} delta - AI 给出的原始变化量（已钳制到 [-25, 25]）
 * @param {number} current - 该属性当前值
 * @returns {number} 平衡后的实际变化量
 */
function balanceDelta(key, delta, current) {
  if (delta === 0) return 0;

  // 软边界：距离目标边界不足 SOFT_ZONE 时，朝该方向的变化按比例衰减。
  // 对上下两个方向对称生效，因此中区间不会产生净漂移（否则会导致某一维单向滑坡）。
  const SOFT_ZONE = 30;   // 软边界宽度
  const MIN_FACTOR = 0.2; // 贴边时的最小系数（仍保留一丝变化，允许极端打法触顶/见底）

  if (delta > 0) {
    const factor = clamp((100 - current) / SOFT_ZONE, MIN_FACTOR, 1);
    return Math.round(delta * factor);
  }

  let factor = clamp(current / SOFT_ZONE, MIN_FACTOR, 1);
  // 精力额外保护：用真实事件池实测发现，精力负向远多于正向（均值约 -7.5/选项），
  // 48 回合足以把精力榨干——随机策略下 84% 的局毕业时精力 ≤20，会频繁触发危机事件。
  // 这里对"消耗侧"分段衰减，越接近见底越难继续掉，把它稳成一个需要经营但不会崩的资源。
  if (key === 'energy') {
    if (current < 30) factor = Math.min(factor, 0.35);
    else if (current < 50) factor = Math.min(factor, 0.6);
  }
  return Math.round(delta * factor);
}

/**
 * 应用属性变化：先钳制 AI 原始值 [-25, +25]，经权重平衡后作用于 0-100
 * @param {Object} effects - {energy, study, social, mental}
 * @returns {Object} 实际生效的变化量（考虑边界截断后）
 */
function applyEffects(effects) {
  const changed = {};
  effects = effects || {};

  STAT_KEYS.forEach(key => {
    let delta = Math.round(Number(effects[key]) || 0);
    // 首次达到巅峰 / 跌入低谷前：放大该属性增减幅度（×1.5），使其更易首次达成；
    // 社交除外（已有专属回落机制）。首达后该标记置真，幅度回归正常（×1.0），二次达成更慢但不封死。
    if (key !== 'social' && gameState.firstReached && !gameState.firstReached[key]) {
      delta = Math.round(delta * 1.5);
    }
    delta = clamp(delta, -25, 25);
    if (delta === 0) return;

    const before = gameState.current[key];
    // 权重平衡（设计文档 4.2）
    delta = clamp(balanceDelta(key, delta, before), -25, 25);
    // buff 数值介入：完美通关解锁的永久 / 临时增益在此真实生效
    delta = clamp(applyBuffModifiers(key, delta), -30, 30);
    // 人际巅峰回落期：增益减半、损耗略增（幅度温和，不荒唐），使其难以快速重回 90
    if (key === 'social' && gameState.socialPeakArmed === false) {
      if (delta > 0) delta = Math.round(delta * 0.5);
      else if (delta < 0) delta = Math.round(delta * 1.2);
    }

    const after = clamp(before + delta, 0, 100);
    if (after === before) return;      // 平衡后归零的变化不写入，避免"±0"刷屏
    gameState.current[key] = after;
    // 人际跌回阈值（70）以下后，才重新允许触发人际巅峰，避免刚巅峰又立刻再巅峰
    if (key === 'social' && after < 70) gameState.socialPeakArmed = true;
    changed[key] = after - before;

    // 记录极值（成就系统与毕业报告用）
    touchMetrics(key, after);

    // 子项目跟随主属性变化（各承担 60% / 40%）
    const subs = gameState.subs[key];
    if (subs) {
      const subKeys = Object.keys(subs);
      subKeys.forEach((sk, i) => {
        const share = delta * (i === 0 ? 0.6 : 0.4);
        subs[sk] = clamp(Math.round(subs[sk] + share), 0, 100);
      });
    }
  });

  return changed;
}

/**
 * 更新属性极值统计（兼容旧存档缺 metrics 字段的情况）
 * @param {string} key - 属性键
 * @param {number} value - 变化后的值
 */
function touchMetrics(key, value) {
  if (!gameState.metrics) {
    gameState.metrics = { min: {}, max: {}, customCount: 0 };
  }
  const m = gameState.metrics;
  m.min[key] = m.min[key] === undefined ? value : Math.min(m.min[key], value);
  m.max[key] = m.max[key] === undefined ? value : Math.max(m.max[key], value);
}

/**
 * 推进时钟：month+1，满 6 进位到下学期
 */
function advanceClock() {
  gameState.current.month += 1;
  if (gameState.current.month >= EVENTS_PER_SEMESTER) {
    gameState.current.month = 0;
    gameState.current.semester += 1;
  }
  // 临时 buff 回合递减，到期自动移除
  if (Array.isArray(gameState.tempBuffs)) {
    gameState.tempBuffs = gameState.tempBuffs
      .map(b => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
      .filter(b => b.turnsLeft > 0);
  }
  gameState.updatedAt = Date.now();
}

/** 是否已到达毕业节点（8 学期 × 6 事件 = 48） */
function isFinished() {
  return gameState.current.semester >= SEMESTER_NAMES.length;
}

/** 本学期是否刚结束（学期总结触发条件） */
function isSemesterEnd() {
  return gameState.current.month === 0 && !isFinished();
}

/**
 * 属性状态提示（注入事件生成提示词，影响危机/巅峰事件倾向）
 * @returns {string} '' | 危机描述 | 巅峰描述
 */
function statusHint() {
  const lowMap = {
    energy: '精力枯竭（极度疲惫，需要恢复类事件）',
    study: '学业告急（濒临挂科，需要学业相关事件）',
    social: '人际孤立（孤独低落，需要社交温暖类事件）',
    mental: '心态崩溃边缘（情绪低谷，需要疗愈或危机事件）'
  };
  const highMap = {
    energy: '精力巅峰', study: '学业巅峰', social: '人际巅峰', mental: '心态巅峰'
  };
  for (const key of STAT_KEYS) {
    if (gameState.current[key] < 10) return '⚠️ ' + lowMap[key] + '。请优先生成与之相关的危机/转折事件，且该事件应包含能明显回血（+10 以上）的选项。';
  }
  for (const key of STAT_KEYS) {
    if (gameState.current[key] >= 90) return '✨ ' + highMap[key] + '。可生成与该维度相关的巅峰/高光事件。';
  }
  return '';
}

/* ============ 属性压力提示（防止软性维度只涨不跌） ============ */

/**
 * 中区间（非危机/巅峰）的属性压力提示。
 *
 * 实测发现：AI 对心态 / 人际这类"软维度"几乎只给正反馈——18 个事件 54 个选项里
 * 心态有 43 个正值、仅 7 个负值，72% 的事件三个选项全为正，玩家根本没得降，
 * 于是这两维一路飙到高位下不来。这里用规则把压力显式喂给模型：
 * 属性偏高 → 必须提供让它下滑的选项；属性偏低 → 必须提供让它回升的选项。
 *
 * @returns {string} '' 或压力提示
 */
function statPressureHint() {
  const c = gameState.current;
  const NAME = { energy: '精力', study: '学业', social: '人际', mental: '心态' };
  const HIGH = 70;
  const LOW = 30;

  const high = STAT_KEYS.filter(k => c[k] >= HIGH);
  const low = STAT_KEYS.filter(k => c[k] <= LOW);

  const parts = [];
  if (high.length) {
    parts.push(
      `⚖️ 高位压力：${high.map(k => `${NAME[k]} ${c[k]}`).join('、')} 已处于高位。` +
      `维持高位是有代价的（维护关系要花时间、撑住心态往往要压抑别的），` +
      `本次事件必须为这些维度各提供至少一个明显下滑的选项（-6 以上），不要三个选项全给正反馈。`
    );
  }
  if (low.length) {
    parts.push(
      `🪂 低位机会：${low.map(k => `${NAME[k]} ${c[k]}`).join('、')} 偏低。` +
      `本次事件至少要有一个选项能让它们明显回升（+6 以上），别让玩家永远翻不了身。`
    );
  }
  return parts.join('\n');
}

/* ============ 危机 / 巅峰事件触发（设计文档 4.2） ============ */

const CRISIS_STATS = STAT_KEYS;                    // 任一属性 < 10 触发危机
const PEAK_STATS = STAT_KEYS;                       // 四属性 >= 90 均可触发巅峰（含精力）

/**
 * 上一次结算后是否应触发特殊事件
 * 危机：任一属性 < 10（如精力枯竭 → 生病）
 * 巅峰：任一属性 >= 90
 * 同一学期内每种类型只触发一次，避免属性持续越界时连环触发
 * @returns {{type: 'crisis'|'peak', stat: string}|null}
 */
function checkSpecialTrigger() {
  if (!hasGame()) return null;
  const c = gameState.current;
  const used = gameState.specialsUsed || [];
  const sem = String(c.semester);
  const canUse = type => !used.includes(sem + ':' + type);

  for (const key of CRISIS_STATS) {
    if (c[key] < 10 && canUse('crisis')) return { type: 'crisis', stat: key };
  }
  for (const key of PEAK_STATS) {
    // 人际巅峰后须先真正回落（人际跌破阈值）才能再次触发，避免刚巅峰又立刻再巅峰
    if (key === 'social' && gameState.socialPeakArmed === false) continue;
    if (c[key] >= 90 && canUse('peak')) return { type: 'peak', stat: key };
  }
  return null;
}

/** 标记某类特殊事件本学期已用过 */
function markSpecialUsed(type) {
  if (!gameState.specialsUsed) gameState.specialsUsed = [];
  const tag = String(gameState.current.semester) + ':' + type;
  if (!gameState.specialsUsed.includes(tag)) gameState.specialsUsed.push(tag);
}

/* ============ buff 系统（完美通关小游戏解锁） ============ */

// buff 元数据：id → 名称/描述/类型/作用属性/数值系数
const BUFF_META = {
  // 巅峰完美解锁（永久，宿舍团宠为短期临时）
  dorm_pet:      { name: '宿舍团宠', icon: '🎂', type: 'temp', turns: 6,  stat: 'social',  desc: '短期人际互动收益翻倍' },
  energy_master: { name: '活力达人', icon: '⚡', type: 'perm', stat: 'energy',  desc: '体力消耗永久小幅降低' },
  study_gain:    { name: '学霸光环', icon: '📚', type: 'perm', stat: 'study',   desc: '学习收益永久小幅提升' },
  emotion_immune:{ name: '情绪免扰', icon: '🧘', type: 'perm', stat: 'mental',  desc: '负面事件带来的属性衰减减半' },
  // 低谷完美解锁（永久）
  social_warm:   { name: '暖心社交', icon: '💬', type: 'perm', stat: 'social',  desc: '人际更易回升（负向伤害降低）' },
  tough_body:    { name: '抗压体魄', icon: '🛡️', type: 'perm', stat: 'energy',  desc: '熬夜劳累不再大幅消耗精力' },
  study_catchup: { name: '查漏补缺', icon: '🔍', type: 'perm', stat: 'study',   desc: '后续学习收益小幅提升' },
  self_heal:     { name: '自愈人格', icon: '🌱', type: 'perm', stat: 'mental',  desc: '心态恢复速度大幅提升' }
};

/** 是否已持有某 buff（永久或临时均可） */
function hasBuff(id) {
  if (!gameState) return false;
  return (gameState.buffs || []).includes(id) || (gameState.tempBuffs || []).some(b => b.id === id);
}

/**
 * 把一条属性的变化量经过 buff 系数修正
 * @param {string} key - energy/study/social/mental
 * @param {number} delta - 平衡后的原始变化量
 * @returns {number} 修正后的变化量
 */
function applyBuffModifiers(key, delta) {
  if (!gameState || delta === 0) return delta;
  const perm = gameState.buffs || [];
  const temp = (gameState.tempBuffs || []).map(b => b.id);
  const has = id => perm.includes(id) || temp.includes(id);
  let d = delta;

  if (key === 'social') {
    if (d > 0 && has('dorm_pet')) d = Math.round(d * 1.5);
    if (d < 0 && has('social_warm')) d = Math.round(d * 0.7);
  }
  if (key === 'energy') {
    if (d < 0) {
      let f = 1;
      if (has('energy_master')) f *= 0.7;
      if (has('tough_body')) f *= 0.8;
      d = Math.round(d * f);
    }
  }
  if (key === 'study') {
    if (d > 0) {
      let f = 1;
      if (has('study_gain')) f *= 1.2;
      if (has('study_catchup')) f *= 1.15;
      d = Math.round(d * f);
    }
  }
  if (key === 'mental') {
    if (d < 0 && has('emotion_immune')) d = Math.round(d * 0.5);
    if (d > 0 && has('self_heal')) d = Math.round(d * 1.2);
  }
  return d;
}

/** 解锁 buff（永久直接入 buffs；临时写入 tempBuffs 带回合） */
function unlockBuff(id) {
  if (!gameState) return;
  const meta = BUFF_META[id];
  if (!meta) return;
  if (meta.type === 'perm') {
    if (!gameState.buffs) gameState.buffs = [];
    if (!gameState.buffs.includes(id)) gameState.buffs.push(id);
  } else {
    if (!gameState.tempBuffs) gameState.tempBuffs = [];
    const exist = gameState.tempBuffs.find(b => b.id === id);
    if (exist) exist.turnsLeft = Math.max(exist.turnsLeft, meta.turns);
    else gameState.tempBuffs.push({ id, turnsLeft: meta.turns });
  }
}

/** 当前生效的所有 buff（永久 + 临时），供 UI 展示 */
function activeBuffs() {
  if (!gameState) return [];
  const out = [];
  (gameState.buffs || []).forEach(id => {
    const m = BUFF_META[id];
    if (m) out.push({ id, ...m, turnsLeft: null });
  });
  (gameState.tempBuffs || []).forEach(b => {
    const m = BUFF_META[b.id];
    if (m) out.push({ id: b.id, ...m, turnsLeft: b.turnsLeft });
  });
  return out;
}

/** 最近 n 次选择摘要（供 AI 保持叙事连贯） */
function recentChoicesSummary(n = 3) {
  const list = gameState.history.choices.slice(-n);
  if (list.length === 0) return '（刚刚入学，尚无选择）';
  return list.map(c => `${c.choice}（${semesterTimeLabel(c.semester, c.month)}）`).join('；');
}

/** 时间标签，如 "大一上 · 第 3 个节点" */
function semesterTimeLabel(semester, month) {
  return `${SEMESTER_NAMES[clamp(semester, 0, 7)]} · 第 ${month + 1} 个节点`;
}

/** 记录一次选择到历史 */
function recordChoice(event, choiceText, changed, feedback) {
  const { semester, month } = gameState.current;
  const isCustom = !!(event && event._customChoice);
  if (isCustom && gameState.metrics) {
    gameState.metrics.customCount = (gameState.metrics.customCount || 0) + 1;
  }
  gameState.history.events.push({
    id: event.id,
    semester,
    month,
    category: event.category,
    location: event.location,
    scene: event.scene,
    choice: choiceText,
    custom: isCustom
  });
  gameState.history.choices.push({
    semester,
    month,
    choice: choiceText,
    effects: changed,
    feedback: feedback || '',
    imageFilename: event ? (event.imageFilename || null) : null,
    background: event ? (event.background || null) : null
  });
}

/* ================= 事件队列与预加载（设计文档 5.5 节） ================= */

/** 取出下一个就绪事件；没有则返回 null */
function takeEvent() {
  return eventQueue.shift() || null;
}

/** 队列中是否已有就绪事件 */
function hasReadyEvent() {
  return eventQueue.length > 0;
}

/**
 * 后台预生成事件（不阻塞当前交互）
 * @param {Function} generateFn - 返回事件 Promise 的生成函数
 */
function preloadNextEvent(generateFn) {
  if (isPreloading || eventQueue.length >= 3 || !hasGame() || isFinished()) return;
  isPreloading = true;
  generateFn()
    .then(event => {
      if (event) eventQueue.push(event);
    })
    .catch(err => {
      console.warn('预加载事件失败:', err.message);
    })
    .finally(() => {
      isPreloading = false;
    });
}

/* ================= 成就系统（设计文档 P2） ================= */

/**
 * 成就定义
 * test(current, metrics, history) —— 返回 true 即解锁
 */
const ACHIEVEMENTS = [
  { id: 'scholar',   icon: '📚', name: '满绩学霸',   desc: '毕业时学业达到 85',        test: c => c.study >= 85 },
  { id: 'social',    icon: '👥', name: '社交达人',   desc: '毕业时人际达到 85',        test: c => c.social >= 85 },
  { id: 'engine',    icon: '⚡', name: '永动机',     desc: '毕业时精力仍不低于 80',    test: c => c.energy >= 80 },
  { id: 'mind',      icon: '💚', name: '心态王者',   desc: '毕业时心态达到 85',        test: c => c.mental >= 85 },
  { id: 'survivor',  icon: '🔥', name: '极限求生',   desc: '有属性曾跌破 15 又撑了回来', test: (c, m) => STAT_KEYS.some(k => (m.min[k] !== undefined && m.min[k] < 15)) },
  { id: 'hexagon',   icon: '🌟', name: '六边形战士', desc: '毕业时四维全部不低于 65',  test: c => STAT_KEYS.every(k => c[k] >= 65) },
  { id: 'nightowl',  icon: '🌙', name: '熬夜冠军',   desc: '精力曾低于 20，学业仍达 70', test: (c, m) => m.min.energy < 20 && c.study >= 70 },
  { id: 'chill',     icon: '🧘', name: '佛系青年',   desc: '学业低于 45，心态却稳在 70 以上', test: c => c.study < 45 && c.mental >= 70 },
  { id: 'freedom',   icon: '✍️', name: '自由灵魂',   desc: '自定义行动用过 5 次以上',  test: (c, m) => m.customCount >= 5 },
  { id: 'graduate',  icon: '🎓', name: '全勤毕业',   desc: '走完全部 48 个关键节点',    test: (c, m, h) => h.choices.length >= 48 }
];

/**
 * 结算已解锁的成就
 * @returns {Array} 解锁的成就对象数组
 */
function computeAchievements() {
  if (!hasGame()) return [];
  const m = gameState.metrics || { min: {}, max: {}, customCount: 0 };
  const h = gameState.history || { events: [], choices: [] };
  const c = gameState.current;
  return ACHIEVEMENTS.filter(a => {
    try {
      return !!a.test(c, m, h);
    } catch (e) {
      return false;
    }
  });
}

/* ================= 存档 ================= */

function saveGame() {
  if (!hasGame()) return false;
  gameState.updatedAt = Date.now();
  StorageManager.save(SAVE_KEY, gameState);
  return true;
}

function hasSave() {
  return StorageManager.load(SAVE_KEY) !== null;
}

function loadSavedGame() {
  const data = StorageManager.load(SAVE_KEY);
  if (!data || !data.player || !data.current) return false;

  // 版本兼容：不同版本存档仅提示，仍尝试用默认值补齐字段
  if (data.version && data.version !== SAVE_VERSION) {
    console.warn(`存档版本 ${data.version} 与当前 ${SAVE_VERSION} 不一致，已按兼容模式加载`);
  }

  // 版本兼容：字段缺失时补默认值
  gameState = data;
  gameState.subs = gameState.subs || {
    energy: { body: gameState.current.energy, psycho: gameState.current.energy },
    study: { major: gameState.current.study, general: gameState.current.study },
    social: { friend: gameState.current.social, romance: gameState.current.social }
  };
  gameState.history = gameState.history || { events: [], choices: [] };
  gameState.semesterStart = gameState.semesterStart || { ...gameState.current };
  if (!gameState.metrics) {
    gameState.metrics = {
      min: { ...gameState.current }, max: { ...gameState.current }, customCount: 0
    };
  } else {
    gameState.metrics.min = gameState.metrics.min || {};
    gameState.metrics.max = gameState.metrics.max || {};
    gameState.metrics.customCount = gameState.metrics.customCount || 0;
  }
  if (!Array.isArray(gameState.specialsUsed)) gameState.specialsUsed = [];
  // 各属性首次达成标记（首达前放大增减幅度）；旧存档已处极值的视为已首达
  if (!gameState.firstReached) gameState.firstReached = {};
  STAT_KEYS.forEach(k => {
    const v = gameState.current[k];
    if (v >= 90 || v < 10) gameState.firstReached[k] = true;
  });
  // 旧存档没有类别排布表：按配额补一份，游标从已发生事件数续上
  if (!Array.isArray(gameState.categoryPlan) || !gameState.categoryPlan.length) {
    gameState.categoryPlan = buildCategoryPlan();
    gameState.planCursor = eventCount();
  }
  gameState.planCursor = Number(gameState.planCursor) || 0;
  eventQueue = [];
  isPreloading = false;
  return true;
}

function clearSave() {
  StorageManager.remove(SAVE_KEY);
}
