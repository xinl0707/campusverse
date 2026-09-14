/**
 * diary.js 核心业务逻辑单元测试
 * 使用 Node.js 内置测试运行器，零外部依赖
 */

const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// ===== 测试环境搭建 =====
// 模拟浏览器全局对象（document, localStorage, URL 等）
// 用 vm.createContext 创建隔离上下文，依次加载项目脚本

const rootDir = path.resolve(__dirname, '..');

const context = {
  // 浏览器全局
  console,
  setTimeout,
  clearTimeout,
  Date,
  JSON,
  Math,
  RegExp,
  Array,
  Object,
  String,
  Number,
  Error,
  Promise,
  // 模拟 localStorage
  localStorage: (() => {
    const store = {};
    return {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); }
    };
  })(),
  // 模拟 document（仅测试纯逻辑不需要完整 DOM）
  document: {
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({ classList: { add: () => {}, remove: () => {} }, style: {} }),
    body: { appendChild: () => {}, removeChild: () => {} }
  }
};

vm.createContext(context);

// 按依赖顺序加载脚本
// const/let 在 VM 中不会成为 context 属性，用 IIFE 包装显式暴露
const scriptDefs = [
  { file: 'common/js/utils.js', exports: ['StorageManager', 'Logger', 'DateUtils', 'showToast', 'debounce', 'throttle'] },
  { file: 'common/js/ai-proxy.js', exports: ['callAI', 'parseAiJson', 'getDiarySystemPrompt'] },
  { file: 'tools/js/modules/diary.js', exports: ['DiaryManager'] }
];

for (const { file, exports } of scriptDefs) {
  const code = fs.readFileSync(path.join(rootDir, file), 'utf-8');
  const returnObj = exports.map(e => `${e}: typeof ${e} !== 'undefined' ? ${e} : undefined`).join(',');
  const wrapped = `(function(self){${code}\nreturn {${returnObj}};})(this)`;
  const result = vm.runInContext(wrapped, context, { filename: file });
  Object.assign(context, result);
}

// 取出测试目标
const DiaryManager = context.DiaryManager;
const DateUtils = context.DateUtils;
const parseAiJson = context.parseAiJson;

// ===== 辅助函数 =====

/** 重置 DiaryManager 并注入自定义 userResponses */
function resetWith(responses = [], round = 0) {
  DiaryManager.userResponses = responses;
  DiaryManager.currentRound = round;
  DiaryManager.progress = {
    weather: false, style: false,
    event: false, emotion: false, insight: false
  };
}

// ===== DateUtils 测试 =====

test('DateUtils.formatDate - 格式化日期为 YYYY-MM-DD', () => {
  const d = new Date(2026, 8, 11); // 9月(0-indexed=8), 11日
  assert.strictEqual(DateUtils.formatDate(d), '2026-09-11');
});

test('DateUtils.formatDate - 个位数月日自动补零', () => {
  const d = new Date(2026, 0, 5);
  assert.strictEqual(DateUtils.formatDate(d), '2026-01-05');
});

test('DateUtils.formatTime - 格式化时间为 HH:MM', () => {
  const d = new Date(2026, 8, 11, 9, 5);
  assert.strictEqual(DateUtils.formatTime(d), '09:05');
});

test('DateUtils.getFriendlyDate - 今天显示"今天"', () => {
  assert.strictEqual(DateUtils.getFriendlyDate(DateUtils.formatDate(new Date())), '今天');
});

test('DateUtils.getFriendlyDate - 昨天显示"昨天"', () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  assert.strictEqual(DateUtils.getFriendlyDate(DateUtils.formatDate(d)), '昨天');
});

test('DateUtils.getFriendlyDate - 更早日期显示完整年月日', () => {
  assert.strictEqual(DateUtils.getFriendlyDate('2026-01-15'), '2026年1月15日');
});

// ===== parseAiJson 测试 =====

test('parseAiJson - 解析纯 JSON 字符串', () => {
  const result = parseAiJson('{"type":"options","message":"hello"}');
  assert.strictEqual(result.type, 'options');
  assert.strictEqual(result.message, 'hello');
});

test('parseAiJson - 从混合文本中提取 JSON', () => {
  const result = parseAiJson('好的，这是选项：\n{"type":"options","options":[]}\n希望你喜欢');
  assert.strictEqual(result.type, 'options');
});

test('parseAiJson - 无效 JSON 返回 null', () => {
  assert.strictEqual(parseAiJson('这不是JSON'), null);
});

test('parseAiJson - 无效 JSON 返回指定 fallback', () => {
  const fb = { fallback: true };
  assert.deepStrictEqual(parseAiJson('无效', fb), fb);
});

// ===== DiaryManager.analyzeCollectedInfo 测试 =====

test('analyzeCollectedInfo - 空响应时全部为 false', () => {
  resetWith([]);
  const info = DiaryManager.analyzeCollectedInfo();
  assert.strictEqual(info.hasEvent, false);
  assert.strictEqual(info.hasEmotion, false);
  assert.strictEqual(info.hasInsight, false);
});

test('analyzeCollectedInfo - 第3轮有输入时识别事件', () => {
  resetWith([
    { round: 3, type: 'input', value: '今天去公园散步了' }
  ]);
  assert.strictEqual(DiaryManager.analyzeCollectedInfo().hasEvent, true);
});

test('analyzeCollectedInfo - 包含情绪关键词时识别情感', () => {
  resetWith([
    { round: 3, type: 'input', value: '感觉很开心' }
  ]);
  const info = DiaryManager.analyzeCollectedInfo();
  assert.strictEqual(info.hasEvent, true);
  assert.strictEqual(info.hasEmotion, true);
});

test('analyzeCollectedInfo - 第4轮长文本识别为感悟', () => {
  resetWith([
    { round: 3, type: 'input', value: '今天去公园散步了' },
    { round: 4, type: 'input', value: '我觉得生活中简单的时刻往往最珍贵，每次散步都让我感到平静' }
  ]);
  const info = DiaryManager.analyzeCollectedInfo();
  assert.strictEqual(info.hasEvent, true);
  assert.strictEqual(info.hasEmotion, true);
  assert.strictEqual(info.hasInsight, true);
});

test('analyzeCollectedInfo - 第1-2轮输入不计入事件/情感/感悟', () => {
  resetWith([
    { round: 1, type: 'option', value: 'sunny', title: '晴朗' },
    { round: 2, type: 'option', value: 'concise', title: '特别简洁的' }
  ]);
  const info = DiaryManager.analyzeCollectedInfo();
  assert.strictEqual(info.hasEvent, false);
  assert.strictEqual(info.hasEmotion, false);
  assert.strictEqual(info.hasInsight, false);
});

// ===== DiaryManager.parseAIResponse 测试 =====

test('parseAIResponse - 检测 [GENERATE_DIARY] 标记（round >= 3）', () => {
  resetWith([], 3);
  const result = DiaryManager.parseAIResponse('信息够了 [GENERATE_DIARY]', 4);
  assert.strictEqual(result.generateDiary, true);
  assert.strictEqual(result.message, '信息够了');
  assert.strictEqual(result.options[0].value, 'generate');
});

test('parseAIResponse - round < 3 时忽略 [GENERATE_DIARY]', () => {
  resetWith([], 1);
  const result = DiaryManager.parseAIResponse('好的 [GENERATE_DIARY]', 2);
  assert.strictEqual(result.generateDiary, false);
});

test('parseAIResponse - 解析 options 类型 JSON', () => {
  resetWith([], 3);
  const json = JSON.stringify({
    type: 'options',
    message: '选一个吧',
    options: [{ icon: '🎯', title: '选项A', desc: '描述', value: 'a' }]
  });
  const result = DiaryManager.parseAIResponse(json, 4);
  assert.strictEqual(result.message, '选一个吧');
  // round >= 3 时会自动追加"生成日记"选项
  const lastOpt = result.options[result.options.length - 1];
  assert.strictEqual(lastOpt.value, 'generate');
});

test('parseAIResponse - 普通文本 round >= 3 返回 null 选项', () => {
  resetWith([], 3);
  const result = DiaryManager.parseAIResponse('普通回复', 4);
  assert.strictEqual(result.options, null);
  assert.strictEqual(result.showInput, true);
});

test('parseAIResponse - 普通文本 round < 3 返回预定义选项', () => {
  resetWith([], 1);
  const result = DiaryManager.parseAIResponse('好的呢', 2);
  assert.strictEqual(result.options, DiaryManager.round2Options);
  assert.strictEqual(result.showInput, false);
});

// ===== DiaryManager.calculateProgress 测试 =====

test('calculateProgress - 全未收集返回 0', () => {
  resetWith([]);
  assert.strictEqual(DiaryManager.calculateProgress(), 0);
});

test('calculateProgress - 仅天气 15%', () => {
  resetWith([]);
  DiaryManager.progress.weather = true;
  assert.strictEqual(DiaryManager.calculateProgress(), 15);
});

test('calculateProgress - 天气+风格+事件+情感+感悟 = 100%', () => {
  resetWith([]);
  DiaryManager.progress = {
    weather: true, style: true,
    event: true, emotion: true, insight: true
  };
  assert.strictEqual(DiaryManager.calculateProgress(), 100);
});

test('calculateProgress - 不超过 100%', () => {
  resetWith([]);
  DiaryManager.progress = {
    weather: true, style: true,
    event: true, emotion: true, insight: true
  };
  assert.ok(DiaryManager.calculateProgress() <= 100);
});

// ===== DiaryManager.getFallbackResponse 测试 =====

test('getFallbackResponse - 第1轮返回风格选项', () => {
  resetWith([], 1);
  const result = DiaryManager.getFallbackResponse(1);
  assert.ok(result.message.length > 0);
  assert.deepStrictEqual(result.options, DiaryManager.round2Options);
  assert.strictEqual(result.showInput, false);
});

test('getFallbackResponse - 第2轮返回灵活选项+输入框', () => {
  resetWith([], 2);
  const result = DiaryManager.getFallbackResponse(2);
  assert.ok(result.message.length > 0);
  assert.ok(Array.isArray(result.options));
  assert.strictEqual(result.showInput, true);
});

test('getFallbackResponse - 信息充足时提供生成日记选项', () => {
  resetWith([
    { round: 3, type: 'input', value: '今天去公园散步了' },
    { round: 3, type: 'input', value: '感觉很开心' },
    { round: 4, type: 'input', value: '我觉得生活中简单的时刻往往最珍贵，每次散步都让我感到平静' }
  ], 5);
  const result = DiaryManager.getFallbackResponse(5);
  assert.ok(result.options.some(o => o.value === 'generate'));
  assert.strictEqual(result.showInput, true);
});

// ===== DiaryManager.getOptionsForRound 测试 =====

test('getOptionsForRound - 第2轮返回写作风格选项', () => {
  assert.deepStrictEqual(DiaryManager.getOptionsForRound(2), DiaryManager.round2Options);
});

test('getOptionsForRound - 第3轮起返回灵活选项', () => {
  resetWith([], 3);
  const opts = DiaryManager.getOptionsForRound(3);
  assert.ok(Array.isArray(opts));
  assert.ok(opts.length > 0);
});

test('getOptionsForRound - 第1轮返回 null', () => {
  assert.strictEqual(DiaryManager.getOptionsForRound(1), null);
});
