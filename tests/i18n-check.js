#!/usr/bin/env node
/* 真实浏览器冒烟检查（不进 run-all）：需本机已装 Chrome 或 Edge。

 * 打开新版工作台的每个页面（含深色、手机宽度、设定抽屉），收集 JS 报错；可选输出截图。 */
'use strict';
const DEMO = JSON.stringify(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures', 'demo-book.json'), 'utf8'))); // 原创演示书（只在内存里用），作为 JSON 字面量嵌进页面脚本
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.QZ_BASE || 'http://127.0.0.1:7801';
const shotDir = process.argv[2];
const candidates = [process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const exe = candidates.find(p => fs.existsSync(p));
if (!exe) { console.log('未找到 Chrome/Edge，跳过'); process.exit(0); }
const profile = path.join(__dirname, '..', '.test-tmp', 'chrome-profile-i18n');
fs.mkdirSync(profile, { recursive: true });
const port = 9333;
const chrome = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find(t => t.type === 'page'); } catch (e) { await sleep(200); }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const wait = new Map(); const errors = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result || m.error); wait.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  };
  const send = (method, params) => new Promise(r => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.method === 'Page.javascriptDialogOpening') { console.log('  DIALOG ' + m.params.message); send('Page.handleJavaScriptDialog', { accept: true }); } });
  const js = async expr => { const r = await Promise.race([new Promise(ok => setTimeout(() => { console.log('  TIMEOUT ' + expr.slice(0, 60)); ok({}); }, 8000)), send('Runtime.evaluate', { expression:expr, returnByValue:true, awaitPromise:true })]); return r.result && r.result.value; };
  const shot = async name => { if (!shotDir) return; fs.mkdirSync(shotDir, { recursive:true });
    const s = await send('Page.captureScreenshot', { format:'png' }); fs.writeFileSync(path.join(shotDir, name + '.png'), Buffer.from(s.data, 'base64')); };
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width:w, height:h, deviceScaleFactor:1, mobile:w < 600 });
  let bad = 0;
  const check = (label, text) => { console.log((errors.length ? '  报错  ' : '  正常  ') + label + (text ? '  ' + text : '')); errors.forEach(e => console.log('        ' + String(e).split('\n').slice(0,3).join(' | '))); bad += errors.length; errors.length = 0; };
  await size(1440, 900);
  await send('Page.navigate', { url:BASE + '/' }); await sleep(2000);
  await js('localStorage.setItem("qianzhang:theme","light")');
  await send('Page.navigate', { url:BASE + '/workspace/#/home' }); await sleep(1800);
  // 整个检查都换成内存里的示例书（不挂保存；所有保存调用在检查期间直接放空），用户的书一个字都不会动
  const useDemo = () => js(`(async () => { localStorage.setItem('qianzhang:insight-more', 'on'); await QZ.flush(); QZ.storage.save = () => Promise.resolve('server');
    const d = ${DEMO}; d.project_id = 'smoke-demo';
    QZ.project = new QZStore(d, 'smoke-demo'); QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 400)); return QZ.project.id; })()`);
  await js('localStorage.setItem("qianzhang:lang","en")');
  await send('Page.reload'); await sleep(1500);
  await useDemo();
  const left = new Set();
  for (const p of ['home','write','plan','insight','publish','notes','library','chat','settings']) {
    await js('QZ.navigate("' + p + '", true)'); await sleep(700);
    console.log('page ' + p); await shot('en-' + p);
    const lines = await js('(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (/[\\u4e00-\\u9fff]/.test(n.nodeValue) && !n.parentNode.closest("textarea,[contenteditable]")) out.push(n.parentNode.tagName + "|" + JSON.stringify(n.nodeValue.slice(0, 60)) + "|" + JSON.stringify(QZI18N.t(n.nodeValue).slice(0,60))); } document.querySelectorAll("[placeholder],[title]").forEach(e => [e.placeholder, e.title].forEach(v => v && /[\\u4e00-\\u9fff]/.test(v) && out.push("@" + v.slice(0, 80)))); return out; })()');
    check('EN ' + p, (lines || []).length + ' han nodes');
    (lines || []).forEach(l => left.add(l));
  }
  await js('localStorage.setItem("qianzhang:lang","zh")');
  await send('Page.reload'); await sleep(1200); await useDemo(); await js('QZ.navigate("settings", true)'); await sleep(600);
  check('ZH settings', await js('document.querySelector("h1").textContent + " | " + document.documentElement.lang'));
  await shot('zh-settings');
  fs.writeFileSync(path.join(shotDir || '.', 'leftover.txt'), [...left].join('\n'));
  console.log('leftover', left.size, 'bad', bad);
  ws.close(); chrome.kill(); await sleep(800); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} process.exit(bad ? 1 : 0);
}
main().catch(e => { console.error(e); chrome.kill(); process.exit(1); });