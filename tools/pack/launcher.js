/*! 千章 · Windows 桌面程序（Node SEA）：解压程序文件、启动本地服务、用 Edge/Chrome 的独立应用窗口打开；窗口关了就退出。
 *  没有 Edge/Chrome 或窗口被拦截时改用默认浏览器，并提供托盘图标和页面里的「退出千章」 */
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn, execFile } = require('child_process');
const { createRequire } = require('module');
const sea = require('node:sea');

const exeDir = path.dirname(process.execPath);
const root = path.join(exeDir, 'qianzhang-app');
const list = JSON.parse(sea.getAsset('__list__', 'utf8'));
/* 作品放哪：从仓库 dist/ 里运行 → 用仓库的 data（开发者已有的书）；否则用 exe 旁边的 data；
   旧版本把书存在 qianzhang-app/data 里的，继续用那里。程序只解压代码文件，从不写、不覆盖 data/projects。 */
function pickData() {
  if (process.env.QZ_DATA) return path.resolve(process.env.QZ_DATA);
  const repo = path.dirname(exeDir);
  if (path.basename(exeDir).toLowerCase() === 'dist' && fs.existsSync(path.join(repo, 'server', 'server.js')) && fs.existsSync(path.join(repo, 'workspace'))) return path.join(repo, 'data');
  const beside = path.join(exeDir, 'data'), legacy = path.join(root, 'data');
  const has = d => { try { return fs.readdirSync(path.join(d, 'projects')).some(f => f.endsWith('.json')); } catch (e) { return false; } };
  return !has(beside) && has(legacy) ? legacy : beside;
}
const dataDir = pickData();
process.env.QZ_DATA = dataDir;
/* 程序自己的东西（日志、单实例记录、浏览器窗口档案）放 data/app，与作品分开 */
const appDir = path.join(dataDir, 'app');
fs.mkdirSync(appDir, { recursive: true });
const logFile = path.join(appDir, 'qianzhang.log');
try { if (fs.statSync(logFile).size > 1 << 20) fs.renameSync(logFile, logFile + '.old'); } catch (e) {}
const log = (...a) => { try { fs.appendFileSync(logFile, new Date().toISOString() + ' ' + a.map(x => x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); } catch (e) {} };
/* 没有控制台窗口：所有输出写进日志文件 */
console.log = console.info = console.warn = console.error = log;
process.stdout.write = process.stderr.write = (s) => { log(String(s).trimEnd()); return true; };
process.on('uncaughtException', e => { log('未处理的错误', e); });
const lockFile = path.join(appDir, 'instance.json');
const profile = path.join(appDir, 'window-profile');

function alert(msg, keep) { /* 出错时弹个对话框（没有控制台可看） */
  execFile('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', 'Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show($env:QZ_MSG, "千章")'], { windowsHide: true, env: Object.assign({}, process.env, { QZ_MSG: msg }) }, () => { if (!keep) process.exit(1); });
}
/* 当前模式：window = 独立应用窗口（关窗即退出）；browser = 默认浏览器（关页面不会退出，用托盘或页面按钮退出） */
global.__qzMode = 'window';
let winChild = null, tray = null, quitting = false;
/** 干净退出：页面按钮（/api/quit）或托盘菜单调用 */
global.__qzQuit = function (from) {
  if (quitting) return; quitting = true;
  log('退出（' + (from || '?') + '）');
  try { fs.unlinkSync(lockFile); } catch (e) {}
  try { if (tray) tray.kill(); } catch (e) {}
  try { if (winChild && winChild.exitCode == null) winChild.kill(); } catch (e) {}
  setTimeout(() => process.exit(0), 300);
};
process.on('exit', () => { try { if (tray) tray.kill(); } catch (e) {} });
/* 托盘图标（PowerShell + WinForms）：菜单「打开千章 / 退出千章」，通过标准输出告诉本进程 */
const TRAY_PS = [
  'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
  '$n = New-Object System.Windows.Forms.NotifyIcon',
  'try { $n.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($env:QZ_EXE) } catch { $n.Icon = [System.Drawing.SystemIcons]::Application }',
  "$n.Text = '千章（正在运行）'",
  '$m = New-Object System.Windows.Forms.ContextMenuStrip',
  "$o = $m.Items.Add('打开千章'); $o.add_Click({ [Console]::Out.WriteLine('open'); [Console]::Out.Flush() })",
  "$q = $m.Items.Add('退出千章'); $q.add_Click({ [Console]::Out.WriteLine('quit'); [Console]::Out.Flush(); $n.Visible = $false; [System.Windows.Forms.Application]::Exit() })",
  "$n.ContextMenuStrip = $m; $n.add_DoubleClick({ [Console]::Out.WriteLine('open'); [Console]::Out.Flush() })",
  '$n.Visible = $true',
  "$n.ShowBalloonTip(6000, '千章', '千章在默认浏览器里运行，关掉网页不会退出。要退出，请点页面左下角或这里的「退出千章」。', 'Info')",
  '[System.Windows.Forms.Application]::Run(); $n.Dispose()',
].join('; ');
function startTray(url) {
  if (tray || process.platform !== 'win32' || process.env.QZ_NO_TRAY) return;
  try {
    tray = spawn('powershell', ['-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-Command', TRAY_PS], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: Object.assign({}, process.env, { QZ_EXE: process.execPath }) });
    let buf = '';
    tray.stdout.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const cmd = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (cmd === 'quit') global.__qzQuit('tray'); else if (cmd === 'open') openDefault(url); } });
    tray.on('exit', () => { tray = null; });
    log('托盘图标已显示');
  } catch (e) { log('托盘图标失败', e); }
}
function openDefault(url) { execFile('cmd', ['/c', 'start', '', url], { windowsHide: true }); }
/** 改用默认浏览器：切到 browser 模式（页面会显示退出按钮），挂托盘图标，再打开页面 */
function useDefaultBrowser(url, why) {
  log(why + '，改用默认浏览器'); global.__qzMode = 'browser'; startTray(url); openDefault(url);
}
function free(port) {
  return new Promise(ok => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(port, '127.0.0.1'); });
}
function ping(port) {
  return new Promise(ok => { const r = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: 1500 }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { ok(JSON.parse(b).ok === true); } catch (e) { ok(false); } }); }); r.on('error', () => ok(false)); r.on('timeout', () => { r.destroy(); ok(false); }); });
}
function findBrowser() {
  const E = process.env, c = [];
  for (const b of [E['ProgramFiles(x86)'], E.ProgramFiles, E.LOCALAPPDATA].filter(Boolean)) c.push(path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  if (E.QZ_BROWSER === 'none') return undefined; /* 测试用：模拟没有 Edge/Chrome */
  if (E.QZ_BROWSER) c.unshift(E.QZ_BROWSER);
  return c.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
}
/* 打开一个独立应用窗口（没有地址栏和标签页）；档案目录单独放，所以同一档案的窗口都属于千章 */
function openWindow(url) {
  const exe = findBrowser();
  if (!exe) {
    alert('没有找到 Microsoft Edge 或 Google Chrome，千章将用默认浏览器打开。\n\n这种方式下关掉网页不会退出千章：要退出，请点页面左下角的「退出千章」，或右下角托盘里千章图标 → 退出千章。\n\n装上 Edge 或 Chrome 后，千章会用独立窗口打开，关窗即退出。', true);
    useDefaultBrowser(url, '没找到 Edge/Chrome'); return null;
  }
  log('打开窗口', exe);
  /* 关掉“窗口关了还在后台运行”，否则窗口关闭后浏览器进程不退，千章也就不退 */
  try { fs.mkdirSync(profile, { recursive: true }); const ls = path.join(profile, 'Local State'); let st = {}; try { st = JSON.parse(fs.readFileSync(ls, 'utf8')); } catch (e) {}
    if (!st.background_mode || st.background_mode.enabled !== false) { st.background_mode = { enabled: false }; fs.writeFileSync(ls, JSON.stringify(st)); } } catch (e) { log('写窗口设置失败', e); }
  return spawn(exe, ['--app=' + url, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-features=Translate', '--window-size=1320,880'], { detached: false, stdio: 'ignore' });
}
/* 还有没有用千章档案的浏览器进程（窗口可能交给了已在运行的同档案进程） */
function windowAlive() {
  return new Promise(ok => execFile('powershell', ['-NoProfile', '-Command', "@(Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' or Name='chrome.exe'\" | ? { $_.CommandLine -and $_.CommandLine.Contains($env:QZ_PROFILE) }).Count"],
    { windowsHide: true, env: Object.assign({}, process.env, { QZ_PROFILE: profile }) }, (e, out) => ok(e ? true : +String(out).trim() > 0)));
}
let lowIL = false;
async function watchAndExit(child) {
  if (!child) { log('默认浏览器模式：关页面不会退出，用托盘或页面里的「退出千章」'); return; }
  const stop = () => { if (global.__qzMode === 'browser') { log('窗口关了，但页面在默认浏览器里，继续运行'); return; } log('窗口已关闭，退出'); try { fs.unlinkSync(lockFile); } catch (e) {} setTimeout(() => process.exit(0), 300); };
  child.on('exit', async () => { /* 宽限：连续两次（约 6 秒）都没有千章窗口才退出 */
    let miss = 0;
    const tick = async () => { if (await windowAlive()) { miss = 0; } else if (++miss >= 2) return stop(); setTimeout(tick, 3000); };
    setTimeout(tick, 1500);
  });
}
(async () => {
  for (const rel of list) {
    if (/^data\//.test(rel)) continue; /* 保险：数据从不随程序解压 */
    const out = path.join(root, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(sea.getAsset(rel)));
  }
  /* 低完整性运行（exe 所在目录带低完整性标记）时浏览器页面会空白：提示原因 */
  try { const g = require('child_process').execFileSync('whoami', ['/groups'], { windowsHide: true, encoding: 'utf8' });
    if (/S-1-16-4096/.test(g)) { log('以低完整性运行'); lowIL = true; } } catch (e) {}
  /* 单实例：已经在运行就只再开（或聚焦）一个窗口 */
  try { const old = JSON.parse(fs.readFileSync(lockFile, 'utf8')); if (old.port && await ping(old.port)) { log('已在运行，打开窗口', old.port); const u = 'http://127.0.0.1:' + old.port + '/workspace/', b = findBrowser();
    if (b) openWindow(u); else openDefault(u); setTimeout(() => process.exit(0), b ? 4000 : 1500); return; } } catch (e) {}
  /* 端口：7801 常被开发用的服务占着，程序从 7811 起找空闲端口，不和它抢 */
  let port = +process.env.QZ_PORT || 7811;
  while (port < 7860 && !(await free(port))) port++;
  process.env.PORT = String(port);
  process.argv[2] = root;
  process.argv[3] = String(port);
  /* 记下页面脚本是否真的跑起来了（会请求 /api/）：窗口打开了却一直没有请求，说明页面没能运行，改用默认浏览器 */
  let lastApi = 0;
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (ev, req) { if (ev === 'request' && req && /^\/api\/(projects|project)/.test(req.url || '')) lastApi = Date.now(); return emit.apply(this, arguments); };
  global.__qzApiSeen = () => lastApi;
  const main = path.join(root, 'server', 'server.js');
  createRequire(main)(main);
  for (let i = 0; i < 40 && !(await ping(port)); i++) await new Promise(r => setTimeout(r, 100));
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, port }));
  const url = 'http://127.0.0.1:' + port + '/workspace/';
  log('千章已启动', url, '作品目录', path.join(dataDir, 'projects'));
  if (process.env.QZ_NO_BROWSER) return;
  if (lowIL) { alert('千章所在的文件夹被标记为“低完整性”，在这里运行时浏览器窗口会是空白的。\n请把 Qianzhang.exe 连同 data 文件夹复制到别的位置再打开，或在该目录运行：icacls Qianzhang.exe /setintegritylevel M\n日志：' + logFile, true); }
  const t0 = Date.now(), child = winChild = openWindow(url);
  if (!child) return watchAndExit(null);
  setTimeout(() => { if (global.__qzApiSeen() < t0) useDefaultBrowser(url, '应用窗口里的页面没有运行（可能被安全软件拦截）'); }, 20000);
  watchAndExit(child);
})().catch(e => { log('启动失败', e); alert('千章启动失败：' + (e && e.message) + '\n日志：' + logFile); });
