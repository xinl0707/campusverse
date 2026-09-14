/**
 * 诊断：AI 生成的事件里，四维 effects 的真实分布。
 * 重点回答：心态 / 人际 是不是"只涨不跌"——如果每个事件的 3 个选项都给非负，
 * 那这两个维度就永远下不来。
 * 复用 ai-service.js 里的真实提示词，连真实模型，不靠猜。
 */
const fs = require('fs');
const vm = require('vm');

const API = 'http://localhost:3000/api/chat';
const CATS = ['学业', '运动', '社交', '宿舍', '娱乐', '实践'];

const ctx = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  STAT_KEYS: ['energy', 'study', 'social', 'mental'],
  StorageManager: { save() {}, load() { return null; }, remove() {} },
  console,
  fetch
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('common/js/ai-proxy.js', 'utf8'), ctx);
ctx.callAI = async (messages, opts) => {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: (opts && opts.maxTokens) || 1200 })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return j && (j.content || j.text || '');
};
vm.runInContext(fs.readFileSync('simulator/js/game-engine.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('simulator/js/ai-service.js', 'utf8), ctx);

// 三种典型局面：均衡 / 心态人际已高 / 全高
const SITUATIONS = [
  { name: '均衡',    s: { energy: 60, study: 60, social: 60, mental: 60 }, semester: 2 },
  { name: '心态人际高', s: { energy: 55, study: 55, social: 82, mental: 85 }, semester: 4 },
  { name: '全面偏高', s: { energy: 70, study: 78, social: 80, mental: 80 }, semester: 6 }
];

const STATS = ['energy', 'study', 'social', 'mental'];
const tally = {};
STATS.forEach(k => { tally[k] = { pos: 0, neg: 0, zero: 0, sum: 0, n: 0, posSum: 0, negSum: 0 }; });
// 每个事件里：三个选项是否全部非负（= 该维度在本事件只可能涨）
const allNonNeg = {}; STATS.forEach(k => { allNonNeg[k] = 0; });
let eventCount = 0;

(async () => {
  for (const sit of SITUATIONS) {
    for (const cat of CATS) {
      // 造一个指定局面 + 强制指定类别
      vm.runInContext(`
        newGame({ name:'测试', gender:'男', school:'杭州电子科技大学', major:'人工智能', self_mbti:'INFP' });
        gameState.current.semester = ${sit.semester};
        gameState.current.month = 0;
        Object.assign(gameState.current, ${JSON.stringify(sit.s)});
        takeCategory = function(){ return '${cat}'; };   // 覆盖配额，强制指定类别
      `, ctx);

      let ev;
      try { ev = await ctx.generateEvent(); } catch (e) { console.log('生成失败', cat, e.message); continue; }
      if (!ev || !ev.options) continue;
      eventCount++;

      STATS.forEach(k => {
        const vals = ev.options.map(o => (o.effects && o.effects[k]) || 0);
        const allNN = vals.every(v => v >= 0);
        if (allNN) allNonNeg[k]++;
        vals.forEach(v => {
          const t = tally[k];
          t.n++; t.sum += v;
          if (v > 0) { t.pos++; t.posSum += v; }
          else if (v < 0) { t.neg++; t.negSum += v; }
          else t.zero++;
        });
      });

      const line = STATS.map(k => ev.options.map(o => String((o.effects && o.effects[k]) || 0)).join('/')).join('  ');
      console.log(`[${sit.name}] ${cat.padEnd(2)} 能${line.split('  ')[0]}  学${line.split('  ')[1]}  人${line.split('  ')[2]}  心${line.split('  ')[3]}`);
    }
  }

  console.log(`\n===== 统计（${eventCount} 个事件 / 每个 3 选项）=====`);
  const NAME = { energy: '精力', study: '学业', social: '人际', mental: '心态' };
  console.log('维度   正/负/零        均值    正向均值  负向均值  净和   「三选项全非负」占比');
  STATS.forEach(k => {
    const t = tally[k];
    console.log(
      `${NAME[k]}  ${String(t.pos).padStart(3)}/${String(t.neg).padStart(3)}/${String(t.zero).padStart(3)}` +
      `   ${(t.sum / t.n).toFixed(2).padStart(6)}` +
      `   ${(t.pos ? t.posSum / t.pos : 0).toFixed(2).padStart(7)}` +
      `   ${(t.neg ? t.negSum / t.neg : 0).toFixed(2).padStart(8)}` +
      `   ${String(t.sum).padStart(5)}` +
      `   ${(allNonNeg[k] / eventCount * 100).toFixed(0).padStart(3)}% (${allNonNeg[k]}/${eventCount})`
    );
  });
})();
