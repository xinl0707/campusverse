const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('simulator/js/game-engine.js', 'utf8');

function mk(balanceOn) {
  const ctx = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), StorageManager: { save() {}, load() { return null; }, remove() {} }, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  if (!balanceOn) vm.runInContext('balanceDelta = function(k, d) { return d; };', ctx);
  return ctx;
}

// 真实分布：每回合四维随机落在 -15..+15（模拟 AI 给出的多样化选项）
function sim(ctx) {
  const body = `
  newGame({name:'T',gender:'男',school:'杭电',major:'AI',self_mbti:'INFP'});
  let zeroTurn=-1, capTurn=-1;
  for(let i=0;i<48;i++){
    const e={};
    ['energy','study','social','mental'].forEach(function(k){ e[k]=Math.round((Math.random()*30-15)); });
    applyEffects(e);
    if(zeroTurn<0 && gameState.current.energy<=0) zeroTurn=i+1;
    if(capTurn<0 && gameState.current.study>=100) capTurn=i+1;
    advanceClock();
  }
  JSON.stringify({c:gameState.current, zeroTurn:zeroTurn, capTurn:capTurn});
  `;
  return JSON.parse(vm.runInContext(body, ctx));
}

const N = 400;
for (const on of [false, true]) {
  let zero = 0, cap = 0, eSum = 0, sSum = 0;
  const zeroTurns = [], capTurns = [];
  for (let i = 0; i < N; i++) {
    const r = sim(mk(on));
    if (r.zeroTurn > 0) { zero++; zeroTurns.push(r.zeroTurn); }
    if (r.capTurn > 0) { cap++; capTurns.push(r.capTurn); }
    eSum += r.c.energy; sSum += r.c.study;
  }
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
  console.log(
    (on ? '[平衡后] ' : '[平衡前] ') +
    '精力见底率 ' + (zero / N * 100).toFixed(0) + '%  ' +
    '学业封顶率 ' + (cap / N * 100).toFixed(0) + '%  |  ' +
    '平均终值 精力 ' + (eSum / N).toFixed(1) + ' 学业 ' + (sSum / N).toFixed(1) + '  |  ' +
    '首次见底回合 ' + avg(zeroTurns) + '  首次封顶回合 ' + avg(capTurns)
  );
}
