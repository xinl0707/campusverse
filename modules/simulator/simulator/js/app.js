/**
 * 模拟器主逻辑入口：页面流转 + 渲染 + 交互
 */
'use strict';

const $ = id => document.getElementById(id);

const STAT_NAMES = { energy: '⚡ 精力', study: '📚 学业', social: '👥 人际', mental: '💚 心态' };

/** 当前展示中的事件 */
let currentEvent = null;
/** 毕业报告数据（供分享） */
let finalData = null;
/** 待播放的危机/巅峰事件 (Promise 形式持有，避免被预加载队列状态吞掉) */
let specialPromise = null;
/** 上一个待播放特殊事件的类型 (用于加载文案) */
let specialType = null;

/* ================= 预设数据 ================= */

const PRESET_SCHOOLS = [
  '杭州电子科技大学', '浙江大学', '浙江工业大学', '宁波大学',
  '浙江师范大学', '浙江理工大学', '温州大学', '浙江工商大学',
  '中国计量大学', '浙江农林大学', '浙江中医药大学',
  '复旦大学', '上海交通大学', '同济大学', '南京大学',
  '武汉大学', '华中科技大学', '四川大学', '中山大学'
];

const PRESET_MAJORS = [
  '计算机科学与技术', '人工智能', '软件工程', '电子信息工程',
  '通信工程', '自动化', '数据科学', '网络安全',
  '机械工程', '工商管理', '会计学', '金融学',
  '汉语言文学', '英语', '法学', '临床医学',
  '经济学', '市场营销', '土木工程', '建筑设计'
];

const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP'
];

/**
 * MBTI 四维度选择（降低认知门槛：不直接让用户从 16 型里挑，
 * 而是每个维度二选一，附带一句大白话提示）
 */
const MBTI_DIMS = [
  { dim: '能量来源', left: ['I', '内向', '独处充电，热闹了耗电'], right: ['E', '外向', '和人待着更有劲'] },
  { dim: '认知方式', left: ['N', '直觉', '爱琢磨概念和可能性'], right: ['S', '实感', '更关注实际与细节'] },
  { dim: '决策方式', left: ['T', '思考', '先讲逻辑对不对'], right: ['F', '情感', '先看感受暖不暖'] },
  { dim: '生活态度', left: ['J', '计划', '计划定好才安心'], right: ['P', '随性', '随机应变更自在'] }
];

/* ================= 页面切换 ================= */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
  // 背景图只在游戏页显示（事件 + 结果反馈阶段），其他页面一律收起
  if (id !== 'screen-game') $('fixed-bg').classList.add('hidden');
}

function showLoading(text) {
  $('loading-text').textContent = text || 'AI 正在构思剧情……';
  $('game-loading').classList.remove('hidden');
}
function hideLoading() {
  $('game-loading').classList.add('hidden');
}

/* ================= 页面内确认框 ================= */
/**
 * 替代浏览器原生 confirm。
 * 原生 confirm 在部分内嵌浏览器 / 沙箱 iframe 里会被静默拦截并直接返回 false，
 * 表现就是「点了按钮毫无反应」，所以全部改成页面内的自定义弹窗。
 * @param {string} text - 提示文案
 * @param {string} [okText] - 确认按钮文字
 * @returns {Promise<boolean>}
 */
function confirmDialog(text, okText) {
  return new Promise(resolve => {
    const mask = $('confirm-mask');
    const okBtn = $('confirm-ok');
    $('confirm-text').textContent = text;
    okBtn.textContent = okText || '确定';
    mask.classList.remove('hidden');

    let settled = false;
    function close(result) {
      if (settled) return;
      settled = true;
      mask.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      $('confirm-cancel').removeEventListener('click', onCancel);
      mask.removeEventListener('click', onMask);
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    }
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onMask = e => { if (e.target === mask) close(false); };
    const onKey = e => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };

    okBtn.addEventListener('click', onOk);
    $('confirm-cancel').addEventListener('click', onCancel);
    mask.addEventListener('click', onMask);
    document.addEventListener('keydown', onKey, true);
    okBtn.focus();
  });
}

/* ================= 彻底重置 ================= */

/**
 * 清空一局留下的全部痕迹，回到「刚打开页面」的状态。
 * 重新开始 / 再来一次 都走这里，避免上一局的输入、预加载事件、
 * 未播完的打字动画残留到下一局。
 */
function hardReset() {
  // 1. 停掉所有可能还在跑的打字动画
  ['event-scene-text', 'result-feedback', 'semester-text', 'final-closing'].forEach(id => {
    const el = $(id);
    if (el) stopTyping(el);
  });

  // 2. 丢弃内存中的对局与待播事件
  resetGame();
  currentEvent = null;
  specialPromise = null;
  specialType = null;
  finalData = null;

  // 3. 复位面板：结果面板收起，回到事件面板，收起蛋糕小游戏
  $('panel-result').classList.add('hidden');
  $('panel-event').classList.remove('hidden');
  $('custom-box').classList.add('hidden');
  $('minigame-overlay').classList.add('hidden');
  $('options-list').classList.remove('hidden');
  if (typeof mg !== 'undefined') mg.active = false;
  resetCustomInput();

  // 4. 清空欢迎页姓名输入和其他表单（不含预设下拉选项本身）
  welcomeName = '';
  // 同时清空输入框实际值与创建页姓名显示区，否则「再来一次」后旧名残留且无处重填
  const nameInput = $('inp-welcome-name');
  if (nameInput) { nameInput.value = ''; nameInput.focus(); }
  const nameDisplay = $('display-welcome-name');
  if (nameDisplay) nameDisplay.textContent = '未填写';
  $('inp-school').value = '';
  $('inp-major').value = '';
  $('inp-school').classList.add('hidden');
  $('inp-major').classList.add('hidden');
  $('sel-school').selectedIndex = 0;
  $('sel-major').selectedIndex = 0;
  $('gender-group').querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('#mbti-dims .dim-btn').forEach(b => b.classList.remove('selected'));
  Object.keys(mbtiPick).forEach(k => delete mbtiPick[k]);
  updateMbtiResult();
}

/* ================= 打字机效果 (AI 文案逐字输出，点击可跳过) ================= */

/** 停止某元素上的打字动画 (在直接覆盖 textContent 前调用，防止旧计时器继续覆写) */
function stopTyping(el) {
  if (el._twTimer) { clearInterval(el._twTimer); el._twTimer = null; }
  el.classList.remove('typing');
  if (el._twSkip) el.removeEventListener('click', el._twSkip);
}

/** 打字机：短文案每字间隔（毫秒），越大越慢 —— 约每秒 29 字 */
const TYPE_SLOW_MS = 34;
/** 打字机：超长文案的最快每字间隔，保证不会让人干等 */
const TYPE_FAST_MS = 12;
/** 打字机：长文案的目标总时长，超过后自动提速（平滑加速，不会出现速度突变） */
const TYPE_TARGET_MS = 6000;

/**
 * 让元素内的文本逐字出现，避免 AI 文案生硬弹出
 * - 速度：短文案每秒约 29 字；文案越长单字间隔越短，总时长收敛到 6 秒左右
 * - 点击文本立即显示全部
 * - 每个元素独立计时器，互不打断
 * @param {HTMLElement} el - 目标元素
 * @param {string} text - 完整文案
 */
function typewrite(el, text) {
  text = String(text || '');
  if (el._twTimer) { clearInterval(el._twTimer); el._twTimer = null; }

  // 先完整渲染一遍测量最终高度并锁住 min-height：
  // 之后逐字打字时卡片不再随文字变多而长高，中间滚动区不会跳动
  el.style.minHeight = '';
  if (text.length > 20 && el.offsetParent !== null) {
    el.textContent = text;
    el.style.minHeight = el.offsetHeight + 'px';
  }

  // n = 已输出的字符数（done 依赖它补全剩余字符，保证文本完整）
  let n = 0;

  // 只追加当前新字，不重建前面的字
  const appendChar = (char) => {
    const span = document.createElement('span');
    span.className = 'new-text';
    span.textContent = char;
    // 每个字出现时立即开始动画，2s 后完全清晰
    span.style.animationDelay = '0ms';
    el.appendChild(span);
  };

  const done = () => {
    if (el._twTimer) { clearInterval(el._twTimer); el._twTimer = null; }
    // 点击跳过或收尾时序边界：补全未输出的字符，修复「丢最后一个字」
    while (n < text.length) { appendChar(text[n]); n += 1; }
    // 不再重建 innerHTML，保留 span 结构让 CSS 动画自然走完
    setTimeout(() => {
      el.querySelectorAll('.new-text').forEach(span => {
        span.classList.remove('new-text');
      });
    }, 1000);
    el.removeEventListener('click', el._twSkip);
  };
  el._twSkip = done;
  el.addEventListener('click', el._twSkip);

  // 极短文案 (如系统提示语) 直接显示，不打字
  if (text.length <= 20) { n = text.length; el.innerHTML = text; done(); return; }

  el.classList.add('typing');
  el.innerHTML = '';
  // 文案越长，单字间隔越短 (平滑加速，不跳档)
  const interval = Math.max(TYPE_FAST_MS,
    Math.min(TYPE_SLOW_MS, Math.round(TYPE_TARGET_MS / text.length)));
  el._twTimer = setInterval(() => {
    appendChar(text[n]);
    n += 1;
    if (n >= text.length) done();
  }, interval);
}

/* ================= 初始化 ================= */

function init() {
  buildSelect($('sel-school'), PRESET_SCHOOLS, '✏️ 其他学校（手动输入）…');
  buildSelect($('sel-major'), PRESET_MAJORS, '✏️ 其他专业（手动输入）…');
  buildChips();
  bindWelcome();
  bindCreate();
  bindGame();

  if (hasSave()) {
    $('btn-continue').classList.remove('hidden');
  }
}

function buildSelect(sel, items, customLabel) {
  const frag = document.createDocumentFragment();
  items.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    frag.appendChild(opt);
  });
  const custom = document.createElement('option');
  custom.value = '__custom';
  custom.textContent = customLabel;
  frag.appendChild(custom);
  sel.appendChild(frag);

  sel.addEventListener('change', () => {
    const inp = sel.id === 'sel-school' ? $('inp-school') : $('inp-major');
    inp.classList.toggle('hidden', sel.value !== '__custom');
    if (sel.value !== '__custom') inp.value = '';
  });
}

/** 四个维度的选择结果（下标 0-3 对应 MBTI_DIMS），齐了才能开局 */
const mbtiPick = {};

function buildChips() {
  // 性别单选
  $('gender-group').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $('gender-group').querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
  });

  // MBTI：四个维度各选一个字母
  const dimsBox = $('mbti-dims');
  MBTI_DIMS.forEach((d, idx) => {
    const row = document.createElement('div');
    row.className = 'mbti-dim';
    row.innerHTML = `<div class="dim-name">${d.dim}</div>`;
    const opts = document.createElement('div');
    opts.className = 'dim-opts';

    [['left'], ['right']].forEach(([side]) => {
      const [letter, name, hint] = d[side];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dim-btn';
      btn.innerHTML = `<b>${letter}</b><span>${name}</span><small>${hint}</small>`;
      btn.addEventListener('click', () => {
        row.querySelectorAll('.dim-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        mbtiPick[idx] = letter;
        updateMbtiResult();
      });
      opts.appendChild(btn);
    });

    row.appendChild(opts);
    dimsBox.appendChild(row);
  });
}

function updateMbtiResult() {
  const picked = Object.keys(mbtiPick).length;
  const type = [0, 1, 2, 3].map(i => mbtiPick[i] || '·').join('');
  $('mbti-result-text').textContent = type;
  $('mbti-result-hint').textContent = picked === 4 ? '' : `（还差 ${4 - picked} 项）`;
}

/** 四个维度都选完后拼出完整 MBTI，否则返回空串 */
function selfMbtiValue() {
  if (Object.keys(mbtiPick).length < 4) return '';
  return [0, 1, 2, 3].map(i => mbtiPick[i]).join('');
}

/** 欢迎页输入的姓名（后续步骤可直接使用） */
let welcomeName = '';

function bindWelcome() {
  // 姓名输入框实时监听
  const nameInput = $('inp-welcome-name');
  nameInput.addEventListener('input', () => {
    welcomeName = nameInput.value.trim();
  });

  $('btn-start').addEventListener('click', () => {
    if (!welcomeName) {
      showToast('请先填写姓名', 'error');
      nameInput.focus();
      return;
    }
    showScreen('screen-create');
  });

  $('btn-continue').addEventListener('click', () => {
    if (!loadSavedGame()) {
      showToast('存档已失效，请重新开始', 'error');
      return;
    }
    specialPromise = null;
    specialType = null;
    showScreen('screen-game');
    renderStats(false);
    renderFooter();
    enterEvent();
  });
}

/* ================= 角色创建 ================= */

function bindCreate() {
  // 实时更新显示的姓名
  const nameDisplay = $('display-welcome-name');
  $('inp-welcome-name')?.addEventListener('input', () => {
    if (nameDisplay) {
      nameDisplay.textContent = welcomeName || '未填写';
    }
  });

  $('btn-back-welcome').addEventListener('click', () => showScreen('screen-welcome'));
  $('btn-create-go').addEventListener('click', startGame);
}

function selectedChipValue(groupId) {
  const el = document.querySelector(`#${groupId} .chip.selected`);
  return el ? el.dataset.value : '';
}

function resolveCombo(selId, inpId) {
  const sel = $(selId);
  return sel.value === '__custom' ? $(inpId).value.trim() : sel.value;
}

async function startGame() {
  // 使用欢迎页输入的姓名
  const name = welcomeName;
  const gender = selectedChipValue('gender-group');
  const school = resolveCombo('sel-school', 'inp-school');
  const major = resolveCombo('sel-major', 'inp-major');
  const selfMbti = selfMbtiValue();

  if (!name) return showToast('请填写姓名', 'error');
  if (!gender) return showToast('请选择性别', 'error');
  if (!school) return showToast('请选择或输入学校', 'error');
  if (!major) return showToast('请选择或输入专业', 'error');
  if (!selfMbti) return showToast('MBTI 还有维度没选，四个都要选哦', 'error');

  newGame({ name, gender, school, major, self_mbti: selfMbti });
  gameState.semesterStart = { ...gameState.current };
  specialPromise = null;
  specialType = null;
  saveGame();

  showScreen('screen-game');
  renderStats(false);
  renderFooter();
  enterOpening();
}

/* ================= 开场白 ================= */

async function enterOpening() {
  currentEvent = { _opening: true };
  $('panel-result').classList.add('hidden');
  $('panel-event').classList.remove('hidden');
  $('custom-box').classList.add('hidden');
  resetCustomInput();
  $('event-caption').textContent = `${gameState.player.school} · 9 月 · 报到日`;
  applySceneBg('campus', '01_大学校门入口秋晨.jpg');
  $('options-list').innerHTML = '';
  stopTyping($('event-scene-text'));
  $('event-scene-text').textContent = 'AI 正在为你写下开学第一天……';

  // 阅读开场白的同时，后台预生成第一个事件
  preloadNextEvent(generateEventSafe);

  showLoading('AI 正在写开学剧本……');
  let text;
  try {
    text = await generateOpening();
  } catch (e) {
    text = '九月的风裹着桂花香，你拖着行李站在校门口。报到的长队、迎新志愿者的吆喝、手机里爸妈的叮嘱——属于你的大学故事，从今天开始。';
  }
  hideLoading();
  if (!currentEvent || !currentEvent._opening) return; // 已被切走

  typewrite($('event-scene-text'), text);

  const btn = document.createElement('button');
  btn.className = 'option-btn';
  btn.innerHTML = `<span class="option-key">启</span><span>🚶 深吸一口气，迈向第一个选择 →</span>`;
  btn.addEventListener('click', () => enterEvent());
  $('options-list').appendChild(btn);
}

/* ================= 事件展示 ================= */

/** 背景淡出时长，与 CSS transition(.55s) 保持一致 */
const BG_FADE_MS = 550;
/** 换图令牌：连续快速切图时，只有最后一次交换允许落地，防止竞态 */
let bgSwapToken = 0;

/**
 * 应用全屏固定背景图（position:fixed，不随滚动移动）
 * 优先用 AI 在事件生成时选好的 imageFilename；
 * 没选 / 选了不存在的图时，按 background 标识查默认图；再没有就隐藏背景层。
 *
 * 渐变分两步：① 旧图淡出 → ② 新图（已预加载好，秒开）换上后淡入。
 * 关键是先用离屏 Image() 预载新图，换 src 时才不会因加载快而跳过淡出动画。
 */
function applySceneBg(background, imageFilename) {
  const box = $('fixed-bg');
  const img = $('full-scene-img');
  const file = (imageFilename && SCENE_IMAGES.includes(imageFilename))
    ? imageFilename
    : (BG_IMAGE_MAP[background] || null);

  if (!file) { box.classList.add('hidden'); return; }

  // 同一张图且已加载成功：直接显示，避免重设 src 引起闪烁
  if (img.dataset.file === file && img.complete && img.naturalWidth > 0) {
    box.classList.remove('hidden');
    img.classList.remove('bg-swap');
    return;
  }

  const token = ++bgSwapToken;
  const url = `assets/images/${file}`;
  const hasOldPicture = img.complete && img.naturalWidth > 0 && !box.classList.contains('hidden');

  const preload = new Image();
  preload.onerror = () => { if (token === bgSwapToken) box.classList.add('hidden'); }; // 图片缺失时静默降级
  preload.onload = () => {
    if (token !== bgSwapToken) return;                    // 已被更新的切换取代，放弃
    img.classList.add('bg-swap');                         // ① 淡出旧图
    const commit = () => {
      if (token !== bgSwapToken) return;
      img.dataset.file = file;
      img.src = url;                                      // ② 新图已在缓存里，瞬间换上
      box.classList.remove('hidden');
      img.classList.remove('bg-swap');                    // ③ 淡入新图
    };
    // 有旧图：等淡出完整播完再换；首次出现：等一帧让淡入动画正常触发
    if (hasOldPicture) setTimeout(commit, BG_FADE_MS);
    else requestAnimationFrame(() => requestAnimationFrame(commit));
  };
  preload.src = url;
}

/** 安全生成特殊事件（危机/巅峰），失败时用本地兜底 */
async function generateSpecialEventSafe(special) {
  try {
    const ev = await generateSpecialEvent(special);
    ev._genSemester = gameState.current.semester;
    return ev;
  } catch (e) {
    console.warn('特殊事件生成失败，使用兜底:', e.message);
    const ev = getSpecialFallback(special.type, special.stat);
    ev._genSemester = gameState.current.semester;
    return ev;
  }
}

/**
 * 结算后检查是否触发危机 / 巅峰事件
 * 触发时清空预加载队列（普通事件已不合时宜），改为后台生成这个特殊事件
 */
function maybeTriggerSpecial() {
  const special = checkSpecialTrigger();
  if (!special) return;
  markSpecialUsed(special.type);   // 同学期冷却，避免连环触发
  // 标记该属性已首次达到巅峰 / 跌入低谷：之后增减幅度回归正常，二次达成更慢但不封死
  if (!gameState.firstReached) gameState.firstReached = {};
  gameState.firstReached[special.stat] = true;
  // 人际触发巅峰后进入回落期：温和回落 + 解除"可再次巅峰"资格，需先跌破阈值才能再巅峰
  if (special.type === 'peak' && special.stat === 'social') {
    applyEffects({ social: -15 });       // 巅峰后的自然回落（与正常事件增减同量级，幅度温和）
    gameState.socialPeakArmed = false;  // 须先跌回 70 以下才重新允许人际巅峰
  }
  eventQueue = [];
  specialType = special.type;
  // 替换式：属性越界直接构造对应小游戏事件（AI 仅作生成兜底）
  specialPromise = Promise.resolve(buildMiniGameEvent(special));
}

/** 安全生成：失败时用本地兜底事件 */
async function generateEventSafe() {
  try {
    const ev = await generateEvent();
    ev._genSemester = gameState.current.semester;
    return ev;
  } catch (e) {
    console.warn('事件生成失败，使用兜底:', e.message);
    const ev = getDefaultEvent();
    ev._genSemester = gameState.current.semester;
    return ev;
  }
}

async function enterEvent() {
  // 读档时若已是毕业状态，直接进毕业报告，避免多生成一个"第 49 个事件"
  if (isFinished()) {
    startFinalSummary();
    return;
  }

  // 危机 / 巅峰事件优先播放：它是上一选择的直接后果，不参与学期匹配过滤
  if (specialPromise) {
    const p = specialPromise;
    specialPromise = null;
    showLoading(specialType === 'crisis' ? '⚠️ 危机正在逼近……' : '✨ 高光时刻即将到来……');
    try {
      renderEvent(await p);
    } finally {
      hideLoading();
    }
    return;
  }

  // 取队列中已就绪的下一个事件。预加载按生成顺序入队，本身就是正确的"下一个"；
  // 仅在跨度超过 1 个学期（异常）时才丢弃，避免学期切换时误删已预生成事件导致加载等待。
  while (eventQueue.length && Math.abs((eventQueue[0]._genSemester || 0) - gameState.current.semester) > 1) {
    eventQueue.shift();
  }
  const ready = hasReadyEvent() ? takeEvent() : null;
  if (ready) {
    renderEvent(ready);
    return;
  }

  currentEvent = null;
  $('panel-event').classList.remove('hidden');
  $('panel-result').classList.add('hidden');
  showLoading('AI 正在构思剧情……');
  const event = await generateEventSafe();
  hideLoading();
  if (currentEvent === null) renderEvent(event); // 期间未被其他流程接管
}

/** 清空自定义输入（每个事件的自定义行动都应从空白开始，不保留上一题内容） */
function resetCustomInput() {
  const inp = $('inp-custom');
  inp.value = '';
  $('custom-count').textContent = `0/${CUSTOM_INPUT_MAX}`;
}

/** 事件信息行：危机/巅峰标记 + 类别 + 地点时间（纯文字，视觉主体交给全屏背景图） */
function setEventCaption(event) {
  const el = $('event-caption');
  const special = event.special === 'crisis'
    ? '<span class="cap-special-crisis">【危机】</span> '
    : event.special === 'peak'
      ? '<span class="cap-special-peak">【巅峰】</span> '
      : '';
  const meta = [event.location, event.time].filter(Boolean).join(' · ');
  el.innerHTML = `${special}${escapeHtml(event.category || '')}${meta ? ' · ' + escapeHtml(meta) : ''}`;
}

function renderEvent(event) {
  currentEvent = event;
  $('panel-result').classList.add('hidden');
  $('panel-event').classList.remove('hidden');
  $('custom-box').classList.add('hidden');
  resetCustomInput();

  setEventCaption(event);
  applySceneBg(event.background, event.imageFilename);
  typewrite($('event-scene-text'), event.scene);

  const list = $('options-list');
  list.innerHTML = '';
  event.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="option-key">${i + 1}</span><span>${escapeHtml(opt.text)}</span>`;
    btn.addEventListener('click', () => chooseOption(i));
    list.appendChild(btn);
  });

  const customBtn = document.createElement('button');
  customBtn.className = 'option-btn custom-option';
  customBtn.innerHTML = `<span class="option-key">4</span><span>📝 都不满意？写下你自己的行动…</span>`;
  customBtn.addEventListener('click', openCustomBox);
  list.appendChild(customBtn);

  renderFooter();

  // 小游戏事件（巅峰 / 低谷）：先弹出对应小游戏，完成后再预加载下一事件
  if (event._miniGame) {
    launchMiniGame(event);
    return;
  }

  // 后台预生成下一个事件（预加载机制）
  preloadNextEvent(generateEventSafe);
}

/* ================= 生日蛋糕小游戏 ================= */

/* 小游戏（做蛋糕 / 打卡 / 答题 / 冥想 / 破冰 / 抗困 / 查漏 / 疏导）逻辑已迁移至 mini-games.js */

/* ================= 选择处理 ================= */

function lockOptions() {
  if (!currentEvent) return;
  currentEvent._locked = true;
  $('options-list').querySelectorAll('button').forEach(b => (b.disabled = true));
}

function chooseOption(index) {
  if (!currentEvent || currentEvent._locked || currentEvent._opening) return;
  const opt = currentEvent.options[index];
  if (!opt) return;
  lockOptions();

  const changed = applyEffects(opt.effects);
  renderStats(true);
  recordChoice(currentEvent, opt.text, changed, '');
  maybeTriggerSpecial();

  showResultPanel(changed, 'loading');
  // 已触发危机/巅峰事件时不再预生成普通事件，避免多余 AI 调用
  if (!specialPromise) preloadNextEvent(generateEventSafe);

  const eventRef = currentEvent;
  generateFeedback(eventRef, opt.text, changed)
    .then(fb => {
      if (currentEvent === eventRef) typewrite($('result-feedback'), fb);
      const last = gameState.history.choices[gameState.history.choices.length - 1];
      if (last) last.feedback = fb;
    })
    .catch(() => {
      typewrite($('result-feedback'), localFeedback(changed));
    });

  saveGame();
}

/* ================= 自定义选项 ================= */

function openCustomBox() {
  if (!currentEvent || currentEvent._locked) return;
  const box = $('custom-box');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) $('inp-custom').focus();
}

function bindCustomInput() {
  $('inp-custom').addEventListener('input', () => {
    $('custom-count').textContent = `${$('inp-custom').value.length}/${CUSTOM_INPUT_MAX}`;
  });
  $('btn-custom-cancel').addEventListener('click', () => {
    $('custom-box').classList.add('hidden');
  });
  $('btn-custom-go').addEventListener('click', submitCustom);
  $('inp-custom').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitCustom();
  });
}

async function submitCustom() {
  if (!currentEvent || currentEvent._locked) return;
  const input = $('inp-custom').value.trim();
  if (!input) return showToast('先写下你的行动吧', 'error');
  if (input.length > CUSTOM_INPUT_MAX) return showToast(`最多 ${CUSTOM_INPUT_MAX} 字`, 'error');

  showLoading('AI 正在推演你的行动……');
  let result;
  try {
    result = await judgeCustomAction(currentEvent, input);
  } catch (e) {
    hideLoading();
    return showToast('AI 裁判走神了，请再试一次', 'error');
  }
  hideLoading();

  if (!result.is_valid) {
    // 超纲行动：幽默兜底，不推进回合，允许重新选择
    showToast(result.feedback || '这个行动在大学里不太现实，换一个吧~', 'error');
    return;
  }

  lockOptions();
  $('custom-box').classList.add('hidden');
  currentEvent._customChoice = true;   // 供 recordChoice 统计自定义行动次数
  const changed = applyEffects(result.effects);
  renderStats(true);
  recordChoice(currentEvent, '📝 ' + input, changed, result.feedback);
  maybeTriggerSpecial();
  showResultPanel(changed, 'text', result.feedback);
  if (!specialPromise) preloadNextEvent(generateEventSafe);
  saveGame();
}

/* ================= 结果面板 ================= */

function showResultPanel(changed, feedbackMode, feedbackText) {
  $('panel-event').classList.add('hidden');
  $('panel-result').classList.remove('hidden');

  const fb = $('result-feedback');
  if (feedbackMode === 'text') {
    typewrite(fb, feedbackText || '');
  } else if (feedbackMode === 'loading') {
    fb.innerHTML = '<span class="loading" style="width:18px;height:18px;border-width:2px;vertical-align:middle"></span> AI 正在叙述结果……';
  } else {
    fb.textContent = feedbackText || '';
  }

  const grid = $('result-deltas');
  grid.innerHTML = STAT_KEYS.map(k => {
    const v = changed[k] || 0;
    const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
    const sign = v > 0 ? '+' : '';
    return `<div class="delta-item">
      <span class="delta-name">${STAT_NAMES[k]}</span>
      <span class="delta-val ${cls}">${v === 0 ? '±0' : sign + v}</span>
    </div>`;
  }).join('');
}

function bindGame() {
  $('btn-next-event').addEventListener('click', proceedAfterChoice);
  $('btn-save').addEventListener('click', () => {
    saveGame() ? showToast('进度已保存', 'success') : showToast('还没有进行中的游戏', 'error');
  });
  $('btn-load').addEventListener('click', async () => {
    if (!hasSave()) return showToast('没有找到存档', 'error');
    const ok = await confirmDialog('读取存档将放弃当前未保存的进度，确定吗？', '读取存档');
    if (!ok) return;
    loadSavedGame();
    specialPromise = null;
    specialType = null;
    showScreen('screen-game');
    renderStats(false);
    renderFooter();
    enterEvent();
  });
  $('btn-restart').addEventListener('click', async () => {
    const ok = await confirmDialog('确定重新开始吗？当前进度会保留在存档里，可以随时读取。', '重新开始');
    if (!ok) return;
    hardReset();
    showScreen('screen-welcome');
    $('btn-continue').classList.toggle('hidden', !hasSave());
    showToast('已重置，去开启新的一段大学吧', 'success');
  });
  $('btn-again').addEventListener('click', () => {
    hardReset();
    // 回欢迎页重新填姓名（创建页已无姓名输入框，直接跳创建页会走死）
    showScreen('screen-welcome');
  });
  $('btn-copy-share').addEventListener('click', copyShareText);
  // 小游戏的按钮在各自游戏内动态绑定；这里初始化 buff 栏
  renderBuffBar();
  bindCustomInput();
}

/** 选择完成后的流程推进：毕业 > 学期总结 > 下一事件 */
let advancing = false;
function proceedAfterChoice() {
  if (advancing) return;          // 防止双击跳节点
  advancing = true;
  setTimeout(() => { advancing = false; }, 400);

  currentEvent = null;
  advanceClock();

  if (isFinished()) {
    startFinalSummary();
    return;
  }
  if (isSemesterEnd()) {
    showSemesterSummary();
    return;
  }
  enterEvent();
}

/* ================= 属性条 / 底部栏渲染 ================= */

function renderStats(animate) {
  const c = gameState.current;
  const s = gameState.subs;
  const items = [
    { key: 'energy', icon: '⚡', label: '精力', sub: [`身体 ${s.energy.body}`, `心理 ${s.energy.psycho}`] },
    { key: 'study', icon: '📚', label: '学业', sub: [`专业课 ${s.study.major}`, `常识课 ${s.study.general}`] },
    { key: 'social', icon: '👥', label: '人际', sub: [`朋友 ${s.social.friend}`, `恋爱 ${s.social.romance}`] },
    { key: 'mental', icon: '💚', label: '心态', sub: [] }
  ];

  $('stats-bar').innerHTML = items.map(it => {
    const val = c[it.key];
    const danger = val < 15 ? ' danger' : '';
    return `<div class="stat-item" data-stat="${it.key}">
      <div class="stat-top">
        <span class="stat-icon">${it.icon}</span>
        <span class="stat-label">${it.label}</span>
        <span class="stat-value${animate ? ' bump' : ''}">${val}</span>
      </div>
      <div class="stat-progress"><div class="stat-fill${danger}" style="width:${val}%"></div></div>
      ${it.sub.length ? `<div class="stat-sub">${it.sub.map(x => `<span>${x}</span>`).join('')}</div>` : '<div class="stat-sub"><span>&nbsp;</span></div>'}
    </div>`;
  }).join('');
  if (typeof renderBuffBar === 'function') renderBuffBar();
}

function renderFooter() {
  const { semester, month } = gameState.current;
  $('semester-label').textContent = semesterName() + ' · 第 ' + (month + 1) + ' 个节点';
  $('overall-label').textContent = `${eventCount() + 1} / 48`;
  $('progress-dots').innerHTML = SEMESTER_NAMES.map((name, i) => {
    const cls = i < semester ? 'done' : i === semester ? 'current' : '';
    return `<span class="pdot ${cls}" title="${name}"></span>`;
  }).join('');
}

/* ================= 学期总结 ================= */

/** 本学期关键选择回顾（设计文档 6.2）：只显示选择内容，数值变化在第二列统一呈现 */
function renderSemesterRecap(semIdx) {
  const list = gameState.history.choices.filter(c => c.semester === semIdx);
  if (!list.length) return '<li class="recap-empty">本学期没有留下选择记录。</li>';

  return list.map((c, i) => {
    return `<li class="recap-item">
      <span class="recap-idx">${i + 1}</span>
      <span class="recap-text" title="${escapeHtml(c.choice)}">${escapeHtml(c.choice)}</span>
    </li>`;
  }).join('');
}

async function showSemesterSummary() {
  // 跨学期不再清空预加载队列：队列按生成顺序入队，已是"下一个"事件；保留它可消除学期初的加载等待
  saveGame();
  showScreen('screen-semester');
  renderFooter();

  const semIdx = gameState.current.semester - 1;
  $('semester-title').textContent = `📋 ${SEMESTER_NAMES[semIdx]} · 学期总结`;
  $('semester-recap').innerHTML = renderSemesterRecap(semIdx);

  const start = gameState.semesterStart || { ...gameState.current };
  const now = gameState.current;
  drawRadar($('semester-radar'), STAT_KEYS.map(k => STAT_NAMES[k].slice(2)),
    [
      { values: STAT_KEYS.map(k => start[k]), fill: 'rgba(113,128,150,0.15)', stroke: '#A0AEC0', dashed: true },
      { values: STAT_KEYS.map(k => now[k]), fill: 'rgba(74,144,217,0.25)', stroke: '#4A90D9' }
    ]);

  $('semester-deltas').innerHTML = STAT_KEYS.map(k => {
    const d = now[k] - start[k];
    const cls = d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero';
    return `<div class="delta-line">
      <span class="dl-name">${STAT_NAMES[k]}</span>
      <span class="dl-bar"><i style="width:${now[k]}%"></i></span>
      <span class="dl-now">${now[k]}</span>
      <span class="dl-delta ${cls}">${d > 0 ? '+' : ''}${d}</span>
    </div>`;
  }).join('');

  const btn = $('btn-next-semester');
  btn.disabled = true;
  btn.querySelector('.btn-inner').textContent = 'AI 正在撰写学期总结……';
  stopTyping($('semester-text'));
  // 流式容器：评语随 AI 生成逐段显现，不再等整段生成完才开始显示
  const textEl = $('semester-text');
  textEl.innerHTML = '<span id="semester-stream"></span><span class="stream-caret">▍</span>';
  const streamEl = $('semester-stream');

  let text = '';
  try {
    text = await generateSemesterSummary(semIdx, (piece, cleanFull) => {
      text = cleanFull;                       // 边生成边记录累积全文
      if (streamEl) streamEl.textContent = text;  // 随即分段渲染（.prose 的 pre-wrap 保留换行）
    });
  } catch (e) {
    // 若已流式出部分内容则保留，否则用兜底文案
    if (!text) text = '这个学期你认真走过了每一个节点。数字会变化，经历会沉淀，剩下的交给时间。新的学期，继续按自己的节奏前进吧。';
    if (streamEl) streamEl.textContent = text;
  }
  // 收尾：去掉打字光标，确保最终文本干净呈现
  const caret = textEl.querySelector('.stream-caret');
  if (caret) caret.remove();
  if (streamEl) streamEl.textContent = text;
  btn.disabled = false;
  btn.querySelector('.btn-inner').textContent = isFinished() ? '查看毕业报告 →' : '进入下学期 →';
  // 总结屏期间提前预生成下一个事件，进一步压缩学期初等待
  preloadNextEvent(generateEventSafe);

  $('btn-next-semester').onclick = () => {
    gameState.semesterStart = { ...gameState.current };
    saveGame();
    showScreen('screen-game');
    if (isFinished()) {
      startFinalSummary();
    } else {
      renderStats(false);
      renderFooter();
      enterEvent();
    }
  };
}

/* ================= 毕业总结 ================= */

async function startFinalSummary() {
  saveGame();
  showScreen('screen-final');
  $('final-name').textContent = `${gameState.player.name} · ${gameState.player.school} · ${gameState.player.major}`;
  $('final-loading').classList.remove('hidden');
  const setStatus = t => { $('final-loading-text').textContent = t; };

  const p = gameState.player;
  const c = gameState.current;
  finalData = null;

  setStatus('AI 正在回看你四年的 48 个选择……');
  let mbti, dest;
  try {
    [mbti, dest] = await Promise.all([analyzeMbti(), analyzeDestination()]);
  } catch (e) {
    setStatus('AI 连接中断，正在使用简化报告……');
    mbti = { mbti: 'ENFP', keywords: ['务实', '平衡'], analysis: '报告生成失败，以下为简化结论。', mbti_comparison: { self_mbti: p.self_mbti, is_match: false, comparison: '本次分析服务暂不可用。', improvement: '再玩一次，AI 会看得更准。' } };
    dest = { destination: '按自己的节奏继续前行', school_or_company: '', description: '毕业报告生成失败，但你的四年真实发生过。' };
  }

  setStatus('AI 正在写下临别赠言……');
  let closing;
  try {
    const summary = `MBTI ${mbti.mbti}，关键词：${(mbti.keywords || []).join('、')}`;
    closing = await generateClosing(summary, dest.destination);
  } catch (e) {
    closing = `四年的时光转瞬即逝，${p.name}，你带着独一无二的经历走出校门。愿你记得操场上的风、图书馆的灯，和每一个认真做选择的自己。`;
  }

  finalData = { mbti, dest, closing };
  renderFinal(mbti, dest, closing);
  $('final-loading').classList.add('hidden');
}

function mbtiTypeEquals(a, b) {
  return String(a).toUpperCase() === String(b).toUpperCase();
}

/**
 * 取某学年的"最佳选择"文案（供"保存毕业回忆"复制用）
 * @param {number} y - 学年下标 0-3（2 学期 = 1 学年）
 * @returns {string}
 */
function extractYearBest(y) {
  if (!hasGame()) return '—';
  const startSem = y * 2;
  const choices = gameState.history.choices.filter(x => x.semester === startSem || x.semester === startSem + 1);
  let best = null, bestScore = -Infinity;
  choices.forEach(ch => {
    const score = STAT_KEYS.reduce((s, k) => s + (ch.effects[k] || 0), 0);
    if (score > bestScore) { bestScore = score; best = ch; }
  });
  return best ? (best.choice || '未留下选择记录') : '未留下选择记录';
}

function renderFinal(mbti, dest, closing) {
  const c = gameState.current;
  const p = gameState.player;

  drawRadar($('final-radar'), ['精力', '学业', '人际', '心态'],
    [{ values: STAT_KEYS.map(k => c[k]), fill: 'rgba(74,144,217,0.25)', stroke: '#4A90D9' }]);

  // 第二列雷达图下方：四维毕业时数值（与学期总结同款行式）
  $('final-stats').innerHTML = STAT_KEYS.map(k => `
    <div class="delta-line">
      <span class="dl-name">${STAT_NAMES[k]}</span>
      <span class="dl-bar"><i style="width:${c[k]}%"></i></span>
      <span class="dl-now">${c[k]}</span>
    </div>`).join('');

  const cmp = mbti.mbti_comparison || {};
  const isMatch = typeof cmp.is_match === 'boolean' ? cmp.is_match : mbtiTypeEquals(p.self_mbti, mbti.mbti);
  $('final-mbti-test').textContent = mbti.mbti;
  const selfEl = $('final-mbti-self');
  selfEl.textContent = '自评 ' + (cmp.self_mbti || p.self_mbti);
  selfEl.classList.toggle('match', isMatch);

  $('final-keywords').innerHTML = (mbti.keywords || []).map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('');
  $('final-analysis').textContent = mbti.analysis || '';

  const box = $('final-compare');
  box.classList.toggle('match', isMatch);
  box.innerHTML = `<strong>${isMatch ? '🎯 自我认知精准' : '🪞 自评与实测不同'}</strong><br>${escapeHtml(cmp.comparison || '')}${cmp.improvement ? '<br><br>' + escapeHtml(cmp.improvement) : ''}`;

  $('final-destination').textContent = dest.destination + (dest.school_or_company ? ` · ${dest.school_or_company}` : '');
  $('final-dest-desc').textContent = dest.description || '';
  typewrite($('final-closing'), closing);

  // 成就徽章（设计文档 P2）
  const achv = computeAchievements();
  $('final-achievements').innerHTML = achv.length
    ? achv.map(a => `<div class="achv-item">
        <span class="achv-icon">${a.icon}</span>
        <span class="achv-name">${escapeHtml(a.name)}</span>
        <span class="achv-desc">${escapeHtml(a.desc)}</span>
      </div>`).join('')
    : '<p class="achv-empty">这一局没解锁成就——换个活法再来一次？</p>';

  // 四年回忆手账：按 8 个学期铺开，每学期限定「总属性收益最高」的最佳选择，
  // 照片卡用该最佳选择对应的场景图（取自事件 imageFilename，缺失则按 background 取默认图）。
  function bestChoiceOfSemester(semIdx) {
    const list = gameState.history.choices.filter(x => x.semester === semIdx);
    let best = null, bestScore = -Infinity;
    list.forEach(ch => {
      const score = STAT_KEYS.reduce((s, k) => s + (ch.effects[k] || 0), 0);
      if (score > bestScore) { bestScore = score; best = ch; }
    });
    return best;
  }
  // 每学期自有、且文件名有效的场景图（按出现顺序去重后学期内随机洗牌；满足"随机挑选"但不跨学期混）
  function semesterImagePool(semIdx) {
    const seen = new Set();
    const pool = [];
    gameState.history.choices.forEach(ch => {
      if (ch.semester === semIdx && ch.imageFilename && SCENE_IMAGES.includes(ch.imageFilename) && !seen.has(ch.imageFilename)) {
        seen.add(ch.imageFilename);
        pool.push(ch.imageFilename);
      }
    });
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool;
  }
  // 全局去重分配：每学期优先用自己池里的图，已被用过则跳过；都不够时从全图池随机补，保证 8 张齐全且不重复
  const used = new Set();
  const picked = SEMESTER_NAMES.map((label, i) => {
    const pool = semesterImagePool(i);
    const p = pool.find(f => !used.has(f)) || null;
    if (p) used.add(p);
    return p;
  });
  // 兜底填充：无有效图的学期，从全部 48 张图里去掉已使用的、随机取一张不重复的
  const fillShuffled = SCENE_IMAGES.slice();
  for (let i = fillShuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = fillShuffled[i]; fillShuffled[i] = fillShuffled[j]; fillShuffled[j] = t;
  }
  picked.forEach((img, i) => {
    if (img) return;
    const fill = fillShuffled.find(f => !used.has(f));
    if (fill) { used.add(fill); picked[i] = fill; }
  });
  const cards = SEMESTER_NAMES.map((label, i) => {
    const best = bestChoiceOfSemester(i);
    const file = picked[i];
    const bestText = best ? escapeHtml(best.choice) : '未留下选择记录';
    const imgHtml = file
      ? `<img class="memory-card-img" src="assets/images/${file}" alt="${label}最佳场景" loading="lazy">`
      : `<div class="memory-card-img memory-card-img--empty">📷<span>暂无场景</span></div>`;
    return `<div class="memory-card">
      <span class="memory-card-year">${label}</span>
      ${imgHtml}
      <div class="memory-card-best"><strong>最佳选择：</strong>${bestText}</div>
    </div>`;
  });
  $('memory-cards').innerHTML = cards.join('');

  // 时间线连接点（8 个学期）
  $('memory-timeline-dots').innerHTML = SEMESTER_NAMES.map(() => '<span class="memory-timeline-dot"></span>').join('');

  // 底部四维属性
  $('memory-stats').innerHTML = STAT_KEYS.map(k => `
    <span class="memory-stat">
      <span class="memory-stat-name">${STAT_NAMES[k]}</span>
      <span class="memory-stat-val">${c[k]}</span>
    </span>`).join('');

  // 结局评语（便利贴）
  $('memory-closing').textContent = closing;

  // 绑定"保存毕业回忆"按钮
  const saveBtn = $('btn-save-memory');
  if (saveBtn) saveBtn.onclick = () => {
    if (!finalData || !hasGame()) return showToast('回忆还没生成好', 'error');
    const p = gameState.player, cc = gameState.current;
    const text = [
      '🎓 毕业快乐 · 四年回忆手账',
      `${p.name} · ${p.school} · ${p.major}`,
      '—— 每学期最佳选择 ——',
      ...SEMESTER_NAMES.map((label, i) => {
        const b = bestChoiceOfSemester(i);
        return `${label}：${b ? b.choice : '未留下选择记录'}`;
      }),
      `📊 精力${cc.energy} / 学业${cc.study} / 人际${cc.social} / 心态${cc.mental}`,
      `🧭 毕业去向：${finalData.dest.destination}`
    ].join('\n');
    try {
      navigator.clipboard.writeText(text).then(
        () => showToast('毕业回忆已复制到剪贴板', 'success'),
        () => showToast('复制失败，请手动保存', 'error')
      );
    } catch (e) {
      showToast('已生成回忆（剪贴板不可用）', 'success');
    }
  };
}

/* ================= 雷达图（纯 Canvas，无外部依赖） ================= */

function drawRadar(canvas, labels, series) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  // 半径留出足够边距给四周的维度标签，避免文字被画布裁切
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 60;
  ctx.clearRect(0, 0, W, H);

  const n = labels.length;
  const angle = i => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  // 网格环
  ctx.strokeStyle = '#E5E7EB';
  ctx.fillStyle = '#E5E7EB';
  [0.25, 0.5, 0.75, 1].forEach(f => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = angle(i % n);
      const x = cx + Math.cos(a) * r * f, y = cy + Math.sin(a) * r * f;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  // 轴线
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r);
    ctx.stroke();
  }

  // 数据系列
  series.forEach(s => {
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const a = angle(i);
      const x = cx + Math.cos(a) * r * (clamp(v, 0, 100) / 100);
      const y = cy + Math.sin(a) * r * (clamp(v, 0, 100) / 100);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = s.fill;
    ctx.fill();
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash(s.dashed ? [5, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // 标签（含数值），绘制后再按文字宽度收敛坐标，确保不会被画布边缘裁掉
  ctx.fillStyle = '#2D3748';
  ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
  labels.forEach((lb, i) => {
    const a = angle(i);
    const val = gameState.current[STAT_KEYS[i]];
    const text = val === undefined ? String(lb) : `${lb} ${val}`;
    ctx.textAlign = Math.abs(Math.cos(a)) < 0.3 ? 'center' : (Math.cos(a) > 0 ? 'left' : 'right');
    ctx.textBaseline = 'middle';

    let x = cx + Math.cos(a) * (r + 14);
    let y = cy + Math.sin(a) * (r + 18);
    const tw = ctx.measureText(text).width;
    if (ctx.textAlign === 'left') x = Math.min(x, W - tw - 2);
    else if (ctx.textAlign === 'right') x = Math.max(x, tw + 2);
    else x = clamp(x, tw / 2 + 2, W - tw / 2 - 2);
    y = clamp(y, 10, H - 10);

    ctx.fillText(text, x, y);
  });
}

/* ================= 分享 ================= */

async function copyShareText() {
  if (!finalData || !hasGame()) return showToast('报告还没生成好', 'error');
  const p = gameState.player;
  const c = gameState.current;
  const text = [
    '🎓 我在《大学模拟器》走完了四年！',
    `🏫 ${p.school} · ${p.major}`,
    `🧭 毕业去向：${finalData.dest.destination}`,
    `🪞 自评 ${p.self_mbti} → 实测 ${finalData.mbti.mbti}`,
    `📊 精力${c.energy} / 学业${c.study} / 人际${c.social} / 心态${c.mental}`,
    `🏅 解锁成就 ${computeAchievements().length}/${ACHIEVEMENTS.length}`,
    '来测测你的大学四年吧！'
  ].join('\n');

  try {
    await navigator.clipboard.writeText(text);
    showToast('分享文案已复制，快去粘贴吧', 'success');
  } catch (e) {
    // 剪贴板 API 不可用时回退
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('分享文案已复制', 'success');
  }
}

/* ================= 启动 ================= */

// 注：按用户要求移除了「键盘数字键 1-4 自动选中选项」的快捷键行为，
// 选项只允许鼠标/触摸点击触发，避免误触跳过阅读。

document.addEventListener('DOMContentLoaded', init);
