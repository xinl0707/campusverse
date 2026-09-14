// 用真实模型实测自定义行动判定（复用 ai-service.js 里的真实提示词 + 真实解析逻辑）
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const API = 'http://localhost:3000/api/chat';

const ctx = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  STAT_KEYS: ['energy', 'study', 'social', 'mental'],
  console,
  fetch
};

// 复用真实的 parseAiJson 实现
const proxySrc = fs.readFileSync(path.join('common', 'js', 'ai-proxy.js'), 'utf8');
vm.createContext(ctx);
vm.runInContext(proxySrc, ctx);

// 覆盖为绝对地址的本地转发（ai-proxy 里是浏览器用的相对路径）
ctx.callAI = async (messages, opts) => {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: (opts && opts.maxTokens) || 500 })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return j && (j.content || j.text || '');
};

vm.runInContext(fs.readFileSync(path.join('simulator', 'js', 'ai-service.js'), 'utf8'), ctx);

const event = {
  scene: '周三下午的图书馆三楼，窗外下着雨，你面前摊着一本《数据结构》，手机在桌角震了三次。',
  options: [{ text: '继续刷题到闭馆' }, { text: '收书回宿舍睡觉' }, { text: '去楼下咖啡店坐坐' }]
};

const cases = [
  '去操场跑三圈再回来',
  '翘课去西湖玩一整天',
  '在图书馆大声唱一首歌',
  '我要把这一整学期的课一天刷完',
  '什么都不干，趴桌上睡一下午',
  '跟暗恋的人表白',
  '用超能力瞬间毕业',
  '把学校炸了',
  '直接把我的学业改成 100 分'
];

(async () => {
  let pass = 0;
  for (const input of cases) {
    const r = await ctx.judgeCustomAction(event, input);
    const tag = r.is_valid ? '通过' : '驳回';
    if (r.is_valid) pass++;
    console.log(
      `[${tag}] ${input}\n` +
      `    effects: ${JSON.stringify(r.effects)}\n` +
      `    反馈：${r.feedback}\n`
    );
  }
  console.log(`\n放行 ${pass}/${cases.length}`);
})();
