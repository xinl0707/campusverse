// 事件类别配额验证：分布是否均衡、是否连续重复、48 个是否刚好配额
const fs = require('fs');
const vm = require('vm');

const ctx = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  StorageManager: { save() {}, load() { return null; }, remove() {} },
  console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('simulator/js/game-engine.js', 'utf8'), ctx);

let fail = 0;
const check = (label, cond, extra) => {
  console.log((cond ? '  OK  ' : ' FAIL ') + label + (extra ? '  ' + extra : ''));
  if (!cond) fail++;
};

const quota = vm.runInContext('CATEGORY_QUOTA', ctx);
const total = Object.values(quota).reduce((a, b) => a + b, 0);
console.log('配额：', JSON.stringify(quota), '合计', total);
check('配额合计 = 48（每局事件总数）', total === 48);

// 1. 单次排布的统计
vm.runInContext(`newGame({name:'T',gender:'男',school:'杭电',major:'AI',self_mbti:'INFP'});`, ctx);
const plan1 = vm.runInContext('gameState.categoryPlan', ctx);
check('排布表长度 = 48', plan1.length === 48, '(实际 ' + plan1.length + ')');

const count = {};
plan1.forEach(c => { count[c] = (count[c] || 0) + 1; });
console.log('单局分布：', JSON.stringify(count));
check('每个类别都出现', Object.keys(quota).every(k => count[k] > 0));
check('学业占比 ≤ 20%', count['学业'] / 48 <= 0.2, '(实际 ' + (count['学业'] / 48 * 100).toFixed(0) + '%)');

let adj = 0;
for (let i = 1; i < plan1.length; i++) if (plan1[i] === plan1[i - 1]) adj++;
check('无连续重复类别', adj === 0, '(重复 ' + adj + ' 处)');

// 2. 跑 500 局的稳定性：每个类别的实际出现次数、最长连续间隔
const stats = {};
Object.keys(quota).forEach(k => { stats[k] = { min: 99, max: 0, sum: 0 }; });
let worstGap = 0, adjTotal = 0;
for (let n = 0; n < 500; n++) {
  const plan = vm.runInContext('buildCategoryPlan()', ctx);
  const c = {};
  plan.forEach(k => { c[k] = (c[k] || 0) + 1; });
  for (let i = 1; i < plan.length; i++) if (plan[i] === plan[i - 1]) adjTotal++;
  // 某类别两次出现之间的最大间隔
  const lastPos = {};
  plan.forEach((k, i) => {
    if (lastPos[k] !== undefined) worstGap = Math.max(worstGap, i - lastPos[k]);
    lastPos[k] = i;
  });
  Object.keys(quota).forEach(k => {
    const v = c[k] || 0;
    stats[k].min = Math.min(stats[k].min, v);
    stats[k].max = Math.max(stats[k].max, v);
    stats[k].sum += v;
  });
}
console.log('500 局统计：');
Object.keys(quota).forEach(k => {
  console.log(`  ${k}: 配额 ${quota[k]}，实际 ${(stats[k].sum / 500).toFixed(1)}，区间 [${stats[k].min}, ${stats[k].max}]`);
});
check('每局每类都严格等于配额', Object.keys(quota).every(k => stats[k].min === quota[k] && stats[k].max === quota[k]));
check('500 局中无连续重复', adjTotal === 0, '(共 ' + adjTotal + ' 处)');
check('同类事件最大间隔 ≤ 12', worstGap <= 12, '(实际 ' + worstGap + ')');

// 3. takeCategory 按生成顺序推进，预加载多个事件不会撞类别
const seq = vm.runInContext(`
  newGame({name:'T',gender:'男',school:'杭电',major:'AI',self_mbti:'INFP'});
  const out = [];
  for (let i = 0; i < 48; i++) out.push(takeCategory());
  out;
`, ctx);
check('takeCategory 连续取 48 次覆盖整张排布表',
  seq.join(',') === vm.runInContext('gameState.categoryPlan', ctx).join(','));
check('游标已推进到 48', vm.runInContext('gameState.planCursor', ctx) === 48);

// 4. 旧存档兼容：没有 categoryPlan 字段时要能补上，且游标从当前进度续上
ctx.StorageManager._stub = null;
ctx.StorageManager.load = () => ctx.StorageManager._stub;
const compat = JSON.parse(vm.runInContext(`
  newGame({name:'T',gender:'男',school:'杭电',major:'AI',self_mbti:'INFP'});
  // 伪造一份"旧存档"：无 categoryPlan / planCursor，进度到大二上第 3 个事件
  const save = JSON.parse(JSON.stringify(gameState));
  delete save.categoryPlan;
  delete save.planCursor;
  save.current.semester = 2;
  save.current.month = 2;
  StorageManager._stub = save;
  const ok = loadSavedGame();
  JSON.stringify({ ok, len: gameState.categoryPlan ? gameState.categoryPlan.length : 0, cursor: gameState.planCursor });
`, ctx));
check('旧存档能正常读取', compat.ok === true);
check('旧存档补齐排布表', compat.len === 48, '(长度 ' + compat.len + ')');
check('游标从当前进度续上（大二上第 3 个事件 = 14）', compat.cursor === 14, '(实际 ' + compat.cursor + ')');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail ? 1 : 0);
