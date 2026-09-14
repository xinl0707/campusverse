// 自定义行动：本地硬拦截名单 + 属性封顶的单元校验（不需要服务器）
const fs = require('fs');
const vm = require('vm');

const ctx = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  STAT_KEYS: ['energy', 'study', 'social', 'mental'],
  console,
  callAI: async () => '{}'
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('common/js/ai-proxy.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('simulator/js/ai-service.js', 'utf8'), ctx);

let fail = 0;
const check = (label, cond) => { console.log((cond ? '  OK  ' : ' FAIL ') + label); if (!cond) fail++; };

console.log('— 硬拦截名单（应驳回）—');
['抢银行', '去偷东西', '吸毒品', '把同学打一顿', '放火烧宿舍', '去赌场玩两把'].forEach(async () => {});
const shouldBlock = ['抢银行', '去偷东西', '吸冰毒', '把同学打一顿', '放火烧宿舍', '去赌场玩两把', '在校园里持刀'];
const shouldPass = ['翘课去西湖玩一整天', '在图书馆大声唱歌', '趴桌上睡一下午', '吃炸鸡喝可乐', '跟暗恋的人表白', '一天刷完一学期的课', '我气炸了', '通宵打游戏'];

(async () => {
  // const 声明不会挂到 vm context 上，需要显式取值
  const blockPattern = vm.runInContext('CUSTOM_BLOCK_PATTERN', ctx);
  for (const s of shouldBlock) {
    const r = await ctx.judgeCustomAction({ scene: 'x', options: [] }, s);
    check(`驳回「${s}」`, r.is_valid === false);
  }
  console.log('— 正常校园行为（不应被名单误伤，仅验证未被本地拦截）—');
  for (const s of shouldPass) {
    const blocked = blockPattern.test(s);
    check(`未误伤「${s}」`, blocked === false);
  }

  console.log('— 属性封顶 —');
  const s1 = ctx.sanitizeCustomEffects({ energy: 20, study: 20, social: 20, mental: 20 });
  check('单项被压到 10：' + JSON.stringify(s1), Object.values(s1).every(v => v <= 10));
  const gain = Object.values(s1).filter(v => v > 0).reduce((a, b) => a + b, 0);
  check('正向总和 ≤ 18（实际 ' + gain + '）', gain <= 18);

  const s2 = ctx.sanitizeCustomEffects({ energy: -30, study: 5, social: 0, mental: 0 });
  check('负向单项封顶 -10：' + JSON.stringify(s2), s2.energy === -10);

  const s3 = ctx.sanitizeCustomEffects({ energy: '+8', study: null, social: undefined, mental: 'abc' });
  check('脏数据不产生 NaN：' + JSON.stringify(s3), Object.values(s3).every(v => Number.isFinite(v)));

  console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
  process.exit(fail ? 1 : 0);
})();
