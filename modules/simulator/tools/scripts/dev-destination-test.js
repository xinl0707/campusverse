// 毕业去向：规则判定 + 文案与属性矛盾检测
const fs = require('fs');
const vm = require('vm');

const ctx = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  StorageManager: { save() {}, load() { return null; }, remove() {} },
  console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('simulator/js/game-engine.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('common/js/ai-proxy.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('simulator/js/ai-service.js', 'utf8'), ctx);

let fail = 0;
const check = (label, cond, extra) => {
  console.log((cond ? '  OK  ' : ' FAIL ') + label + (extra ? `  (${extra})` : ''));
  if (!cond) fail++;
};

console.log('— 档位词 —');
const lv = (k, v) => vm.runInContext(`statLevel('${k}', ${v})`, ctx);
check('精力 5 → 濒临透支', lv('energy', 5) === '濒临透支', lv('energy', 5));
check('精力 100 → 精力充沛', lv('energy', 100) === '精力充沛', lv('energy', 100));
check('学业 35 → 学业吃力', lv('study', 35) === '学业吃力', lv('study', 35));
check('心态 12 → 情绪低谷', lv('mental', 12) === '情绪低谷', lv('mental', 12));

console.log('\n— 去向判定（重点：低精力不能判成创业/出国）—');
const cases = [
  { e: 5, s: 70, o: 50, m: 60, want: null, notWant: ['选择创业', '申请到海外高校深造'] },
  // 学业差但人际好、精力足 → 创业（创业不看学业，合理）
  { e: 90, s: 40, o: 80, m: 80, want: '选择创业' },
  { e: 80, s: 85, o: 60, m: 70, want: '申请到海外高校深造' },
  { e: 30, s: 80, o: 40, m: 65, want: '考研上岸' },
  { e: 70, s: 60, o: 75, m: 75, want: '选择创业' },
  { e: 50, s: 66, o: 66, m: 60, want: '考公上岸' },
  { e: 50, s: 58, o: 58, m: 50, want: '进入企业就业' },
  { e: 20, s: 30, o: 30, m: 25, want: '暂待休整，重新出发' },
  { e: 40, s: 52, o: 52, m: 45, want: '边工作边寻找方向' },
  // 精力只剩 10 时，人际心态再好也不能判创业；但学业人际达标仍可就业（文案须体现透支）
  { e: 10, s: 60, o: 70, m: 72, want: '进入企业就业', notWant: ['选择创业'] },
  // 心态 35 即使学业人际达标，也先休整
  { e: 60, s: 70, o: 70, m: 35, want: '暂待休整，重新出发', notWant: ['进入企业就业'] }
];
for (const t of cases) {
  const r = JSON.parse(vm.runInContext(`
    newGame({name:'小明',gender:'男',school:'杭电',major:'人工智能',self_mbti:'INFP'});
    gameState.current.energy=${t.e}; gameState.current.study=${t.s};
    gameState.current.social=${t.o}; gameState.current.mental=${t.m};
    JSON.stringify(pickDestination());
  `, ctx));
  const okWant = !t.want || r.destination === t.want;
  const okNot = !(t.notWant || []).includes(r.destination);
  check(`精力${t.e} 学业${t.s} 人际${t.o} 心态${t.m} → ${r.destination}`, okWant && okNot,
    okWant ? (okNot ? '' : '（不应出现）') : '（期望 ' + t.want + '）');
}

console.log('\n— 矛盾词检测 —');
const find = (text, stats) => vm.runInContext(
  `JSON.stringify(findContradiction(${JSON.stringify(text)}, ${JSON.stringify(stats)}))`, ctx);
check('精力 5 + "精力充沛" → 命中',
  JSON.parse(find('他精力充沛地投入工作', { energy: 5, study: 60, social: 60, mental: 60 })).word === '精力充沛');
check('精力 5 + "充满活力" → 命中',
  JSON.parse(find('依然充满活力', { energy: 5, study: 60, social: 60, mental: 60 })).word === '充满活力');
check('精力 90 + "精力充沛" → 放行',
  find('他精力充沛地投入工作', { energy: 90, study: 60, social: 60, mental: 60 }) === 'null');
check('学业 30 + "成绩优异" → 命中',
  JSON.parse(find('成绩优异的四年', { energy: 60, study: 30, social: 60, mental: 60 })).key === 'study');
check('心态 20 + "乐观向上" → 命中',
  JSON.parse(find('乐观向上地面对', { energy: 60, study: 60, social: 60, mental: 20 })).key === 'mental');
check('全部中等 + 常规描述 → 放行',
  find('他找到了一份稳定的工作', { energy: 60, study: 60, social: 60, mental: 60 }) === 'null');

console.log('\n— 本地兜底描述（精力 5 场景）—');
const fb = vm.runInContext(`
  newGame({name:'小明'});
  gameState.current.energy=5; gameState.current.study=70;
  gameState.current.social=50; gameState.current.mental=60;
  buildDestinationFallback(pickDestination());
`, ctx);
console.log('  ' + fb);
check('兜底描述不含矛盾词', find(fb, { energy: 5, study: 70, social: 50, mental: 60 }) === 'null');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail ? 1 : 0);
