/**
 * 用本机 Edge + CDP 实测「重新开始」按钮是否真的生效。
 * 重点验证：原生 confirm 被拦截（返回 false）时按钮是否变成死键。
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const URL = 'http://localhost:3000/simulator/';

function getJSON(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, res => {
      let b = '';
      res.on('data', c => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(b)); } });
    }).on('error', reject);
  });
}
function postJSON(p) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'PUT' }, res => {
      let b = '';
      res.on('data', c => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(b)); } });
    });
    req.on('error', reject);
    req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && c.pending.has(m.id)) { c.pending.get(m.id)(m); c.pending.delete(m.id); }
      else c.events.push(m);
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise(res => this.pending.set(id, res));
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      return { __error: r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || '') };
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

(async () => {
  const userDir = path.join(os.tmpdir(), 'edge-cdp-' + Date.now());
  const proc = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--mute-audio',
    '--disable-extensions', 'about:blank'
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 40; i++) {
    try { version = await getJSON('/json/version'); break; } catch (e) { await sleep(250); }
  }
  if (!version) { console.log('无法连接 CDP'); proc.kill(); process.exit(1); }

  const target = await postJSON('/json/new?' + encodeURIComponent(URL));
  const cdp = await CDP.connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: URL });
  await sleep(2500);

  console.log('页面标题:', await cdp.eval('document.title'));

  // 关键：把原生 confirm 打回 false，模拟被拦截的环境（旧代码在这种情况下会毫无反应）
  await cdp.eval(`
    window.__confirmLog = [];
    window.confirm = function(msg){ window.__confirmLog.push('BLOCKED'); return false; };
    'patched';
  `);

  // 直接进入游戏页（跳过 AI 开场，节省时间）
  const setup = await cdp.eval(`
    (function(){
      try {
        newGame({name:'测试',gender:'男',school:'杭电',major:'人工智能',self_mbti:'INFP'});
        showScreen('screen-game');
        return 'screen-game ready, active=' + (document.querySelector('.screen.active')||{}).id;
      } catch(e) { return 'ERR ' + e.message; }
    })()
  `);
  console.log('进入游戏页:', setup);

  // 点击「重新开始」
  const clicked = await cdp.eval(`
    (function(){
      const b = document.getElementById('btn-restart');
      if (!b) return 'no-button';
      b.click();
      return 'clicked';
    })()
  `);
  console.log('点击重新开始:', clicked);
  await sleep(300);
  console.log('①原生 confirm 是否被调用 (应为空):', await cdp.eval('JSON.stringify(window.__confirmLog)'));
  console.log('①确认框是否弹出:', await cdp.eval('!document.getElementById("confirm-mask").classList.contains("hidden")'));

  // 点「确定」→ 应回到欢迎页
  await cdp.eval('document.getElementById("confirm-ok").click(); "ok-clicked"');
  await sleep(300);
  console.log('①点确定后屏幕:', await cdp.eval('(document.querySelector(".screen.active")||{}).id'));
  console.log('①确认框已关闭:', await cdp.eval('document.getElementById("confirm-mask").classList.contains("hidden")'));

  // ② 测取消：回到游戏页再点一次，这次点「取消」
  await cdp.eval(`
    newGame({name:'测试',gender:'男',school:'杭电',major:'人工智能',self_mbti:'INFP'});
    document.getElementById('inp-name').value='旧名字';
    showScreen('screen-game'); 'back';
  `);
  await cdp.eval('document.getElementById("btn-restart").click(); "clicked"');
  await sleep(250);
  await cdp.eval('document.getElementById("confirm-cancel").click(); "cancel"');
  await sleep(250);
  console.log('②点取消后屏幕 (应仍在 game):', await cdp.eval('(document.querySelector(".screen.active")||{}).id'));

  // ③ 再点一次并确定，验证表单被清空
  await cdp.eval('document.getElementById("btn-restart").click(); "clicked"');
  await sleep(250);
  await cdp.eval('document.getElementById("confirm-ok").click(); "ok"');
  await sleep(300);
  console.log('③屏幕:', await cdp.eval('(document.querySelector(".screen.active")||{}).id'));
  console.log('③姓名输入框已清空:', await cdp.eval('JSON.stringify(document.getElementById("inp-name").value)'));
  console.log('③MBTI 已复位:', await cdp.eval('JSON.stringify(document.getElementById("mbti-result-text").textContent)'));
  console.log('③内存对局已清空 (hasGame):', await cdp.eval('hasGame()'));
  console.log('③性别选中数:', await cdp.eval('document.querySelectorAll("#gender-group .chip.selected").length'));

  cdp.close();
  proc.kill();
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
