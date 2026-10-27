#!/usr/bin/env node
/* 真实浏览器冒烟检查（不进 run-all）：需本机已装 Chrome 或 Edge。
 * 用法：node tests/browser-smoke.js [截图目录]
 *   默认自己起一个本地服务，作品目录用 .test-tmp/smoke-data（查完删除），绝不读写 data/。
 *   QZ_BASE=http://127.0.0.1:端口 —— 改为检查已经在跑的服务（只用内存里的临时书，不保存）。
 *   CHROME=浏览器路径 —— 指定 Chrome/Edge/Chromium。支持 Node 18/20/22+（没有内置 WebSocket 时用自带的极简实现）。
 * 打开新版工作台的每个页面（含深色、手机宽度、设定抽屉），收集 JS 报错；可选输出截图。 */
'use strict';
const DEMO = JSON.stringify(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures', 'demo-book.json'), 'utf8'))); // 原创演示书（只在内存里用），作为 JSON 字面量嵌进页面脚本
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
let BASE = process.env.QZ_BASE ? process.env.QZ_BASE.replace(/\/+$/, '') : '';
const tmpData = path.join(__dirname, '..', '.test-tmp', 'smoke-data');
let server = null;
const repoData = path.join(__dirname, '..', 'data', 'projects');
const dataSig = () => { try { return fs.readdirSync(repoData).map(f => { const st = fs.statSync(path.join(repoData, f)); return f + st.size + st.mtimeMs; }).join('|'); } catch (e) { return 'none'; } };
const dataBefore = dataSig();
/* 没有 QZ_BASE：自己起服务，作品目录指向临时文件夹 */
function startServer() {
  fs.rmSync(tmpData, { recursive:true, force:true }); fs.mkdirSync(path.join(tmpData, 'projects'), { recursive:true });
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js'), path.join(__dirname, '..'), '0'], { stdio:['ignore', 'pipe', 'pipe'], env:Object.assign({}, process.env, { QZ_DATA:tmpData, PORT:'' }) });
  return new Promise((ok, no) => { let o = ''; const t = setTimeout(() => no(new Error('本地服务启动超时')), 8000);
    server.stdout.on('data', c => { o += c; const m = o.match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (m) { clearTimeout(t); BASE = 'http://127.0.0.1:' + m[1]; ok(); } });
    server.on('exit', c => { clearTimeout(t); no(new Error('本地服务退出 ' + c)); }); });
}
function stopServer() { if (server) { server.kill(); server = null; } fs.rmSync(tmpData, { recursive:true, force:true }); }
/* Node 18/20 没有全局 WebSocket：极简客户端，只够连本机 DevTools（文本帧、分片、64 位长度） */
class MiniWS {
  constructor(url) {
    const u = new URL(url), key = crypto.randomBytes(16).toString('base64');
    this.sock = net.connect(+u.port, u.hostname, () => this.sock.write('GET ' + u.pathname + ' HTTP/1.1\r\nHost: ' + u.host + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n'));
    let buf = Buffer.alloc(0), open = false, parts = [];
    this.sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!open) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; buf = buf.slice(i + 4); open = true; this.onopen && this.onopen(); }
      for (;;) {
        if (buf.length < 2) return;
        let len = buf[1] & 127, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const fin = buf[0] & 128, op = buf[0] & 15, body = buf.slice(off, off + len); buf = buf.slice(off + len);
        if (op === 1 || op === 0) { parts.push(body); if (fin) { const data = Buffer.concat(parts).toString('utf8'); parts = []; this.onmessage && this.onmessage({ data }); } }
      }
    });
  }
  send(text) {
    const b = Buffer.from(text), mask = crypto.randomBytes(4), n = b.length;
    const head = n < 126 ? Buffer.from([0x81, 0x80 | n]) : n < 65536 ? Buffer.from([0x81, 0xfe, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 0xff]), (() => { const x = Buffer.alloc(8); x.writeBigUInt64BE(BigInt(n)); return x; })()]);
    for (let i = 0; i < n; i++) b[i] ^= mask[i & 3];
    this.sock.write(Buffer.concat([head, mask, b]));
  }
  close() { try { this.sock.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0])); this.sock.end(); } catch (e) {} setTimeout(() => { try { this.sock.destroy(); } catch (e) {} }, 200); }
}
const WS = typeof WebSocket === 'function' ? WebSocket : MiniWS;
const shotDir = process.argv[2];
const candidates = [process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const exe = candidates.find(p => fs.existsSync(p));
if (!exe) { console.log('未找到 Chrome/Edge（可用 CHROME=路径 指定），跳过'); process.exit(0); }
const profile = path.join(__dirname, '..', '.test-tmp', 'chrome-profile');
fs.mkdirSync(profile, { recursive: true });
const port = +process.env.QZ_DEVTOOLS_PORT || 9333 + Math.floor(Math.random() * 600); // 随机端口，避免和别的浏览器检查撞车
const chrome = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  if (!BASE) await startServer();
  console.log('检查对象：' + BASE + (server ? '（临时作品目录，查完删除）' : ''));
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find(t => t.type === 'page'); } catch (e) { await sleep(200); }
  }
  const ws = new WS(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const wait = new Map(); const errors = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result || m.error); wait.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  };
  const send = (method, params) => new Promise(r => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  const js = async expr => { const r = await send('Runtime.evaluate', { expression:expr, returnByValue:true, awaitPromise:true }); return r.result && r.result.value; };
  const shot = async name => { if (!shotDir) return; fs.mkdirSync(shotDir, { recursive:true });
    const s = await send('Page.captureScreenshot', { format:'png' }); fs.writeFileSync(path.join(shotDir, name + '.png'), Buffer.from(s.data, 'base64')); };
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width:w, height:h, deviceScaleFactor:1, mobile:w < 600 });
  let bad = 0;
  const check = (label, text) => { console.log((errors.length ? '  报错  ' : '  正常  ') + label + (text ? '  ' + text : '')); errors.forEach(e => console.log('        ' + String(e).split('\n').slice(0,3).join(' | '))); bad += errors.length; errors.length = 0; };
  await size(1440, 900);
  await send('Page.navigate', { url:BASE + '/' }); await sleep(2000);
  // 新安装默认中文（设置里可切换 English）；下面的交互用中文标签。
  const initialLang = await js('QZI18N.lang()');
  if (initialLang !== 'zh') errors.push('首次默认语言不是中文：' + initialLang);
  check('首次默认中文', initialLang);
  await js('localStorage.setItem("qianzhang:lang", "zh")');
  await send('Page.reload'); await sleep(1200);
  const fixtureLang = await js('QZI18N.lang()');
  if (fixtureLang !== 'zh') errors.push('中文交互检查未切换语言：' + fixtureLang);
  check('切换中文供交互检查', fixtureLang);
  await js('localStorage.setItem("qianzhang:theme","light")');
  if (server) { /* 首次打开（不带页面地址）：落在空书架首页，不进引导，顶栏不说“当前作品：我的作品” */
    await send('Page.navigate', { url:BASE + '/workspace/' }); await sleep(2200);
    const first = await js(`(() => { const ps = document.getElementById('project-switch'); return { hash:location.hash, shelf:!!document.querySelector('.empty-shelf'),
      top:ps ? ps.textContent.trim() : '', btns:[...document.querySelectorAll('.empty-shelf button')].map(b => b.textContent.trim()).join('/') }; })()`);
    if (!first || /onboard/.test(first.hash) || !first.shelf || /我的作品|当前作品/.test(first.top) || !/新建作品/.test(first.btns) || /示例/.test(first.btns)) errors.push('首次打开不对：' + JSON.stringify(first));
    check('首次打开落在空书架、顶栏不显示作品', JSON.stringify(first));
  }
  await send('Page.navigate', { url:BASE + '/workspace/#/home' }); await sleep(1800);
  if (server) { /* 全新作品目录：随便点一圈（首页、设置、大纲、改每日目标）也不该凭空存出一本空书 */
    const fresh = await js(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)), r = {}; r.empty = !!document.querySelector('.empty-shelf') || location.hash.indexOf('onboard') >= 0;
      for (const pg of ['settings', 'plan', 'library', 'write', 'publish', 'onboard', 'home']) { QZ.navigate(pg, true); await sleep(250); }
      r.shelf = !!document.querySelector('.empty-shelf'); try { QZ.project.data.writing = QZ.project.data.writing || {}; QZ.project.touch ? QZ.project.touch() : 0; QZ.scheduleSave(); } catch (e) {} await sleep(1200); await QZ.flush();
      r.files = (await (await fetch('/api/projects')).json()).projects.length; return r; })()`);
    if (!fresh || fresh.files !== 0 || !fresh.shelf) errors.push('空书架凭空存出了作品：' + JSON.stringify(fresh));
    check('全新作品目录不留空书', JSON.stringify(fresh));
    /* 对照：刷新、模拟关页仍不落盘；写下第一章后才落盘（随后删掉，不影响后面的检查） */
    await send('Page.reload'); await sleep(2000);
    const ctl = await js(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)), n = async () => (await (await fetch('/api/projects')).json()).projects.length;
      dispatchEvent(new Event('pagehide')); document.dispatchEvent(new Event('visibilitychange')); await sleep(800); const r = { afterHide: await n() };
      QZ.project.addChapter('对照章', '写下第一个字'); QZ.scheduleSave(); await sleep(1500); await QZ.flush(); r.afterWrite = await n(); return r; })()`);
    if (!ctl || ctl.afterHide !== 0 || !(ctl.afterWrite > 0)) errors.push('首次写字落盘对照不对：' + JSON.stringify(ctl));
    check('刷新/关页不建书，写第一章才保存', JSON.stringify(ctl));
    fs.rmSync(path.join(tmpData, 'projects'), { recursive:true, force:true }); fs.mkdirSync(path.join(tmpData, 'projects'), { recursive:true });
    await send('Page.navigate', { url:BASE + '/' }); await sleep(800); await js('localStorage.clear(); indexedDB.databases ? indexedDB.databases().then(d => d.forEach(x => indexedDB.deleteDatabase(x.name))) : 0'); await js('localStorage.setItem("qianzhang:lang", "zh")'); await js('localStorage.setItem("qianzhang:theme","light")');
    await send('Page.navigate', { url:BASE + '/workspace/#/home' }); await sleep(1800);
    const leftovers = fs.readdirSync(path.join(tmpData, 'projects')).filter(f => f.endsWith('.json'));
    if (leftovers.length) errors.push('临时作品目录里出现了文件：' + leftovers.join(','));
  }
  // 整个检查都换成内存里的示例书（不挂保存；所有保存调用在检查期间直接放空），用户的书一个字都不会动
  const useDemo = () => js(`(async () => { localStorage.setItem('qianzhang:insight-more', 'on'); localStorage.setItem('qianzhang:check-more', 'open'); await QZ.flush(); QZ.storage.save = () => Promise.resolve('server');
    const d = ${DEMO}; d.project_id = 'smoke-demo';
    QZ.project = new QZStore(d, 'smoke-demo'); QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 400)); return QZ.project.id; })()`);
  const demo = await useDemo(); if (demo !== 'smoke-demo') errors.push('没能换成示例书：' + demo);
  check('首页', await js('document.querySelectorAll(".entry-card").length + " 个入口，作品：" + document.querySelector(".hero h1").textContent'));
  await shot('1-home');
  const person = await js('(QZ.project.data.nodes.find(n => n.type === "PERSON") || {}).id || ""');
  check('首页码字面板', await js('document.querySelectorAll(".hm").length + " 个日历格，" + document.querySelector(".streak").textContent'));
  // 设置迁移：旧版本设置键会被复制为 qianzhang:*（只读检查，不改作品数据）
  await js('localStorage.removeItem("qianzhang:migrated"); localStorage.setItem("canongraph:smoke-mig","1"); localStorage.removeItem("qianzhang:smoke-mig")');
  await send('Page.reload'); await sleep(1500);
  await useDemo();
  const mig = await js('localStorage.getItem("qianzhang:smoke-mig")');
  if (mig !== '1') errors.push('旧设置没有迁移到 qianzhang:*');
  await js('localStorage.removeItem("canongraph:smoke-mig"); localStorage.removeItem("qianzhang:smoke-mig")');
  check('旧设置迁移', mig === '1' ? '旧键 → qianzhang:*' : '');
  const routes = [['write', '2-write', '#ch-text'], ['plan', '3-plan', '.plan-layout + .tl'], ['insight', '14-insight', '.pc-chart .pc-bar'], ['library', '4-library', '.entity-card'], ['library/' + person, '5-library-drawer', '.drawer .pg-list'],
    ['chat/' + person, '6-chat', '.composer'], ['settings', '7-settings', '#w-goal'], ['publish', '21-publish', '.pb-main'], ['library', '22-plan-tabs', '.subtabs a.on']];
  for (const [route, name, sel] of routes) {
    await js('location.hash = "#/' + route + '"'); await sleep(900);
    const ok = await js('!!document.querySelector(' + JSON.stringify(sel) + ')');
    if (!ok) { errors.push('缺少 ' + sel); }
    check('#/' + route, await js('document.title'));
    await shot(name);
  }
  // 体检面板：点击一个命中项能在正文里选中
  await js('location.hash = "#/write"'); await sleep(700);
  const hit = await js('(() => { const b = document.querySelector(".check-panel .hit"); if (!b) return "（本章没有命中项）"; b.click(); const t = document.getElementById("ch-text"); return "定位：" + t.value.slice(t.selectionStart, t.selectionEnd); })()');
  check('本章体检', await js('document.querySelectorAll(".check-sec").length + " 个检查项，" + document.querySelectorAll(".mention").length + " 位出场"') + '，' + hit);
  // 渲染耗时（长篇性能参考）
  const perf = await js('(() => { const out = []; for (const pg of ["home", "write", "plan", "library"]) { QZ.route = { page:pg, params:[] }; const t = performance.now(); QZ.renderPage(); out.push(pg + " " + Math.round(performance.now() - t) + "ms"); } location.hash = "#/write"; return out.join("，"); })()'); await sleep(600);
  check('渲染耗时', perf + '（' + await js('QZ.project.chapters().length') + ' 章）');
  // 人物关系图 + 写作统计（只切换视图）
  await js('localStorage.setItem("qianzhang:library-view", "graph"); location.hash = "#/library"'); await sleep(600);
  const gr = await js('[document.querySelectorAll(".rel-graph .g-node").length, !!document.querySelector("#entity-host .empty-state")]'); await shot('16-graph');
  if (!gr[0] && !gr[1]) errors.push('关系图没有显示');
  await js('localStorage.setItem("qianzhang:library-view", "grid"); location.hash = "#/home"'); await sleep(500);
  await js('document.querySelector("[data-act=\\"home.span\\"][data-n=\\"30\\"]").click()'); await sleep(300);
  const rp = await js('document.querySelectorAll(".rp-col").length'); await js('document.querySelector(".report").scrollIntoView()'); await sleep(200); await shot('17-report');
  if (rp !== 30) errors.push('写作统计异常：' + rp);
  check('关系图与统计', (gr[0] ? gr[0] + ' 个节点' : '空状态') + '，统计 ' + rp + ' 天');
  // 读者评论整理（不保存）
  await js('location.hash = "#/insight"'); await sleep(500);
  const cq = await js('(() => { const q = QZ.project.chapters()[0].text.replace(/\\s/g, "").slice(2, 5); const i = document.getElementById("cm-in"); i.value = "这里「" + q + "」是不是写错了\\n求加更\\n建议多写打斗"; i.dispatchEvent(new Event("input")); return q; })()'); await sleep(500);
  const cm = await js('[document.querySelectorAll(".cm-hits a").length, document.querySelectorAll(".cm-item").length]');
  await js('document.getElementById("cm-in").scrollIntoView({ block:"start" })'); await sleep(200); await shot('15-comments');
  if (!cm[0] || cm[1] !== 3) errors.push('评论整理异常：' + cm);
  check('读者评论整理', cm[1] + ' 条，指错「' + cq + '」定位到 ' + cm[0] + ' 处');
  await js('location.hash = "#/write"'); await sleep(400);
  // 编辑栏在 1024 宽也不该溢出
  const bar = await js('(() => { const b = document.querySelector(".editor-bar"), x = b.querySelector(".btn.ghost.sm"); return [b.scrollWidth, b.clientWidth, getComputedStyle(x).fontSize, innerWidth]; })()');
  if (bar[0] > bar[1] + 2) errors.push('编辑栏溢出：' + bar.join(' '));
  check('编辑栏宽度', bar.join(' '));
  // 字体与纸张（只改 localStorage）、模板弹窗（只打开再取消）
  await js('localStorage.setItem("qianzhang:paper", JSON.stringify({ font:"kai", size:20, lh:2.3, paper:"parch", w:780 })); QZ.renderPage()'); await sleep(400);
  const pp = await js('[document.body.dataset.paper, getComputedStyle(document.getElementById("ch-text")).fontSize]'); await shot('18-paper');
  await js('localStorage.removeItem("qianzhang:paper"); QZ.renderPage()'); await sleep(200);
  if (pp[0] !== 'parch' || pp[1] !== '20px') errors.push('纸张设置没生效：' + pp);
  await js('QZPages.write.actions.template(QZ)'); await sleep(300);
  const tp = await js('document.querySelectorAll(".tpl").length'); await js('document.querySelector(".modal [data-v=__x]").click()'); await sleep(250);
  if (tp < 5) errors.push('模板数量不对：' + tp);
  check('纸张与模板', pp.join(' ') + '，' + tp + ' 个模板');
  await js('QZ.navigate("write", false, [QZ.project.chapters()[0].id])'); await sleep(300);
  await js('window._r = QZAI.ready; QZAI.ready = () => true; QZPages.write.aiWrite(QZ); QZAI.ready = window._r'); await sleep(350); await shot('19-ai-write');
  await js('document.querySelector(".modal [data-v=__x]").click()'); await sleep(250);
  // 里程碑卡片截图（只读）
  await js('location.hash = "#/home"'); await sleep(600); await js('document.querySelector(".ms") && document.querySelector(".ms").scrollIntoView({ block:"center" })'); await sleep(300); await shot('23-milestones');
  const ms = await js('[document.querySelectorAll(".ms-item").length, getComputedStyle(document.querySelector(".ps-title")).webkitLineClamp]');
  if (ms[0] !== 2) errors.push('里程碑卡片缺失：' + ms); check('里程碑与书名', ms.join(' '));
  // 切书弹层：打开、搜索、Esc 关闭（不切换）
  await js('QZPages.home.switcher(QZ)'); await sleep(500); await shot('20-switcher');
  const sw = await js('[document.querySelectorAll(".bp-item").length, (document.querySelector(".bp-item small")||{}).textContent]');
  await js('document.querySelector(".book-pop input").dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true }))'); await sleep(100);
  if (!sw || sw[0] < 1 || await js('!!document.querySelector(".book-pop")')) errors.push('切书弹层异常：' + sw);
  check('切书弹层', sw[0] + ' 本，' + sw[1]);
  // 情节分支：临时书（内存里，不保存），查完换回
  const br = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window._real = QZ.project; window._cur = localStorage.getItem('qianzhang:current');
    const t = new QZStore({ project_id:'smoke-br', meta:{ title:'临时分支书' }, nodes:[], relations:[] }, 'smoke-br'); const c = t.addChapter('第一章', '她推开门。\\n门外是雨。');
    QZ.project = t; QZ.navigate('write', false, [c.id]); await sleep(300);
    QZPages.write.actions.branches(QZ); await sleep(250);
    document.getElementById('br-name').value = '方案B'; document.getElementById('br-save').click(); await sleep(100);
    t.chapter(c.id).text = '她推开门。\\n门外是雪。'; document.querySelector('.hist-item').click(); await sleep(150);
    return [t.branches(c.id).length, document.querySelectorAll('.diff p').length];
  })()`);
  await shot('24-branches');
  const br2 = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), t = QZ.project, c = t.chapters()[0];
    document.querySelector('[data-b=use]').click(); await sleep(150); const after = [t.chapter(c.id).text, t.chapter(c.id).activeBranch];
    document.querySelector('.modal [data-v=__x]').click(); await sleep(200);
    QZ.project = window._real; if (window._cur === null) localStorage.removeItem('qianzhang:current'); else localStorage.setItem('qianzhang:current', window._cur);
    QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(200); return after.concat(QZ.project.id);
  })()`);
  if (!br || br[0] !== 1 || br[1] < 1 || !/雨/.test(br2[0]) || br2[1] !== '方案B' || br2[2] === 'smoke-br') errors.push('情节分支异常：' + JSON.stringify([br, br2]));
  check('情节分支（临时书）', br && br2 && ('分支 ' + br[0] + '，差异 ' + br[1] + ' 段，换成正文后「' + br2[1] + '」'));
  // 素材墙：临时书里记几条、筛标签、在写作页插入正文
  const nt = await js(`(async () => {
    const real = QZ.project, cur = localStorage.getItem('qianzhang:current'), sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
      const t = new QZStore({ project_id:'smoke-nt', meta:{ title:'临时测试书' }, nodes:[{ id:'n1', type:'PERSON', name:'沈砚', summary:'反派' }], relations:[] }, 'smoke-nt');
      window.__realP = real; window.__realCur = cur; const c = t.addChapter('雨夜', '沈砚站在桥头。'); QZ.project = t;
      t.addNote('#反派 沈砚笑的时候从不露牙，眼睛却一直在笑。', ['n1']); t.addNote('#氛围 雨落在青石板上，像有人在远处数铜钱。', [c.id]);
      t.addNote('#金句 「你救不了所有人，但你可以先救她。」'); t.addNote('#资料 宋代夜禁：三更后坊门关闭，巡夜者击柝。'); t.addNote('#反派 #伏笔 他左手小指缺了半截——第十章再揭开来历。', ['n1', c.id]);
      t.updateNote(t.notes()[4].id, { pinned:true });
      QZ.navigate('notes'); await sleep(300);
      const cards = document.querySelectorAll('.nt').length;
      document.querySelector('.nt-tags [data-tag="反派"]').click(); await sleep(200);
      const filtered = document.querySelectorAll('.nt').length;
      document.querySelector('.nt-tags [data-tag=""]').click(); await sleep(200);
      return [cards, filtered];
    } catch (e) { QZ.project = real; return ['err', e.message]; }
  })()`);
  await shot('25-notes');
  const nt2 = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
      const t = QZ.project, c = t.chapters()[0]; QZ.navigate('write', false, [c.id]); await sleep(300);
      const ta = document.getElementById('ch-text'); ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length;
      QZPages.write.actions.notes(QZ); await sleep(300);
      const mine = document.querySelectorAll('.nt-mini .nt').length;
      document.querySelector('.nt-mini [data-n="insert"]').click(); await sleep(200);
      return [mine, t.chapter(c.id).text, t.id];
    } catch (e) { return ['err', e.message]; }
  })()`);
  await shot('26-notes-write');
  await js(`(async () => { document.querySelectorAll('.modal-wrap [data-v="__x"]').forEach(b => b.click()); await new Promise(r => setTimeout(r, 200)); })()`);
  const ntBack = await js(`(async () => { if (window.__realP) QZ.project = window.__realP; const cur = window.__realCur; if (cur === null) localStorage.removeItem('qianzhang:current'); else if (cur) localStorage.setItem('qianzhang:current', cur); delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); return QZ.project.id; })()`);
  if (ntBack === 'smoke-nt') errors.push('素材墙检查后没换回用户的书');
  if (!nt || nt[0] !== 5 || nt[1] !== 2 || !nt2 || nt2[0] < 2 || !/沈砚站在桥头。.+/.test(nt2[1]) || nt2[2] !== 'smoke-nt') errors.push('素材墙异常：' + JSON.stringify([nt, nt2]));
  check('素材墙（临时书）', nt && nt2 && (nt[0] + ' 条，筛「#反派」剩 ' + nt[1] + ' 条，本章素材 ' + nt2[0] + ' 条，插入正文成功'));
  // 战力 / 资源成长：临时书（只在内存里）
  const gro = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
      window.__realP = real; const t = new QZStore({ project_id:'smoke-gro', meta:{ title:'临时测试书' }, nodes:[{ id:'h', type:'PERSON', name:'林舟' }, { id:'f', type:'PERSON', name:'沈砚' }], relations:[] }, 'smoke-gro');
      const ch = []; for (let i = 0; i < 60; i++) ch.push(t.addChapter('第' + (i + 1) + '章', '林舟和沈砚在山门前对峙，一拳打出，竟然突破了。'));
      const add = (e, i, text, kind) => t.addProgress(e, { chapterId:ch[i - 1].id, text, kind });
      add('h', 1, '炼气三层', 'power'); add('h', 4, '筑基', 'power'); add('h', 6, '金丹', 'power'); add('h', 30, '元婴', 'power');
      add('f', 2, '金丹后期', 'power'); add('f', 12, '跌落筑基', 'power'); add('f', 15, '化神', 'power');
      add('h', 3, '灵石 +120', 'res'); add('h', 9, '灵石 -200', 'res'); add('f', 5, '魂珠 +3', 'res');
      QZ.project = t; QZ.navigate('insight'); await sleep(400);
      const panel = document.querySelector('.gr'); if (panel) panel.scrollIntoView({ block:'start' });
      return [document.querySelectorAll('.gr-alerts li').length, document.querySelectorAll('.gr-dot').length, document.querySelectorAll('.gr-res tr').length - 1];
    } catch (e) { QZ.project = real; return ['err', e.message]; }
  })()`);
  await sleep(300); await js(`(() => { const p = document.querySelector('.gr'); if (p) p.scrollIntoView({ block:'start' }); })()`); await sleep(300);
  await shot('27-growth');
  const gro2 = await js(`(async () => {
    const t = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms));
    try { localStorage.setItem('qianzhang:panel', '1'); QZ.navigate('write', false, [t.chapters()[5].id]); await sleep(400);
      if (!document.getElementById('check-panel')) { document.querySelector('[data-act="write.panel"]').click(); await sleep(300); }
      return [document.querySelectorAll('.gr-lv').length, document.querySelectorAll('.gr-alert').length, t.id];
    } catch (e) { return ['err', e.message]; }
  })()`);
  await js(`(async () => { QZ.project = window.__realP || QZ.project; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  const grBack = await js('QZ.project.id');
  if (!gro || gro[0] < 4 || gro[1] !== 7 || gro[2] !== 2 || !gro2 || gro2[0] < 2 || gro2[1] < 1 || grBack === 'smoke-gro') errors.push('成长提醒异常：' + JSON.stringify([gro, gro2, grBack]));
  check('战力/资源成长（临时书）', gro && gro2 && ('提醒 ' + gro[0] + ' 条，成长点 ' + gro[1] + ' 个，资源 ' + gro[2] + ' 项，体检显示境界 ' + gro2[0] + ' 人'));
  // 设定规则：临时书（只在内存里）
  const rl = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms));
    window.__realP = real;
    try {
      const t = new QZStore({ project_id:'smoke-rl', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-rl');
      const c = t.addChapter('第一章', '少年翻开残卷，封面写着长生诀三个字。师弟在门外喊他。'); t.addChapter('第二章', '长生诀。');
      t.setRules('长生诀 第2章前：这时还没人知道它的名字\\n师兄/师弟：林舟只叫沈砚「沈兄」');
      QZ.project = t; localStorage.setItem('qianzhang:panel', '1'); QZ.navigate('write', false, [c.id]); await sleep(400);
      if (!document.getElementById('check-panel')) { document.querySelector('[data-act="write.panel"]').click(); await sleep(300); }
      const hits = [...document.querySelectorAll('#check-panel .hit.danger')].filter(b => /长生诀|师弟/.test(b.textContent)).length;
      const pub = QZCraft.publishCheck(t, t.chapters(), 'plain').filter(x => /设定规则/.test(x.text)).length;
      QZPages.write.actions.rules(QZ); await sleep(300);
      return [hits, pub, (document.getElementById('rl-n') || {}).textContent || ''];
    } catch (e) { QZ.project = real; return ['err', e.message]; }
  })()`);
  await shot('28-rules');
  await js(`(async () => { document.querySelectorAll('.modal-wrap [data-v="__x"]').forEach(b => b.click()); QZ.project = window.__realP || QZ.project; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 300)); })()`);
  const rlBack = await js('QZ.project.id');
  if (!rl || rl[0] !== 2 || rl[1] !== 2 || !/2 条/.test(rl[2]) || rlBack === 'smoke-rl') errors.push('设定规则异常：' + JSON.stringify([rl, rlBack]));
  check('设定规则（临时书）', rl && ('体检命中 ' + rl[0] + ' 处，发布自查 ' + rl[1] + ' 条，' + rl[2]));
  // 读者数据：临时书里粘贴一张表导入
  const rd = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = real;
    try {
      const t = new QZStore({ project_id:'smoke-rd', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-rd');
      const rows = ['章节\\t标题\\t阅读\\t均订\\t本章说']; let v = 12000;
      for (let i = 1; i <= 40; i++) { t.addChapter('第' + i + '章', '他拔剑。“走！”竟然突破了。'.repeat(i === 18 ? 5 : 80)); v = Math.round(v * (i === 18 ? 0.55 : 0.97)); rows.push(i + '\\t第' + i + '章\\t' + v + '\\t' + Math.round(v / 12) + '\\t' + (i % 7)); }
      QZ.project = t; QZ.navigate('insight'); await sleep(400);
      document.getElementById('rd-in').value = rows.join('\\n'); document.querySelector('[data-act="insight.readerImport"]').click(); await sleep(400);
      document.querySelector('.rd').scrollIntoView({ block:'start' });
      return [document.querySelectorAll('.rd-bar').length, document.querySelectorAll('.rd-drops li').length, (document.querySelector('.rd-drops li b') || {}).textContent, t.data.reader.cols.join('/')];
    } catch (e) { QZ.project = real; return ['err', e.message]; }
  })()`);
  await sleep(300); await js(`document.querySelector('.rd') && document.querySelector('.rd').scrollIntoView({ block:'start' })`); await sleep(200);
  await shot('29-reader');
  await js(`(async () => { QZ.project = window.__realP || QZ.project; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 300)); })()`);
  const rdBack = await js('QZ.project.id');
  if (!rd || rd[0] !== 40 || rd[1] < 1 || !/18/.test(rd[2]) || rdBack === 'smoke-rd') errors.push('读者数据异常：' + JSON.stringify([rd, rdBack]));
  check('读者数据看板（临时书）', rd && (rd[0] + ' 章，' + rd[3] + '，最大掉读「' + rd[2] + '」'));
  // 新手引导：临时空书 + 临时的引导记录，查完都换回去
  const ob = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = real;
    window.__obKey = localStorage.getItem('qianzhang:onboard'); window.__obPanel = localStorage.getItem('qianzhang:write-panel');
    try {
      localStorage.removeItem('qianzhang:onboard');
      const t = new QZStore({ project_id:'smoke-ob', meta:{ title:'我的作品' }, nodes:[], relations:[] }, 'smoke-ob'); QZ.project = t;
      const should = QZPages.onboard.shouldShow(QZ);
      QZ.onboardStep = 'welcome'; QZ.navigate('onboard', true); await sleep(300);
      const choices = document.querySelectorAll('.ob-choice').length;
      return [should, choices];
    } catch (e) { QZ.project = real; return ['err', e.message]; }
  })()`);
  await shot('30-welcome');
  const ob2 = await js(`(async () => {
    const t = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
      document.querySelector('[data-act="onboard.newbie"]').click(); await sleep(300);
      document.querySelector('[data-q="genre"] [data-v="玄幻"]').click(); document.querySelector('[data-q="goal"] [data-v="1000"]').click();
      document.querySelector('[data-act="onboard.start"]:not([data-skip])').click(); await sleep(500);
      const nav = document.querySelectorAll('#nav .nav-item').length, bar = !!document.querySelector('.obw-bar'), outline = /开篇提示/.test(t.chapters()[0].outline || ''), title = t.title, goal = t.data.writing.goal;
      const ta = document.getElementById('ch-text'); ta.value = '少年睁开眼，'.repeat(45); ta.dispatchEvent(new Event('input', { bubbles:true })); await sleep(300);
      const nudge = !!document.querySelector('.ob-nudge'), live = /（225 \\/ 1,000/.test((document.querySelector('.obw-bar') || {}).textContent || '');
      if (!live) return ['err', '进度条没跟着字数更新：' + (document.querySelector('.obw-bar') || {}).textContent];
      return [nav, bar, outline, title, goal, nudge, document.getElementById('ch-text').placeholder.slice(0, 6)];
    } catch (e) { return ['err', e.message]; }
  })()`);
  await shot('31-minimal');
  const ob3 = await js(`(async () => {
    const t = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms));
    try { document.querySelectorAll('.ob-nudge').forEach(x => x.remove()); document.body.dataset.celeMs = '150';
      const ta = document.getElementById('ch-text'); ta.value = '少年睁开眼，看见满天的星。'.repeat(100); ta.dispatchEvent(new Event('input', { bubbles:true })); await sleep(400);
      return [!!document.querySelector('.ob-cele-bar') && !document.querySelector('.modal-wrap'), t.id, localStorage.getItem('qianzhang:onboard'), QZStore.countWords(t.chapters()[0].text), t.data.writing.goal, document.querySelectorAll('.modal-wrap').length];
    } catch (e) { return ['err', e.message]; }
  })()`);
  await shot('32-celebrate');
  await js(`(async () => { document.querySelectorAll('.modal-wrap [data-v="__x"]').forEach(b => b.click()); document.querySelectorAll('.ob-nudge').forEach(x => x.remove());
    const k = window.__obKey, pn = window.__obPanel; if (k === null) localStorage.removeItem('qianzhang:onboard'); else localStorage.setItem('qianzhang:onboard', k);
    if (pn === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', pn);
    QZ.project = window.__realP || QZ.project; delete window.__realP; QZ.onboardStep = ''; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 300)); })()`);
  const obBack = await js('[QZ.project.id, document.querySelectorAll("#nav .nav-item").length]');
  if (!ob || ob[0] !== true || ob[1] !== 2 || !ob2 || ob2[0] !== 2 || !ob2[1] || !ob2[2] || ob2[3] !== '我的玄幻小说' || ob2[4] !== 1000 || !ob2[5] || !ob3 || !ob3[0] || obBack[0] === 'smoke-ob' || obBack[1] !== 5)
    errors.push('新手引导异常：' + JSON.stringify([ob, ob2, ob3, obBack]));
  check('新手引导（临时书）', ob2 && ('极简侧栏 ' + ob2[0] + ' 项，200 字提示 ' + (ob2[5] ? '出现' : '无') + '，第一章完成庆祝 ' + (ob3 && ob3[0] ? '出现' : '无') + '，换回后侧栏 ' + obBack[1] + ' 项'));
  // Ctrl+K 命令面板：只跳转不改书；最近使用记录查完换回
  const pal = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), rk = localStorage.getItem('qianzhang:palette-recent');
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key:'k', ctrlKey:true, bubbles:true })); await sleep(150);
      const q = document.getElementById('pal-q'); if (!q) return ['err', '没打开'];
      const first = document.querySelectorAll('.pal-item').length;
      const cs = QZ.project.chapters(), c = cs[Math.min(2, cs.length - 1)]; q.value = c.title || ('第 ' + cs.length + ' 章'); q.dispatchEvent(new Event('input')); await sleep(80);
      return [first, document.querySelector('.pal-item.on b').textContent, c.id, rk];
    } catch (e) { return ['err', e.message]; }
  })()`);
  await shot('33-palette');
  const pal2 = await js(`(async () => { const q = document.getElementById('pal-q'); if (!q) return ['err'];
    q.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })); await new Promise(r => setTimeout(r, 300));
    const r = [!!document.querySelector('.pal-wrap'), location.hash];
    const rk = ${JSON.stringify(pal && pal[3] !== undefined ? pal[3] : null)}; if (rk === null) localStorage.removeItem('qianzhang:palette-recent'); else localStorage.setItem('qianzhang:palette-recent', rk);
    QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); return r; })()`);
  if (!pal || pal[0] === 'err' || pal[0] < 5 || !/第 \d+ 章/.test(pal[1]) || !pal2 || pal2[0] !== false || !pal2[1].includes(encodeURIComponent(pal[2])))
    errors.push('命令面板异常：' + JSON.stringify([pal, pal2]));
  check('Ctrl+K 命令面板', pal && ('默认 ' + pal[0] + ' 项，搜章节名命中「' + pal[1] + '」，回车跳转'));
  // 断点续写：临时书 + 临时的光标记录，查完换回
  const rs = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms));
    window.__realP = real; const t = new QZStore({ project_id:'smoke-rs', meta:{ title:'续写测试' }, nodes:[], relations:[] }, 'smoke-rs'); QZ.project = t;
    try {
      const c = t.addChapter('第一章'); t.updateChapter(c.id, { text:'他推开门。屋里很黑，只有一盏灯还亮着。他走过去，' + '风吹过檐角，铃声叮当。'.repeat(60) });
      const pos = t.chapter(c.id).text.indexOf('他走过去') + 4;
      localStorage.setItem('qianzhang:caret:smoke-rs', JSON.stringify({ id:c.id, pos, at:Date.now() - 2 * 3600e3 }));
      QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(200);
      const line = (document.querySelector('.resume-line') || {}).textContent || '';
      QZ.navigate('write', true, [c.id]); await sleep(300);
      const ta = document.getElementById('ch-text'), chip = (document.querySelector('.resume-chip') || {}).textContent || '';
      return [line, ta.selectionStart === pos, chip, document.getElementById('main').scrollTop];
    } catch (e) { return ['err', e.message]; }
  })()`);
  await shot('34-resume');
  await js(`(async () => { localStorage.removeItem('qianzhang:caret:smoke-rs'); document.querySelectorAll('.resume-chip').forEach(x => x.remove()); QZ.project = window.__realP || QZ.project; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  const rsBack = await js('QZ.project.id');
  if (!rs || rs[0] === 'err' || !/停在「他走过去」/.test(rs[0]) || rs[1] !== true || !/2 小时前/.test(rs[2]) || rsBack === 'smoke-rs') errors.push('断点续写异常：' + JSON.stringify([rs, rsBack]));
  check('断点续写（临时书）', rs && ('首页「' + rs[0] + '」，光标回到原位 ' + rs[1] + '，提示「' + rs[2] + '」'));
  // 发布前 30 秒自查：临时书，标为已发布只发生在临时书上
  const qc = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = real;
    const t = new QZStore({ project_id:'smoke-pp', meta:{ title:'自查测试' }, nodes:[], relations:[] }, 'smoke-pp'); QZ.project = t;
    try {
      const c = t.addChapter('雨夜'); t.updateChapter(c.id, { text:'雨下了一整夜。\\n'.repeat(3) + '他推开门，门后竟然站着一个人？' });
      QZ.navigate('write', true, [c.id]); await sleep(250);
      document.dispatchEvent(new KeyboardEvent('keydown', { key:'p', altKey:true, bubbles:true })); await sleep(350);
      const n = document.querySelectorAll('.pp-list li').length, head = (document.querySelector('.pp-head b') || {}).textContent, text = (document.getElementById('pp-text') || {}).value || '';
      return [n, head, /竟然/.test(text), c.id];
    } catch (e) { return ['err', e.message]; }
  })()`);
  await shot('35-prepub');
  const qc2 = await js(`(async () => { const b = [...document.querySelectorAll('.modal-foot .btn')].find(x => /标为已发布/.test(x.textContent)); if (b) b.click(); await new Promise(r => setTimeout(r, 400));
    const st = QZ.project.chapter(${JSON.stringify('')} || QZ.project.chapters()[0].id).status; document.querySelectorAll('.modal-wrap').forEach(x => x.remove());
    QZ.project = window.__realP || QZ.project; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); return [st, QZ.project.id]; })()`);
  if (!qc || qc[0] === 'err' || qc[0] < 7 || !qc[2] || !qc2 || qc2[0] !== 'published' || qc2[1] === 'smoke-pp') errors.push('发布前自查异常：' + JSON.stringify([qc, qc2]));
  check('发布前 30 秒自查（临时书）', qc && (qc[0] + ' 项：' + qc[1] + '，复制并标为已发布 ' + (qc2 && qc2[0])));
  // 边写边建：临时书里打字，出现新名字就提示，加入设定库只发生在临时书上
  const nn = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = real;
    const t = new QZStore({ project_id:'smoke-nn', meta:{ title:'边写边建' }, nodes:[], relations:[] }, 'smoke-nn'); QZ.project = t;
    try {
      const c = t.addChapter('初遇'); QZ.navigate('write', true, [c.id]); await sleep(250);
      const ta = document.getElementById('ch-text'); ta.value = '林小凡冷笑道：“你敢？”老者摇头。林小凡道：“那就试试。”两人来到青云宗。'; ta.dispatchEvent(new Event('input', { bubbles:true })); await sleep(900);
      const card = document.querySelector('.nn-card'); return [card ? card.dataset.name : '', c.id];
    } catch (e) { return ['err', e.message]; }
  })()`);
  await shot('36-newname');
  const nn2 = await js(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const b = document.querySelector('[data-act="write.nnAdd"]'); if (b) b.click(); await sleep(150);
    const added = QZ.project.data.nodes.map(n => n.name + '/' + n.type); const ta = document.getElementById('ch-text'); ta.dispatchEvent(new Event('input', { bubbles:true })); await sleep(900);
    const next = (document.querySelector('.nn-card') || {}).dataset; const ig = document.querySelector('[data-act="write.nnIgnore"]'); if (ig) ig.click(); await sleep(100);
    const ign = localStorage.getItem('qianzhang:nn-ignore:smoke-nn'); localStorage.removeItem('qianzhang:nn-ignore:smoke-nn'); document.querySelectorAll('.nn-card').forEach(x => x.remove());
    QZ.project = window.__realP || QZ.project; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(200);
    return [added, next && next.name, ign, QZ.project.id, !!document.querySelector('.nn-card')]; })()`);
  if (!nn || nn[0] !== '林小凡' || !nn2 || nn2[0].join() !== '林小凡/PERSON' || nn2[1] !== '青云宗' || !/青云宗/.test(nn2[2] || '') || nn2[3] === 'smoke-nn' || nn2[4]) errors.push('边写边建异常：' + JSON.stringify([nn, nn2]));
  check('边写边建（临时书）', nn && ('提示「' + nn[0] + '」→ 已加入，接着提示「' + (nn2 && nn2[1]) + '」→ 不是名字'));
  // 写作时间：临时书塞一份时间记录，看分析页面板
  const tm = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = real;
    const t = new QZStore({ project_id:'smoke-tm', meta:{ title:'时间测试' }, nodes:[], relations:[] }, 'smoke-tm'); QZ.project = t;
    try {
      const c = t.addChapter('一'); t.updateChapter(c.id, { text:'风吹过山岗。'.repeat(400), silent:true });
      const W = t.data.writing; W.daily = {}; W.time = {};
      for (let i = 0; i < 20; i++) { const k = QZCraft.addDays(QZCraft.dayKey(), -i); if (i % 3 === 2) continue; const w = 1500 + (i * 137) % 1800; W.daily[k] = w; const h = []; h[21] = Math.round(w * .6); h[22] = Math.round(w * .3); h[14] = w - h[21] - h[22]; W.time[k] = { m:Math.round(w / 15), h }; }
      QZ.navigate('insight', true); await sleep(400);
      const panel = document.querySelector('.panel.tm'), mn = document.getElementById('main'); mn.style.scrollBehavior = 'auto'; if (panel) mn.scrollTop = panel.offsetTop - 20; setTimeout(() => mn.style.scrollBehavior = '', 500);
      await sleep(100);
      return [document.querySelectorAll('.tm-chart.hours .best').length, (document.querySelector('.tm-tips') || {}).textContent || '', document.querySelectorAll('.tm-d').length];
    } catch (e) { return ['err', e.message]; }
  })()`);
  await shot('37-time');
  await js(`(async () => { QZ.project = window.__realP || QZ.project; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!tm || tm[0] !== 2 || !/21:00/.test(tm[1]) || tm[2] !== 30) errors.push('写作时间异常：' + JSON.stringify(tm));
  check('写作时间与效率（临时书）', tm && ('最顺手时段高亮 ' + tm[0] + ' 格，建议「' + String(tm[1]).slice(0, 24) + '…」'));
  // AI 陪写：临时书，停笔延迟调短；未连模型时只用规则、不发送
  const cpx = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = real; window.__cpKey = localStorage.getItem('qianzhang:companion');
    const t = new QZStore({ project_id:'smoke-cp', meta:{ title:'陪写测试' }, nodes:[], relations:[] }, 'smoke-cp'); QZ.project = t; document.body.dataset.cpDelay = '250';
    try {
      const c = t.addChapter('平路'); QZ.navigate('write', true, [c.id]); await sleep(250);
      if (!document.querySelector('[data-act="write.companion"].on')) document.querySelector('[data-act="write.companion"]').click(); await sleep(100);
      const ta = document.getElementById('ch-text'); ta.value = Array(30).fill('他走在路上，天气很好，路边有树，树上有鸟。').join('\\n'); ta.dispatchEvent(new Event('input', { bubbles:true })); await sleep(700);
      const note = (document.querySelector('.cp-note.new') || {}).textContent || '', ready = QZAI.ready(QZAI.loadSettings());
      return [note, ready, !document.getElementById('cp-feed').hidden];
    } catch (e) { return ['err', e.message]; }
  })()`);
  await shot('38-companion');
  await js(`(async () => { const k = window.__cpKey; if (document.querySelector('[data-act="write.companion"].on') && k !== 'on') document.querySelector('[data-act="write.companion"]').click();
    if (k === null) localStorage.removeItem('qianzhang:companion'); else localStorage.setItem('qianzhang:companion', k); delete document.body.dataset.cpDelay;
    QZ.project = window.__realP || QZ.project; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!cpx || cpx[0] === 'err' || !cpx[2] || (!cpx[1] && !/平稳/.test(cpx[0]))) errors.push('AI 陪写异常：' + JSON.stringify(cpx));
  check('AI 陪写（临时书）', cpx && ('停笔后边注「' + String(cpx[0]).slice(0, 26) + '…」' + (cpx[1] ? '（已连模型）' : '（未连模型，规则版）')));
  // 陪写隐私：已连模型时第一次打开要先确认；不同意就不开；开着时顶栏常驻「陪写开 · 关闭」，一点就关。模型用假的，不联网、不存密钥
  const cpg = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), real = QZ.project, ready = QZAI.ready, complete = QZAI.complete, ok0 = localStorage.getItem('qianzhang:companion-notice'), r = {};
    const t = new QZStore({ project_id:'smoke-cp2', meta:{ title:'陪写确认' }, nodes:[], relations:[] }, 'smoke-cp2'); QZ.project = t;
    QZAI.ready = () => true; QZAI.complete = () => Promise.resolve({ text:'假模型的边注' }); localStorage.removeItem('qianzhang:companion-notice');
    try {
      const c = t.addChapter('确认'); QZ.navigate('write', true, [c.id]); await sleep(250);
      const badge = () => document.getElementById('cp-badge'), on = () => !!badge() && !badge().hidden;
      r.startOff = !on() && localStorage.getItem('qianzhang:companion') === null;
      document.querySelector('[data-act="write.companion"]').click(); await sleep(150);
      r.asked = !!document.querySelector('.modal-wrap .modal') && /800/.test(document.querySelector('.modal-wrap').textContent);
      [...document.querySelectorAll('.modal-wrap button')].find(b => b.textContent.trim() === '不打开').click(); await sleep(250);
      r.declinedOff = !on() && localStorage.getItem('qianzhang:companion-notice') === null;
      document.querySelector('[data-act="write.companion"]').click(); await sleep(150);
      [...document.querySelectorAll('.modal-wrap button')].find(b => b.textContent.trim() === '知道了，打开').click(); await sleep(250);
      r.onBadge = on() && badge().classList.contains('sending') && localStorage.getItem('qianzhang:companion-notice') === '1';
      document.querySelector('[data-act="write.companion"]').click(); await sleep(100); document.querySelector('[data-act="write.companion"]').click(); await sleep(150);
      r.noReask = !document.querySelector('.modal-wrap:not(.out)') && on();
      badge().click(); await sleep(150);
      r.offByBadge = !on() && !document.querySelector('[data-act="write.companion"].on');
      r.notPersisted = localStorage.getItem('qianzhang:companion') === null;
    } catch (e) { r.err = e.message; }
    QZAI.ready = ready; QZAI.complete = complete; if (ok0 === null) localStorage.removeItem('qianzhang:companion-notice'); else localStorage.setItem('qianzhang:companion-notice', ok0);
    QZ.project = real; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(200);
    return r; })()`);
  if (!cpg || cpg.err || !(cpg.startOff && cpg.asked && cpg.declinedOff && cpg.onBadge && cpg.noReask && cpg.offByBadge && cpg.notPersisted)) errors.push('陪写确认/指示异常：' + JSON.stringify(cpg));
  check('陪写默认关、首次确认、常驻指示一键关', JSON.stringify(cpg));
  // 空书逐页渲染、按钮都有可读名字、百万字书切页耗时
  const au = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms)), out = { empty:[], unnamed:[], slow:[] };
    window.__realP = real;
    try {
      const pages = ['home','write','plan','library','notes','insight','publish','chat','settings'];
      QZ.project = new QZStore({ project_id:'smoke-empty', meta:{ title:'空白测试书' }, nodes:[], relations:[] }, 'smoke-empty');
      for (const k of pages) { QZ.navigate(k, true); await sleep(120); const m = document.querySelector('main') || document.body;
        if (m.innerText.trim().length < 6) out.empty.push(k);
        m.querySelectorAll('button,a.btn,.icon-btn').forEach(b => { if (!b.offsetParent) return; const n = (b.innerText || '').trim() || b.title || b.getAttribute('aria-label'); if (!n) out.unnamed.push(k + ':' + (b.dataset.act || b.className)); }); }
      const big = new QZStore({ project_id:'smoke-big', meta:{ title:'百万字测试书' }, nodes:[{ id:'p', type:'PERSON', name:'林舟' }], relations:[] }, 'smoke-big');
      const para = '林舟推开门，雨声一下子涌了进来。他没有回头，只是把伞收好，靠在墙边。\\\\n'.repeat(60);
      for (let i = 0; i < 560; i++) big.addChapter('第' + (i + 1) + '章', para);
      QZ.project = big;
      for (const k of ['home','write','insight','plan']) { const t = performance.now(); QZ.navigate(k, true); await sleep(30); const ms = Math.round(performance.now() - t); if (ms > 1500) out.slow.push(k + ' ' + ms + 'ms'); }
      out.words = big.stats().words;
    } finally { QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(200); }
    return out;
  })()`);
  if (!au || au.empty.length || au.unnamed.length || au.slow.length) errors.push('页面审查：' + JSON.stringify(au));
  check('页面审查（空书 9 页、按钮命名、百万字切页）', au && ('百万字书 ' + au.words + ' 字'));
  // 写作页默认干净、检查合一、AI 合一、分析页次要面板折叠、发布时自动自查
  const sp = await js(`(async () => {
    const real = QZ.project, sleep = ms => new Promise(r => setTimeout(r, ms)), pn = localStorage.getItem('qianzhang:write-panel'), im = localStorage.getItem('qianzhang:insight-more'); window.__realP = real;
    try {
      localStorage.removeItem('qianzhang:write-panel'); localStorage.removeItem('qianzhang:insight-more');
      const t = new QZStore({ project_id:'smoke-sp', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-sp'); const c = t.addChapter('第1章', '短。'); QZ.project = t;
      QZ.navigate('write', true, [c.id]); await sleep(300);
      const bar = document.querySelector('.editor-bar'), vis = [...bar.querySelectorAll(':scope > button, :scope > .btn')].map(b => b.innerText.trim() || b.title);
      const o = { panel:!!document.getElementById('check-panel'), barCp:!!bar.querySelector(':scope > [data-act="write.companion"]'), n:vis.length, hasCheck:vis.includes('检查'), hasAI:vis.includes('AI') };
      document.querySelector('[data-act="write.panel"]').click(); await sleep(300);
      o.sum = (document.querySelector('#check-panel .check-sum b') || {}).textContent || '';
      document.querySelector('[data-act="write.publish"]').click(); await sleep(300);
      o.modal = (document.querySelector('.modal .pp-head b') || {}).textContent || ''; o.stillDraft = t.chapter(c.id).status !== 'published';
      const f = [...document.querySelectorAll('.modal button')].find(b => b.textContent === '只标为已发布'); if (f) f.click(); await sleep(300);
      o.pub = t.chapter(c.id).status === 'published';
      QZ.navigate('insight', true); await sleep(300); const ma = document.getElementById('more-an'); o.more = ma ? (ma.open ? 'open' : 'closed') : 'none';
      return o;
    } finally { if (pn === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', pn); localStorage.setItem('qianzhang:insight-more', im || 'on');
      document.querySelectorAll('.modal-back,.modal-wrap').forEach(x => x.remove()); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(200); }
  })()`);
  if (!sp || sp.panel || sp.barCp || !sp.hasCheck || !sp.hasAI || !sp.sum || !sp.modal || !sp.stillDraft || !sp.pub || sp.more !== 'closed') errors.push('精简异常：' + JSON.stringify(sp));
  check('精简（临时书）', sp && ('工具栏 ' + sp.n + ' 个按钮，检查摘要「' + sp.sum + '」，发布前自查「' + sp.modal + '」'));
  // 下一章自动预填
  const pf = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project;
    const t = new QZStore({ project_id:'smoke-pf', meta:{ title:'临时测试书' }, nodes:[{ id:'h', type:'PERSON', name:'林舟' }], relations:[] }, 'smoke-pf');
    const c = t.addChapter('雨夜'); t.updateChapter(c.id, { text:'林舟推开门。林舟看见桌上的玉佩，忽然愣住了。', outline:'林舟发现玉佩' }); t.addForeshadow({ title:'玉佩来历', plantedIn:c.id, dueChapter:2 }); QZ.project = t;
    QZ.navigate('write', true, [c.id]); await sleep(300); document.querySelector('.side-head [data-act="write.add"]').click(); await sleep(400);
    const o = document.getElementById('ch-outline'); return [t.chapters().length, o ? o.value : '', (document.querySelector('.toast') || {}).textContent || ''];
  })()`);
  await shot('39-prefill');
  await js(`(async () => { QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!pf || pf[0] !== 2 || !/承接上章结尾/.test(pf[1]) || !/玉佩来历/.test(pf[1])) errors.push('预填异常：' + JSON.stringify(pf));
  check('下一章预填（临时书）', pf && (pf[1].split('\n').length + ' 条细纲，提示「' + pf[2] + '」'));
  // 活的设定回声
  const ec = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project;
    const t = new QZStore({ project_id:'smoke-ec', meta:{ title:'临时测试书' }, nodes:[{ id:'d', type:'ITEM', name:'九转金丹', aliases:'金丹' }], relations:[] }, 'smoke-ec');
    const a = t.addChapter('一', '林舟得到九转金丹。'); t.addChapter('二', '无关。'); const c = t.addChapter('三', ''); t.addProgress && t.addProgress('d', { chapterId:a.id, text:'被林舟服下一半' }); QZ.project = t;
    QZ.navigate('write', true, [c.id]); await sleep(300); const x = document.getElementById('ch-text'); x.focus(); x.value = '他摸出那枚金丹'; x.selectionStart = x.selectionEnd = x.value.length; x.dispatchEvent(new Event('input', { bubbles:true })); await sleep(500);
    const e = document.querySelector('.echo.show'); return e ? [e.textContent, (e.querySelector('a') || {}).getAttribute && e.querySelector('a').getAttribute('href')] : null;
  })()`);
  await shot('40-echo');
  await js(`(async () => { QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!ec || !/九转金丹/.test(ec[0]) || !/第 1 章/.test(ec[0])) errors.push('设定回声异常：' + JSON.stringify(ec));
  check('活的设定回声（临时书）', ec && ec[0]);
  // 断更保险
  const ins = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; const C = QZCraft, d0 = C.dayKey();
    const t = new QZStore({ project_id:'smoke-ins', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-ins');
    const a = t.addChapter('雨夜', '林舟推开门，看见桌上的玉佩。'); t.data.writing.goal = 100; t.data.writing.daily = {}; [1, 2, 3].forEach(i => t.data.writing.daily[C.addDays(d0, -i)] = 500); QZ.project = t;
    QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(400);
    const ts = [...document.querySelectorAll('.toast')], toast = ts.length ? ts[ts.length - 1].textContent : '', n = t.history(a.id).filter(h => h.note === '保险稿').length, ok = t.data.writing.insured === d0;
    t.data.writing.daily = {}; [2, 3, 4].forEach(i => t.data.writing.daily[C.addDays(d0, -i)] = 500); QZ.navigate('write', true); await sleep(100); QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(400);
    const card = document.querySelector('.ins-card');
    return [card ? card.innerText : '', n, ok, toast];
  })()`);
  await shot('41-insurance');
  await js(`(async () => { QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!ins || !/昨天没写/.test(ins[0]) || !/玉佩/.test(ins[0]) || ins[1] !== 1 || !ins[2]) errors.push('断更保险异常：' + JSON.stringify(ins));
  check('断更保险（临时书）', ins && ('保险稿 ' + ins[1] + ' 份，「' + ins[3] + '」'));
  // 千章仪式感
  const rt = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__skin = localStorage.getItem('qianzhang:skin');
    const t = new QZStore({ project_id:'smoke-rt', meta:{ title:'临时测试书' }, nodes:[{ id:'h', type:'PERSON', name:'林舟' }], relations:[] }, 'smoke-rt');
    for (let i = 0; i < 99; i++) t.addChapter('', '林舟走了一步。'); localStorage.removeItem('qianzhang:rite:smoke-rt'); QZ.project = t;
    QZ.navigate('write', true, [t.chapters()[98].id]); await sleep(300); document.querySelector('.side-head [data-act="write.add"]').click(); await sleep(800); const noPop = !document.querySelector('.modal .rite-card'); QZ.navigate('home', true); await sleep(300); const hb = document.querySelector('[data-act="home.rite"]'); if (hb) hb.click(); await sleep(400); if (!noPop) return ['在写作中弹了', 0];
    const card = document.querySelector('.modal .rite-card'); return [card ? card.innerText.replace(/\\s+/g, ' ') : '', t.chapters().length];
  })()`);
  await shot('42-ritual');
  const rt2 = await js(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const b = [...document.querySelectorAll('.modal button')].find(x => /换上/.test(x.textContent)); if (b) b.click(); await sleep(300);
    const sk = document.documentElement.dataset.skin; QZ.navigate('settings', true); await sleep(300); const on = (document.querySelector('.skins .on') || {}).textContent;
    const k = window.__skin; if (k) localStorage.setItem('qianzhang:skin', k); else { localStorage.removeItem('qianzhang:skin'); delete document.documentElement.dataset.skin; }
    QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(200); return [sk, on]; })()`);
  if (!rt || !/100/.test(rt[0]) || !/林舟/.test(rt[0]) || !rt2 || rt2[0] !== 'ink' || rt2[1] !== '墨痕光标') errors.push('仪式感异常：' + JSON.stringify([rt, rt2]));
  check('千章仪式感（临时书）', rt && ('第 ' + rt[1] + ' 章出卡，皮肤 ' + (rt2 && rt2[0])));
  // 读者预期雷达
  const ex = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-ex', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-ex'), pad = '他走在街上，风很大。'.repeat(30);
    const a = t.addChapter('一', '他突破了！众人震惊。' + pad); t.updateChapter(a.id, { expect:'爽' }); const b = t.addChapter('二', pad + pad + '他突破了！'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [b.id]); await sleep(300);
    document.querySelector('[data-act="write.expect"][data-m="爽"]').click(); await sleep(200);
    const sec = document.querySelector('#check-panel .radar'); if (sec) sec.scrollIntoView({ block:'start' });
    return [t.chapter(b.id).expect, sec ? sec.innerText.replace(/\\s+/g, ' ') : ''];
  })()`);
  await shot('43-radar');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!ex || ex[0] !== '爽' || !/晚了/.test(ex[1])) errors.push('预期雷达异常：' + JSON.stringify(ex));
  check('读者预期雷达（临时书）', ex && ex[1]);
  // 停笔 3 分钟才问一句要不要陪写（测试里把 3 分钟缩成 300 毫秒）
  const sk = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__cpk = localStorage.getItem('qianzhang:companion'); localStorage.setItem('qianzhang:companion', 'off');
    const t = new QZStore({ project_id:'smoke-sk', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-sk'); const c = t.addChapter('一'); QZ.project = t;
    QZ.navigate('write', true, [c.id]); await sleep(250); if (document.querySelector('[data-act="write.companion"].on')) document.querySelector('[data-act="write.companion"]').click();
    document.body.dataset.stuckMs = '300'; const x = document.getElementById('ch-text'); x.value = '他站在门口，迟迟没有进去。'.repeat(8); x.dispatchEvent(new Event('input', { bubbles:true }));
    const early = !!document.getElementById('stuck'); await sleep(500); const shown = !!document.getElementById('stuck');
    return [early, shown, c.id];
  })()`);
  await shot('44-stuck');
  const sk2 = await js(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-act="write.summon"]').click(); await sleep(200);
    const f = document.getElementById('cp-feed'), o = [!f.hidden, f.querySelectorAll('.cp-note:not(.muted)').length, localStorage.getItem('qianzhang:companion')];
    if (document.querySelector('[data-act="write.companion"].on')) document.querySelector('[data-act="write.companion"]').click();
    const k = window.__cpk; if (k === null) localStorage.removeItem('qianzhang:companion'); else localStorage.setItem('qianzhang:companion', k); delete document.body.dataset.stuckMs;
    QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(200); return o; })()`);
  if (!sk || sk[0] || !sk[1] || !sk2 || !sk2[0] || sk2[1] < 1 || sk2[2] !== 'off') errors.push('卡文陪写异常：' + JSON.stringify([sk, sk2]));
  check('卡文 3 分钟叫陪写（临时书）', sk2 && ('出现提示，叫来后 ' + sk2[1] + ' 条边注，未改默认开关'));
  // 边写边建只在一段写完时出现，是正文下方的一条细浮条
  const ns = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project;
    const t = new QZStore({ project_id:'smoke-ns', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-ns'); const c = t.addChapter('一'); QZ.project = t;
    QZ.navigate('write', true, [c.id]); await sleep(250); const x = document.getElementById('ch-text');
    x.value = '林小凡冷笑道：“你敢？”林小凡道：“那就试试。”两人来到青云宗，林小凡看着'; x.selectionStart = x.selectionEnd = x.value.length; x.dispatchEvent(new Event('input', { bubbles:true })); await sleep(800);
    const mid = !!document.querySelector('.nn-card');
    x.value += '远方。'; x.selectionStart = x.selectionEnd = x.value.length; x.dispatchEvent(new Event('input', { bubbles:true })); await sleep(800);
    const el = document.querySelector('.nn-strip'); return [mid, el ? el.innerText.replace(/\\s+/g, ' ') : '', el ? getComputedStyle(el).position : '', !!(el && el.closest('.check-panel'))];
  })()`);
  await shot('45-nn-strip');
  await js(`(async () => { document.querySelectorAll('.nn-card').forEach(x => x.remove()); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!ns || ns[0] || !/林小凡/.test(ns[1]) || ns[2] !== 'static' || !ns[3]) errors.push('边写边建浮条异常：' + JSON.stringify(ns));
  check('边写边建浮条（临时书）', ns && ns[1]);
  // 文风锚定
  const sd = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-sd', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-sd'), good = '他推开门。雨落下来。“走吗？”她问。他没答，把伞递过去。'.repeat(20);
    t.addChapter('一', good); t.addChapter('二', good); const c = t.addChapter('三', '于是他非常非常愤怒，终于十分痛苦地意识到这一切都很不对，显然他不禁感到无比绝望和特别迷茫的那种很深的情绪，'.repeat(12) + '。'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const sec = document.querySelector('#check-panel .style'); if (sec) sec.scrollIntoView({ block:'start' }); const txt = sec ? sec.innerText.replace(/\\s+/g, ' ') : '';
    document.querySelector('[data-act="write.anchor"]').click(); await sleep(200);
    return [txt, (t.data.meta.styleAnchors || []).length];
  })()`);
  await shot('46-style');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!sd || !/程度词/.test(sd[0]) || sd[1] !== 1) errors.push('文风锚定异常：' + JSON.stringify(sd));
  check('文风锚定（临时书）', sd && sd[0].slice(0, 80));
  // 工具人预警
  const by = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project;
    const t = new QZStore({ project_id:'smoke-by', meta:{ title:'临时测试书' }, nodes:[{ id:'a', type:'PERSON', name:'林舟' }, { id:'b', type:'PERSON', name:'苏晚' }], relations:[] }, 'smoke-by');
    for (let i = 0; i < 6; i++) t.addChapter('第' + (i + 1) + '章', '林舟说：“走。”林舟转身出门。苏晚在旁边。大家看着苏晚和林舟。'.repeat(3)); QZ.project = t;
    QZ.navigate('insight', true); await sleep(400); const el = document.querySelector('.by-line'); if (el) el.scrollIntoView({ block:'center' });
    return el ? el.innerText.replace(/\\s+/g, ' ') : '';
  })()`);
  await shot('47-bystander');
  await js(`(async () => { QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!/苏晚/.test(by || '') || /林舟 被提到/.test(by || '')) errors.push('工具人预警异常：' + JSON.stringify(by));
  check('工具人预警（临时书）', by && by.slice(0, 70));
  // AI 腔自查
  const ai = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-ai', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-ai');
    const c = t.addChapter('一', '他推开门，雨落下来，她把伞递过去。'.repeat(20) + '他眼中闪过一丝寒意，嘴角勾起一抹弧度，不禁深吸一口气。她眼中闪过一丝慌乱。'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /AI 腔/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('button.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd)];
  })()`);
  await shot('48-aitone');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!ai || !/眼中闪过一丝/.test(ai[0]) || ai[1] !== '眼中闪过一丝') errors.push('AI 腔异常：' + JSON.stringify(ai));
  check('AI 腔自查（临时书）', ai && (ai[0].slice(0, 50) + '，点击定位「' + ai[1] + '」'));
  // 手机排版
  const kml = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-ml', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-ml');
    const c = t.addChapter('一', '他走进来。'.repeat(60) + '\\n林远道：“走吗？”苏晴说：“走。”林远问：“去哪？”苏晴道：“随便。”\\n短段。'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /手机排版/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('button.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('49-mobile');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kml || !/250 字.*同一段/.test(kml[0])) errors.push('手机排版异常：' + JSON.stringify(kml));
  check('手机排版（临时书）', kml && (kml[0].slice(0, 70) + ' ｜定位「' + kml[1] + '」'));
  // 标点与占位符
  const kpu = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-pu', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-pu');
    const c = t.addChapter('一', '他推开门,雨落下来。'.repeat(3) + '这里???回头再写。好！！！【待补：打斗】'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /标点与占位符/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('button.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('50-punct');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kpu || !/占位符.*半角.*连串/.test(kpu[0])) errors.push('标点与占位符异常：' + JSON.stringify(kpu));
  check('标点与占位符（临时书）', kpu && (kpu[0].slice(0, 70) + ' ｜定位「' + kpu[1] + '」'));
  // 开头三行
  const kop = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-op', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-op');
    const c = t.addChapter('一', '那天阳光很好。林小满今年十七岁。她住在城外。' + '他走了很久。'.repeat(15)); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /开头三行/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('button.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('51-opening');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kop || !/偏慢.*阳光/.test(kop[0])) errors.push('开头三行异常：' + JSON.stringify(kop));
  check('开头三行（临时书）', kop && (kop[0].slice(0, 70) + ' ｜定位「' + kop[1] + '」'));
  // 人称跳跃
  const kpv = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-pv', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-pv');
    const c = t.addChapter('一', '他推开门。\\n她看了他一眼。\\n“我不去。”她说。\\n他笑了。\\n她转身。\\n我心里一沉，他怎么来了。\\n他坐下。\\n她倒茶。'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /人称跳跃/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('button.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('52-pov');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kpv || !/引号外/.test(kpv[0])) errors.push('人称跳跃异常：' + JSON.stringify(kpv));
  check('人称跳跃（临时书）', kpv && (kpv[0].slice(0, 70) + ' ｜定位「' + kpv[1] + '」'));
  // 没问题的检查项折叠
  const fold = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-fold', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-fold');
    const c = t.addChapter('一', '“你还有三天可活。”医生说。为什么是我？' + '他推开门，雨落下来，她把伞递过去。'.repeat(3)); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const d = document.querySelector('#check-panel .check-clean'); if (d) { d.open = true; d.scrollIntoView({ block:'start' }); } await sleep(100);
    return [d ? d.querySelector('summary').innerText.replace(/\\s+/g, ' ') : '', document.querySelectorAll('#check-panel > .check-sec, #check-panel .check-sec:not(.check-clean .check-sec)').length];
  })()`);
  await shot('53-fold');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!fold || !/其余 \d+ 项没问题/.test(fold[0])) errors.push('折叠异常：' + JSON.stringify(fold));
  check('没问题的项折叠（临时书）', fold && (fold[0].slice(0, 80) + ' ｜展开在外 ' + fold[1] + ' 项'));
  // 设定说明段
  const kid = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-id', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-id');
    const c = t.addChapter('一', '他推门。\\n这个世界的修炼被称为炼气，共分为九重境界，据说千年前曾有人突破第十重，' + '但再也没有人见过他。'.repeat(6)); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /设定说明段/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('button.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('54-infodump');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kid || !/百科.*被称为/.test(kid[0])) errors.push('设定说明段异常：' + JSON.stringify(kid));
  check('设定说明段（临时书）', kid && (kid[0].slice(0, 70) + ' ｜定位「' + kid[1] + '」'));
  // 对话标签
  const kdt = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-dt', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-dt');
    const c = t.addChapter('一', '“走吧。”他说。“去哪？”她问道。“城外。”他说。“好。”她说。“快点。”他道。“嗯。”她说。“到了。”他说道。'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /对话标签/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('button.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('55-dialogtag');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kdt || !/说\/道.*说/.test(kdt[0])) errors.push('对话标签异常：' + JSON.stringify(kdt));
  check('对话标签（临时书）', kdt && (kdt[0].slice(0, 70) + ' ｜定位「' + kdt[1] + '」'));
  // 场景切换
  const ksb = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-sb', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-sb');
    const c = t.addChapter('一', '他睡了。\\n第二天，雨停了。\\n\\n三天后，城破。\\n她笑了。\\n半个月后他回来。'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /场景切换/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('button.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('56-scene');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!ksb || !/半个月后/.test(ksb[0])) errors.push('场景切换异常：' + JSON.stringify(ksb));
  check('场景切换（临时书）', ksb && (ksb[0].slice(0, 70) + ' ｜定位「' + ksb[1] + '」'));
  // 标题撞车
  const ktc = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-tc', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-tc');
    const c = t.addChapter('第7章 夜探藏经阁', (t.addChapter('第2章 夜探藏经阁', '他走。'), '他又走。')); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /标题撞车/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('button.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('57-titleclash');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!ktc || !/一模一样.*同名/.test(ktc[0])) errors.push('标题撞车异常：' + JSON.stringify(ktc));
  check('标题撞车（临时书）', ktc && (ktc[0].slice(0, 70) + ' ｜定位「' + ktc[1] + '」'));
  // 超长句
  const kls = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-ls', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-ls');
    const c = t.addChapter('一', '他来了。他拖着那条受伤的腿一路从城南的旧码头走到城北的破庙，路上经过了三座桥、两条街和一片早已荒废的菜地，雨一直下个不停，他却始终没有停下来歇一歇脚。她笑。'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /超长句/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('55-longsent');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kls || !/70 字以上/.test(kls[0])) errors.push('超长句异常：' + JSON.stringify(kls));
  check('超长句（临时书）', kls && (kls[0].slice(0, 70) + ' ｜定位「' + kls[1] + '」'));
  // 情绪直给
  const kte = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-te', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-te');
    const c = t.addChapter('一', '他很生气。她感到害怕，转身就走。他很生气地追上去。'.repeat(2)); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /情绪直给/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('56-tell');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kte || !/身体反应.*很生气/.test(kte[0])) errors.push('情绪直给异常：' + JSON.stringify(kte));
  check('情绪直给（临时书）', kte && (kte[0].slice(0, 70) + ' ｜定位「' + kte[1] + '」'));
  // 流水账
  const krt = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-rt', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-rt');
    const c = t.addChapter('一', '他醒来，起床洗漱，吃完早饭就出门了。' + '街上人很多。'.repeat(10)); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /流水账/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('57-routine');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!krt || !/日常小事.*醒来/.test(krt[0])) errors.push('流水账异常：' + JSON.stringify(krt));
  check('流水账（临时书）', krt && (krt[0].slice(0, 70) + ' ｜定位「' + krt[1] + '」'));
  // 句首重复
  const kss = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-ss', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-ss');
    const c = t.addChapter('一', '雨停了。他推开门。他走进屋。他坐下。他倒了杯茶。窗外有狗叫。'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /句首重复/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('58-samestart');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kss || !/同一个字开头/.test(kss[0])) errors.push('句首重复异常：' + JSON.stringify(kss));
  check('句首重复（临时书）', kss && (kss[0].slice(0, 70) + ' ｜定位「' + kss[1] + '」'));
  // 解压：撕烂废稿 / 卸压泡泡纸
  const rlf = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; localStorage.setItem('qianzhang:relief-mute', 'on');
    const t = new QZStore({ project_id:'smoke-rl', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-rl');
    const c = t.addChapter('一', '他推开门。雨落下来。'); QZ.project = t; const before = JSON.stringify(t.data);
    QZ.navigate('write', true, [c.id]); await sleep(300); document.querySelector('[data-act="write.relief"]').click(); await sleep(200);
    const cv = document.querySelector('.relief .rl-canvas'), b = cv.getBoundingClientRect(), fire = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { clientX:x, clientY:y, buttons:1, pointerId:1, bubbles:true }));
    fire('pointerdown', b.left + b.width * 0.3, b.top + b.height * 0.2); for (let i = 1; i <= 20; i++) { fire('pointermove', b.left + b.width * (0.3 + i * 0.02), b.top + b.height * (0.2 + i * 0.03)); await sleep(10); } fire('pointerup', 0, 0);
    await sleep(250); const torn = +document.querySelector('.relief .rl-stage').dataset.torn;
    return [torn, before];
  })()`);
  await shot('59-tear');
  const rlf2 = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('.relief [data-m="bubble"]').click(); await sleep(150);
    [...document.querySelectorAll('.rl-bub')].slice(0, 4).forEach(b => b.click()); await sleep(150); const popped = +document.querySelector('.relief .rl-stage').dataset.popped, label = document.querySelector('.rl-bub').textContent;
    return [popped, label];
  })()`);
  await shot('60-bubbles');
  const rlf3 = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); await sleep(150);
    const gone = !document.querySelector('.relief'), txt = document.getElementById('ch-text').value;
    localStorage.removeItem('qianzhang:relief-mute'); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(200);
    return [gone, txt];
  })()`);
  if (!rlf || !(rlf[0] > 5) || !rlf2 || rlf2[0] !== 4 || !rlf3 || !rlf3[0] || rlf3[1] !== '他推开门。雨落下来。') errors.push('解压异常：' + JSON.stringify([rlf && rlf[0], rlf2, rlf3]));
  check('解压：撕纸与泡泡（临时书）', rlf && ('撕掉 ' + rlf[0] + ' 格，戳破 ' + (rlf2 && rlf2[0]) + ' 个「' + (rlf2 && rlf2[1]) + '」，Esc 关闭 ' + (rlf3 && rlf3[0]) + '，正文未变 ' + (rlf3 && rlf3[1] === '他推开门。雨落下来。')));
  // 入正典
  const kcanon = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-canon', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-canon');
    const c = t.addChapter('一', '苏晴道：“走吧。”苏晴道：“快点。”店小二道：“客官慢走。”店小二道：“再来。”他仿佛看见赵三死了。'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const h = [...document.querySelectorAll('#check-panel .check-sec')].find(x => /入正典/.test(x.querySelector('h4').textContent)); if (h) h.scrollIntoView({ block:'start' });
    const b = h && h.querySelector('.hit'); if (b) b.click(); await sleep(100); const ta = document.getElementById('ch-text');
    return [h ? h.innerText.replace(/\\s+/g, ' ') : '', ta.value.slice(ta.selectionStart, ta.selectionEnd).slice(0, 12)];
  })()`);
  await shot('61-canon');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kcanon || !/苏晴/.test(kcanon[0])) errors.push('入正典异常：' + JSON.stringify(kcanon));
  check('入正典（临时书）', kcanon && (kcanon[0].slice(0, 70) + ' ｜定位「' + kcanon[1] + '」'));
  // 入正典点击：一键收下、故意这样写（临时书）
  const kcq = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)); window.__realP = QZ.project; window.__pn = localStorage.getItem('qianzhang:write-panel');
    const t = new QZStore({ project_id:'smoke-cq', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-cq');
    const a = t.addEntity({ name:'林远', type:'PERSON' }), c1 = t.addChapter('一', '林远战死了。'); t.addProgress(a.id, { chapterId:c1.id, text:'战死', dead:true });
    const c = t.addChapter('二', '门口那姑娘名叫苏晴。苏晴道：“走吧。”苏晴道：“快点。”林远推门进来。'); QZ.project = t;
    localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(300);
    const r = {}; const q = () => document.querySelector('#check-panel .canon-q');
    r.before = q() ? q().querySelectorAll('.cq-item').length : 0; r.conflictFirst = !!(q() && q().querySelector('.cq-item').classList.contains('conflict'));
    const all = q() && q().querySelector('[data-act="write.canonAll"]'); if (all) all.click(); await sleep(300);
    r.card = t.data.nodes.some(n => n.name === '苏晴');
    const it = q() && q().querySelector('[data-act="write.canonIntend"]'); if (it) it.click(); await sleep(250);
    r.noModal = !document.querySelector('.modal-wrap'); const inp = document.querySelector('.toast-note'); if (inp) { inp.value = '诈尸，后文解释'; inp.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter' })); } await sleep(400);
    r.after = q() ? q().querySelectorAll('.cq-item').length : 0; r.note = ((t.data.writing.canonDismiss || {})[Object.keys(t.data.writing.canonDismiss || {})[0]] || {}).note;
    QZ.navigate('write', true, [c.id]); await sleep(300); r.repop = q() ? q().querySelectorAll('.cq-item.conflict').length : 0;
    return r;
  })()`);
  await shot('62-canon-click');
  await js(`(async () => { const k = window.__pn; if (k === null) localStorage.removeItem('qianzhang:write-panel'); else localStorage.setItem('qianzhang:write-panel', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!kcq || !kcq.conflictFirst || !kcq.card || kcq.note !== '诈尸，后文解释' || kcq.repop || !kcq.noModal) errors.push('入正典点击异常：' + JSON.stringify(kcq));
  check('入正典点击（临时书）', kcq && ('冲突置顶 ' + kcq.conflictFirst + '，收下后建卡 ' + kcq.card + '，故意备注「' + kcq.note + '」，重开再弹 ' + kcq.repop + '，队列 ' + kcq.before + '→' + kcq.after));
  // 删除作品进回收站并恢复、新建章节立刻打字不丢、Ctrl+K 搜正文、小黑屋计时、⋯菜单（全部用临时书）
  const kfx = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), r = {}, orig = QZ.project.id, origTitle = QZ.project.title;
    const clickBtn = (sel, txt) => { const b = [...document.querySelectorAll(sel)].find(x => !txt || x.textContent.includes(txt)); if (b) b.click(); return !!b; };
    const origData = QZ.project.toJSON(), stub = Object.prototype.hasOwnProperty.call(QZ.storage, 'save') && QZ.storage.save; delete QZ.storage.save; /* useDemo 把保存换成了假的；这一段要真存盘才能测回收站 */
    await QZ.createProject('临时删除测试'); await sleep(300); const tid = QZ.project.id; r.created = tid !== orig;
    QZ.navigate('home', true); await sleep(200);
    r.homeBtn = clickBtn('[data-act="home.del"]'); await sleep(200); r.confirm = clickBtn('.modal-wrap .btn.danger', '回收站'); await sleep(900);
    r.listed = (await QZ.storage.list()).some(x => x.id === tid); r.switched = QZ.project.id !== tid;
    QZ.trashDialog(); await sleep(500); const it = [...document.querySelectorAll('.trash-item')].find(x => x.textContent.includes('临时删除测试'));
    r.inTrash = !!it; r.emptyBtn = !!document.querySelector('[data-purge-all]'); if (it) it.querySelector('[data-restore]').click(); await sleep(1200);
    r.restored = (await QZ.storage.list()).some(x => x.title === '临时删除测试');
    // 新建章节后立刻打字
    const rid = QZ.project.id; QZ.navigate('write', true, [QZ.project.chapters()[0] ? QZ.project.chapters()[0].id : '']); await sleep(200);
    QZ.pages().write.actions.add(QZ); const t = document.getElementById('ch-text'); r.bodyFocused = document.activeElement && document.activeElement.id === 'ch-text'; { const ti = document.getElementById('ch-title'); ti.focus(); ti.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })); r.enterToBody = document.activeElement === t; }
    t.focus(); t.value = '手快开打的第一句。'; t.dispatchEvent(new Event('input', { bubbles:true })); await sleep(400);
    const nc = QZ.project.chapters().slice(-1)[0]; r.typed = nc.text; r.titleClean = !/手快/.test(nc.title || '');
    // Ctrl+K 搜正文
    QZPalette.open(QZ); await sleep(150); const q = document.getElementById('pal-q'); q.value = '开打的第一'; q.dispatchEvent(new Event('input', { bubbles:true })); await sleep(200);
    r.bodyHit = [...document.querySelectorAll('.pal-item')].some(x => x.textContent.includes('正文') || x.textContent.includes('开打的第一')); document.querySelector('.pal-wrap').remove();
    // ⋯ 菜单：点项后收起、Esc 收起、不一字一行
    const m = document.querySelector('details.menu'); m.open = true; await sleep(80); const sb = [...m.querySelectorAll('button')].find(b => b.textContent.includes('全书搜索替换'));
    r.menuOneLine = sb ? sb.getBoundingClientRect().height < 48 : false;
    document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); await sleep(60); r.escClosed = !m.open;
    m.open = true; m.querySelector('[data-act="write.snap"]').click(); await sleep(150); r.clickClosed = !m.open; r.snap = (QZ.project.chapters().slice(-1)[0].history || []).some(h => /手动/.test(h.note || ''));
    // 小黑屋：锁默认不勾、计时会走
    QZ.pages().write.actions.focus(QZ); await sleep(250); const lock = document.getElementById('fx-lock'); r.lockOff = lock && !lock.checked;
    document.getElementById('fx-min').value = '45'; document.getElementById('fx-goal') && (document.getElementById('fx-goal').value = '0'); document.querySelector('.modal-wrap .btn.primary').click(); await sleep(400);
    const h1 = (document.getElementById('focus-hud') || {}).textContent || ''; await sleep(2200); const h2 = (document.getElementById('focus-hud') || {}).textContent || '';
    r.tick = h1 !== h2 && /44:5/.test(h2); r.hud = h2.slice(0, 30);
    QZ.pages().write.actions.exitFocus(QZ); await sleep(200); document.querySelectorAll('.modal-wrap').forEach(w => { const b = [...w.querySelectorAll('.btn')].find(x => /出关|离开|确定/.test(x.textContent)); if (b) b.click(); }); await sleep(200);
    // 清理：彻底删掉临时书，回到原书
    await QZ.flush(); await QZ.storage.trash(rid); const tl = await QZ.storage.trashList(); for (const x of tl.filter(x => x.title === '临时删除测试')) await QZ.storage.purge(x);
    if (stub) QZ.storage.save = stub; QZ.project = new QZStore(origData, orig); QZ.navigate('home', true); await sleep(300); r.back = QZ.project.id === orig && QZ.project.title === origTitle; if (stub) QZ.storage.save = stub;
    document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); return r;
  })()`);
  await shot('63-fixes');
  if (!kfx || !(kfx.created && kfx.homeBtn && kfx.confirm && !kfx.listed && kfx.switched && kfx.inTrash && kfx.emptyBtn && kfx.bodyFocused && kfx.enterToBody && kfx.restored && kfx.typed === '手快开打的第一句。' && kfx.titleClean && kfx.bodyHit && kfx.menuOneLine && kfx.escClosed && kfx.clickClosed && kfx.snap && kfx.lockOff && kfx.tick && kfx.back)) errors.push('新建与快捷操作异常：' + JSON.stringify(kfx));
  check('删书/回收站/新章打字/搜正文/菜单/小黑屋（临时书）', kfx && JSON.stringify(kfx));
  // 轻打扰——删章可撤销、替换在搜索框里勾选+撤销、保存失败只提示一次、小黑屋离开一行提示
  const lt = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), r = {}; window.__realP = QZ.project;
    const t = new QZStore({ project_id:'smoke-lt', meta:{ title:'临时测试书' }, nodes:[], relations:[] }, 'smoke-lt'); const a = t.addChapter('一', '林周来了。'), b = t.addChapter('二', '林周走了。林周笑了。'); QZ.project = t;
    try { document.getElementById('toasts').replaceChildren();
      QZ.navigate('write', true, [b.id]); await sleep(250); QZ.pages().write.actions.remove(QZ); await sleep(250);
      r.noModal = !document.querySelector('.modal-wrap'); r.deleted = t.chapters().length === 1; const u = document.querySelector('.toast-undo'); if (u) u.click(); await sleep(250); r.undone = t.chapters().length === 2 && t.chapters()[1].text === '林周走了。林周笑了。';
      QZ.pages().write.actions.search(QZ); await sleep(200); const w = document.querySelector('.modal-wrap'); w.querySelector('#sr-q').value = '林周'; w.querySelector('#sr-r').value = '林舟'; w.querySelector('#sr-q').dispatchEvent(new Event('input')); await sleep(400);
      r.boxes = w.querySelectorAll('.sr-ch').length; r.diff = !!w.querySelector('.sr-ctx ins'); w.querySelector('.sr-ch[value="' + a.id + '"]').checked = false; w.querySelector('.modal-foot .btn.primary').click(); await sleep(400);
      r.partial = t.chapter(a.id).text === '林周来了。' && t.chapter(b.id).text === '林舟走了。林舟笑了。'; r.noConfirm = !document.querySelector('.modal-wrap');
      const u2 = [...document.querySelectorAll('.toast-undo')].pop(); if (u2) u2.click(); await sleep(250); r.replUndo = t.chapter(b.id).text === '林周走了。林周笑了。';
      document.getElementById('toasts').replaceChildren(); const st = QZ.storage.save; QZ.storage.save = () => Promise.reject(new Error('磁盘满')); QZ.saveState = 'dirty'; await QZ.flush(); QZ.saveState = 'error'; await QZ.flush();
      r.errToasts = [...document.querySelectorAll('#toasts .toast.err')].length; r.bar = (document.getElementById('save-state') || {}).textContent; clearTimeout(QZ._retry); QZ.storage.save = st; QZ.setSaveState('idle');
    } catch (e) { r.err = e.message; }
    QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); document.getElementById('toasts').replaceChildren(); await sleep(200); return r; })()`);
  if (!lt || lt.err || !(lt.noModal && lt.deleted && lt.undone && lt.boxes === 2 && lt.diff && lt.partial && lt.noConfirm && lt.replUndo && lt.errToasts === 1 && /未保存/.test(lt.bar || ''))) errors.push('轻打扰异常：' + JSON.stringify(lt));
  check('轻打扰（临时书）', lt && JSON.stringify(lt));
  // UI 打磨——两人关系图、首页存稿卡/日历/统计、细纲收起、检查面板主次；两种主题都截图
  const ui = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), r = {}; window.__realP = QZ.project; window.__lv = localStorage.getItem('qianzhang:library-view');
    const t = new QZStore({ project_id:'smoke-ui', meta:{ title:'临时测试书' }, nodes:[{ id:'a', type:'PERSON', name:'沈千章' }, { id:'b', type:'PERSON', name:'柳如烟' }], relations:[{ id:'r1', source:'a', target:'b', label:'师徒' }, { id:'r2', source:'b', target:'a', label:'恩人' }] }, 'smoke-ui'); QZ.project = t;
    try { localStorage.setItem('qianzhang:library-view', 'graph'); QZ.navigate('library', true); await sleep(400);
      const ps = [...document.querySelectorAll('.rel-graph .g-edge path')].map(x => x.getAttribute('d')), cs = [...document.querySelectorAll('.rel-graph .g-node circle')].map(c => +c.getAttribute('cx'));
      r.edges = ps.length; r.distinct = new Set(ps).size === ps.length; r.labels = document.querySelectorAll('.rel-graph .g-edge text').length; r.inside = cs.every(x => x > 200 && x < 700);
    } catch (e) { r.err = e.message; } return r; })()`);
  await shot('65-rel-2node');
  const ui2 = await js(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)), r = {}, t = QZ.project; const c = t.addChapter('一', '雾从江面上来。'.repeat(30)); t.updateChapter(c.id, { outline:'主角夺剑' + String.fromCharCode(10) + '本章冲突：师徒反目' });
    try { localStorage.removeItem('qianzhang:write-outline'); localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', true, [c.id]); await sleep(400);
      const d = document.querySelector('details.outline-box'); r.outlineCollapsed = !!d && !d.open && /主角夺剑/.test(d.querySelector('summary').textContent);
      r.core = document.querySelectorAll('#check-panel .check-core > div').length; r.more = !!document.querySelector('#check-panel details.check-more');
      QZ.navigate('home', true); await sleep(400); r.stockLeft = getComputedStyle(document.querySelector('.stock-card')).borderLeftWidth; const h = document.querySelector('[data-act="home.heat"][data-n="5"]'); if (h) h.click(); await sleep(300); r.d30 = !!document.querySelector('.heatmap.d30') && !!document.querySelector('.hm[data-tip]');
    } catch (e) { r.err = e.message; } return r; })()`);
  await shot('66-home-polish');
  await js('document.getElementById("theme-btn").click()'); await sleep(400); await shot('66-home-polish-dark');
  await js(`(async () => { QZ.navigate('library', true); })()`); await sleep(500); await shot('65-rel-2node-dark');
  await js(`(async () => { const c = QZ.project.chapters()[0]; QZ.navigate('write', true, [c.id]); })()`); await sleep(500); await shot('67-check-dark');
  await js('document.getElementById("theme-btn").click()'); await sleep(300); await shot('67-check-light');
  await js(`(async () => { QZ.app && 0; QZ.heatSpan = 18; const k = window.__lv; if (k === null) localStorage.removeItem('qianzhang:library-view'); else localStorage.setItem('qianzhang:library-view', k); QZ.project = window.__realP; delete window.__realP; QZ.navigate('home', true); await new Promise(r => setTimeout(r, 200)); })()`);
  if (!ui || ui.err || ui.edges !== 2 || !ui.distinct || ui.labels !== 2 || !ui.inside || !ui2 || ui2.err || !ui2.outlineCollapsed || ui2.core !== 2 || !ui2.more || ui2.stockLeft !== '4px' || !ui2.d30) errors.push('UI 打磨异常：' + JSON.stringify([ui, ui2]));
  check('UI 打磨（临时书，浅色+深色截图）', JSON.stringify([ui, ui2]));
  // 别名与外号：内存临时书，外号收进人物卡、错名全书统一后可撤销
  const al = await js(`(async () => {
    const real = QZ.project, P = QZStore, sleep = ms => new Promise(r => setTimeout(r, ms)), r = {};
    try {
      const t = new P({ project_id:'smoke-al', meta:{ title:'别名临时书' }, nodes:[{ id:'n1', type:'character', name:'林云峰', summary:'主角' }], relations:[] }, 'smoke-al');
      const c = t.addChapter('一', '林云峰性子急，众人都叫他阿风。阿风也不恼。林云锋拔出长剑。'); t.addChapter('二', '林云锋又来了。');
      QZ.project = t; localStorage.setItem('qianzhang:write-panel', 'on'); QZ.navigate('write', false, [c.id]); await sleep(400);
      r.items = document.querySelectorAll('#check-panel .alias-sec .al-item').length;
      const add = document.querySelector('[data-act="write.alAdd"][data-n="阿风"]'); if (add) add.click(); await sleep(300);
      r.alias = t.entity('n1').aliases;
      const fix = document.querySelector('[data-act="write.alFix"][data-n="林云锋"]'); if (fix) fix.click(); await sleep(300);
      r.fixed = t.chapters().map(x => x.text).join('|').indexOf('林云锋') < 0;
      const u = Array.from(document.querySelectorAll('.toast button')).find(b => /撤销/.test(b.textContent)); if (u) u.click(); await sleep(300);
      r.undone = t.chapters()[1].text === '林云锋又来了。';
    } catch (e) { r.err = e.message; }
    QZ.project = real; QZ.navigate('home', true); await sleep(200); return r; })()`);
  if (!al || al.err || al.items < 2 || al.alias !== '阿风' || !al.fixed || !al.undone) errors.push('别名与外号异常：' + JSON.stringify(al));
  check('别名与外号（临时书）', JSON.stringify(al));
  // 回收站计数实时更新 + 已保存时关页不拦
  const tr = await js(`(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)), S = QZ.storage, keep = [S.trashList, S.purge], r = {};
    try { S.trashList = () => Promise.resolve([{ id:'a', title:'甲', deletedAt:Date.now() }, { id:'b', title:'乙', deletedAt:Date.now() }]); S.purge = () => Promise.resolve();
      QZ.trashDialog(); await sleep(300); const pa = () => document.querySelector('[data-purge-all]'); r.before = pa() && pa().textContent;
      const b = document.querySelector('[data-purge="0"]'); b.click(); b.click(); await sleep(200); r.after1 = pa() && pa().textContent;
      const c = document.querySelector('[data-purge="1"]'); c.click(); c.click(); await sleep(200); r.after2 = pa() ? pa().textContent : null;
      document.querySelector('.modal button') && Array.from(document.querySelectorAll('.modal button')).find(x => x.textContent === '关闭').click(); await sleep(200);
      const st = QZ.saveState; QZ.saveState = 'saved'; QZ._sentVer = QZ._ver; r.unload = QZ.saveNow(); QZ.saveState = st;
    } catch (e) { r.err = e.message; } S.trashList = keep[0]; S.purge = keep[1]; return r; })()`);
  if (!tr || tr.err || !/2/.test(tr.before || '') || !/1/.test(tr.after1 || '') || tr.after2 !== null || tr.unload === 'risky') errors.push('回收站计数/关页提示异常：' + JSON.stringify(tr));
  check('回收站计数实时更新、已保存时关页不拦', JSON.stringify(tr));
  // 需要打字的检查：用一本只在内存里的临时书（不挂保存、不写盘），查完换回用户的书
  const tmp = await js(`(async () => {
    const real = QZ.project, cur = localStorage.getItem('qianzhang:current'), P = QZStore, sleep = ms => new Promise(r => setTimeout(r, ms));
    const t = new P({ project_id:'smoke-tmp', meta:{ title:'临时测试书' }, nodes:[{ id:'n1', type:'character', name:'林小满', summary:'主角' }], relations:[] }, 'smoke-tmp');
    const c = t.addChapter('第一章', '开头。'); QZ.project = t; QZ.navigate('write', false, [c.id]); await sleep(300);
    const ta = document.getElementById('ch-text'); ta.focus(); ta.value = '开头。@林'; ta.selectionStart = ta.selectionEnd = ta.value.length; ta.dispatchEvent(new Event('input', { bubbles:true })); await sleep(200);
    const pop = document.querySelectorAll('.mention-pop .mp-item').length;
    ta.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true })); await sleep(100);
    const after = t.chapter(c.id).text;
    const realReady = QZAI.ready; QZAI.ready = () => true; QZPages.write.aiWrite(QZ); await sleep(300); QZAI.ready = realReady;
    const m = document.querySelector('.aw'), dis = document.getElementById('aw-go').disabled; document.getElementById('aw-out').value = '他抬头看天。';
    const ok = [...document.querySelectorAll('.modal-foot .btn')].find(b => b.textContent === '放进正文'); ok.click(); await sleep(300);
    const final = t.chapter(c.id).text, hist = t.history(c.id).length;
    QZ.project = real; if (cur === null) localStorage.removeItem('qianzhang:current'); else localStorage.setItem('qianzhang:current', cur);
    QZ.navigate('home', true); document.getElementById('toasts') && document.getElementById('toasts').replaceChildren(); await sleep(200);
    return [pop, after, !!m, dis, final, hist, QZ.project.id];
  })()`);
  if (!tmp || tmp[0] < 1 || !/林小满/.test(tmp[1]) || !/他抬头看天/.test(tmp[4]) || tmp[5] < 1 || tmp[6] === 'smoke-tmp') errors.push('临时书检查失败：' + JSON.stringify(tmp));
  check('@插入与AI写入（临时书）', tmp && ('@弹出 ' + tmp[0] + ' 项，写入后 ' + JSON.stringify(tmp[4]) + '，历史稿 ' + tmp[5]));
  // 全书搜索（只读，不点替换）
  await js('location.hash = "#/write"'); await sleep(400);
  await js('QZ.go ? 0 : 0, QZPages.write.actions.search(QZ)'); await sleep(300);
  const sq = await js('(() => { const q = QZ.project.chapters()[0].text.replace(/\\s/g, "").slice(0, 2); const i = document.querySelector("#sr-q"); i.value = q; i.dispatchEvent(new Event("input")); return q; })()'); await sleep(500);
  const hits = await js('document.querySelectorAll(".sr-hit").length'); await shot('13-search');
  await js('document.querySelector(".sr-hit").click()'); await sleep(500);
  const sel = await js('(() => { const t = document.getElementById("ch-text"); return t.value.slice(t.selectionStart, t.selectionEnd); })()');
  if (!hits || sel !== sq) errors.push('全书搜索没有定位：' + hits + ' ' + sel);
  check('全书搜索', hits + ' 处「' + sq + '」，点击定位到正文');
  // 小黑屋：锁定时切不出写作页；出关后恢复（只看界面，不写正文）
  await js('document.querySelector("[data-act=\\"write.focus\\"]").click()'); await sleep(300);
  await js('document.getElementById("fx-goal").value = 50; document.getElementById("fx-lock").checked = true; document.querySelector(".modal .btn.primary").click()'); await sleep(1500);
  await shot('12-focus');
  await js('location.hash = "#/home"'); await sleep(600);
  const stay = await js('document.body.classList.contains("focus-mode") && !!document.getElementById("ch-text") && !!document.querySelector("#focus-hud b")');
  if (!stay) errors.push('小黑屋锁定没有生效');
  await js('document.querySelector("[data-act=\\"write.exitFocus\\"]").click()'); await sleep(300);
  const lockLine = await js('(() => { const b = document.querySelector("#lock-bar button"); const txt = b ? document.getElementById("lock-bar").textContent : ""; if (b) b.click(); return [txt, !!document.querySelector(".modal-wrap")]; })()'); await sleep(500);
  if (!lockLine || !/还差|还剩/.test(lockLine[0]) || lockLine[1]) errors.push('小黑屋离开提示异常：' + JSON.stringify(lockLine));
  const out = await js('!document.body.classList.contains("focus-mode")');
  if (!out) errors.push('小黑屋没能退出');
  check('小黑屋', stay && out ? '锁定生效，可确认后出关' : '');
  // 视图切换、深色主题、手机宽度
  await js('location.hash = "#/library"'); await sleep(500);
  await js('document.querySelector("[data-act=\\"library.view\\"][data-v=\\"list\\"]") && document.querySelector("[data-act=\\"library.view\\"][data-v=\\"list\\"]").click()'); await sleep(400);
  check('设定列表视图', await js('document.querySelector(".entity-list") ? "列表" : "（未切换）"'));
  await js('document.getElementById("theme-btn").click()'); await sleep(400);
  await js('location.hash = "#/home"'); await sleep(700); await js('document.getElementById("toasts").replaceChildren(); document.body.classList.add("no-anim")'); await sleep(1500);
  const dk = await js('[document.documentElement.dataset.theme, getComputedStyle(document.querySelector(".hero") || document.body).backgroundColor]');
  if (!dk || !/rgb\((\d|[1-5]\d),/.test(dk[1])) errors.push('深色主题卡片仍是浅色：' + JSON.stringify(dk));
  check('深色主题', dk && dk.join(' · '));
  await shot('8-home-dark');
  await js('location.hash = "#/write"'); await sleep(700);
  await shot('9-write-dark');
  await js('document.getElementById("theme-btn").click(); localStorage.setItem("qianzhang:library-view","grid")'); await sleep(300);
  await size(390, 844); await js('location.hash = "#/home"'); await sleep(700);
  check('手机宽度首页'); await shot('10-mobile-home');
  await js('location.hash = "#/chat/' + person + '"'); await sleep(700);
  check('手机宽度聊天'); await shot('11-mobile-chat');
  ws.close(); return bad;
}
function finish(bad, err) {
  try { chrome.kill(); } catch (e) {}
  try { stopServer(); } catch (e) {}
  if (err) { console.error(err); bad = (bad || 0) + 1; }
  if (!process.env.QZ_BASE && dataBefore !== dataSig()) { console.log('  报错  浏览器检查改动了仓库 data/'); bad++; }
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    try { const t = path.join(__dirname, '..', '.test-tmp'); if (fs.existsSync(t) && !fs.readdirSync(t).length) fs.rmdirSync(t); } catch (e) {}
    console.log(bad ? '\n发现 ' + bad + ' 个问题' : '\n浏览器检查全部正常'); process.exit(err ? 2 : bad ? 1 : 0); }, 800);
}
main().then(bad => finish(bad), e => finish(0, e));
