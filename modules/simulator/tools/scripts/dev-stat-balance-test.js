/**
 * 用「真实 AI 生成的事件池」做蒙特卡洛，对比取舍原则改动前后的四维终值分布。
 *
 * 关键：事件池按生成时的属性局面分三组（均衡 / 部分偏高 / 全面偏高）。
 * 模拟时按"当前属性里有多少维 ≥70"选对应组——这复现了真实游戏里
 * statPressureHint() 的实时负反馈：低了回升、高了下滑。
 * 若用固定池混合抽样，会低估自适应能力、得出"矫枉过正"的错误结论。
 *
 * 旧池 = 改动前实测留档（硬编码，可复现）
 * 新池 = 用当前代码生成，缓存到 dev-events-pool.json（删掉即重新生成）
 */
const fs = require('fs');
const vm = require('vm');

const API = 'http://localhost:3000/api/chat';
const CATS = ['学业', '运动', '社交', '宿舍', '娱乐', '实践'];
const STATS = ['energy', 'study', 'social', 'mental'];
const POOL_FILE = 'dev-events-pool.json';
const HIGH = 70;

/* ---------- 旧池（改动前实测留档）：[energy3, study3, social3, mental3] ---------- */
const OLD_RAW = [
  // 均衡局面
  ['-15|-5|0', '8|5|2', '5|3|-3', '-10|0|-8'],
  ['-15|-3|-18', '0|0|0', '12|5|-2', '8|2|6'],
  ['-10|5|-15', '-5|10|5', '15|-5|10', '15|0|10'],
  ['-15|-5|15', '12|5|2', '-3|10|-2', '2|8|10'],
  ['-10|5|10', '-2|0|0', '15|-5|10', '18|20|15'],
  ['-15|0|5', '10|2|3', '8|3|-2', '5|2|4'],
  // 心态 / 人际偏高
  ['-15|-5|-10', '12|6|10', '5|8|-8', '-3|2|-5'],
  ['-15|5|-10', '0|0|2', '5|0|0', '8|6|4'],
  ['-5|-2|0', '2|5|5', '10|3|-3', '5|2|-2'],
  ['-15|5|15', '8|0|-5', '-3|10|0', '-5|8|10'],
  ['-15|-5|5', '-5|5|0', '10|5|15', '15|10|10'],
  ['-10|-5|5', '5|10|8', '8|2|0', '3|5|10'],
  // 全面偏高
  ['-10|-5|-15', '8|4|12', '5|10|-5', '3|8|-2'],
  ['-15|-8|5', '0|0|2', '8|0|-2', '12|10|0'],
  ['-5|-10|2', '0|0|3', '8|10|-2', '5|8|0'],
  ['-15|-8|-5', '12|-2|0', '-3|10|4', '5|8|3'],
  ['15|5|20', '-3|0|2', '8|10|-5', '12|10|8'],
  ['-15|-5|-8', '8|5|10', '2|8|0', '3|5|4']
];
const toOpts = r => {
  const [e, s, o, m] = r.map(x => x.split('|').map(Number));
  return [0, 1, 2].map(i => ({ energy: e[i], study: s[i], social: o[i], mental: m[i] }));
};
const group = raw => raw.slice(0, 6).map(toOpts);
const OLD_GROUPS = {
  balanced: group(OLD_RAW.slice(0, 6)),
  high: group(OLD_RAW.slice(6, 12)),
  veryHigh: group(OLD_RAW.slice(12, 18))
};

const SITUATIONS = [
  { s: { energy: 60, study: 60, social: 60, mental: 60 }, semester: 2 },
  { s: { energy: 55, study: 55, social: 82, mental: 85 }, semester: 4 },
  { s: { energy: 70, study: 78, social: 80, mental: 80 }, semester: 6 }
];

async function buildNewGroups() {
  if (fs.existsSync(POOL_FILE)) {
    console.log('（沿用缓存的新池 ' + POOL_FILE + '，删除该文件可重新生成）');
    return JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  }
  const ctx = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    STAT_KEYS: STATS,
    StorageManager: { save() {}, load() { return null; }, remove() {} },
    console, fetch
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('common/js/ai-proxy.js', 'utf8'), ctx);
  ctx.callAI = async (messages, opts) => {
    const r = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: (opts && opts.maxTokens) || 1200 })
    });
    const j = await r.json();
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return j && (j.content || j.text || '');
  };
  vm.runInContext(fs.readFileSync('simulator/js/game-engine.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('simulator/js/ai-service.js', 'utf8'), ctx);

  const all = [];
  for (const sit of SITUATIONS) {
    const bucket = [];
    for (const cat of CATS) {
      vm.runInContext(`
        newGame({ name:'测试', gender:'男', school:'杭州电子科技大学', major:'人工智能', self_mbti:'INFP' });
        gameState.current.semester = ${sit.semester};
        gameState.current.month = 0;
        Object.assign(gameState.current, ${JSON.stringify(sit.s)});
        takeCategory = function(){ return '${cat}'; };
      `, ctx);
      const ev = await ctx.generateEvent();
      bucket.push(ev.options.map(o => ({
        energy: (o.effects && o.effects.energy) || 0,
        study: (o.effects && o.effects.study) || 0,
        social: (o.effects && o.effects.social) || 0,
        mental: (o.effects && o.effects.mental) || 0
      })));
    }
    all.push(bucket);
  }
  const groups = { balanced: all[0], high: all[1], veryHigh: all[2] };
  fs.writeFileSync(POOL_FILE, JSON.stringify(groups, null, 2), 'utf8');
  console.log('（新池已生成并写入 ' + POOL_FILE + '）');
  return groups;
}

/** 按当前属性局面选池：≥70 的维度越多，越可能抽到带"高位压力"的事件 */
function pickGroup(cur, groups) {
  const n = STATS.filter(k => cur[k] >= HIGH).length;
  if (n === 0) return groups.balanced;
  if (n <= 2) return groups.high;
  return groups.veryHigh;
}

function simulate(groups, games, strategy) {
  const ctx = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    STAT_KEYS: STATS,
    StorageManager: { save() {}, load() { return null; }, remove() {} },
    console
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('simulator/js/game-engine.js', 'utf8'), ctx);

  // 玩家策略：真实玩家不会随机点，而是有偏好。用几种极端打法检验"选择是否真的有后果"
  const pick = opts => {
    const score = o => {
      switch (strategy) {
        case 'energy': return o.energy;                                  // 养生流：优先回血
        case 'social': return o.social + o.mental;                       // 社交流：优先人际 + 心态
        case 'study':  return o.study;                                   // 内卷流：优先学业
        case 'slack':  return -(o.energy + o.study + o.social + o.mental); // 摆烂流：选最亏的
        default: return Math.random();                                   // 随机
      }
    };
    let best = opts[0], bs = -Infinity;
    opts.forEach(o => { const s = score(o); if (s > bs) { bs = s; best = o; } });
    return best;
  };

  const finals = { energy: [], study: [], social: [], mental: [] };
  let zeroTurn = 0;
  for (let g = 0; g < games; g++) {
    vm.runInContext(`newGame({name:'T',gender:'男',school:'杭电',major:'AI',self_mbti:'INFP'});`, ctx);
    for (let i = 0; i < 48; i++) {
      const cur = JSON.parse(vm.runInContext('JSON.stringify(gameState.current)', ctx));
      const pool = pickGroup(cur, groups);
      const opts = pool[Math.floor(Math.random() * pool.length)];
      const chosen = pick(opts);
      vm.runInContext(`applyEffects(${JSON.stringify(chosen)})`, ctx);
      vm.runInContext('advanceClock()', ctx);
    }
    const cur = JSON.parse(vm.runInContext('JSON.stringify(gameState.current)', ctx));
    STATS.forEach(k => finals[k].push(cur[k]));
    if (cur.energy <= 10) zeroTurn++;
  }
  finals._energyZero = zeroTurn / games;
  return finals;
}

function report(label, finals) {
  const avg = k => finals[k].reduce((a, b) => a + b, 0) / finals[k].length;
  const pct = (k, f) => (finals[k].filter(f).length / finals[k].length * 100).toFixed(0) + '%';
  const med = k => [...finals[k]].sort((a, b) => a - b)[Math.floor(finals[k].length / 2)];
  console.log(`\n【${label}】`);
  console.log('  均值    精力 ' + avg('energy').toFixed(1) + ' | 学业 ' + avg('study').toFixed(1) +
    ' | 人际 ' + avg('social').toFixed(1) + ' | 心态 ' + avg('mental').toFixed(1));
  console.log('  中位数  精力 ' + med('energy') + ' | 学业 ' + med('study') + ' | 人际 ' + med('social') + ' | 心态 ' + med('mental'));
  console.log('  ≥85 占比 学业 ' + pct('study', v => v >= 85) + ' | 人际 ' + pct('social', v => v >= 85) +
    ' | 心态 ' + pct('mental', v => v >= 85));
  console.log('  ≤20 占比 精力 ' + pct('energy', v => v <= 20) + ' | 人际 ' + pct('social', v => v <= 20) +
    ' | 心态 ' + pct('mental', v => v <= 20));
}

(async () => {
  const newGroups = await buildNewGroups();
  const N = 300;
  console.log(`\n【改动前 · 旧提示词】${N} 局 × 48 回合，随机选择`);
  report('旧', simulate(OLD_GROUPS, N, 'random'));

  console.log(`\n【改动后 · 不同玩法区分度】${N} 局 × 48 回合`);
  const STRATS = [
    ['random', '随机点'],
    ['energy', '养生流（优先回血）'],
    ['social', '社交流（优先人际 + 心态）'],
    ['study', '内卷流（优先学业）'],
    ['slack', '摆烂流（总选最亏的）']
  ];
  console.log('  玩法                       精力   学业   人际   心态');
  for (const [key, name] of STRATS) {
    const f = simulate(newGroups, N, key);
    const avg = k => (f[k].reduce((a, b) => a + b, 0) / f[k].length).toFixed(1).padStart(5);
    console.log(`  ${name.padEnd(24)} ${avg('energy')}  ${avg('study')}  ${avg('social')}  ${avg('mental')}`);
  }
})();
