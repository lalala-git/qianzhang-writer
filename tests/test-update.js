#!/usr/bin/env node
/* 新版本提醒：版本号比较、只开本项目的发布地址、本地服务的 /api/update 与 /api/open-release（用本机假 GitHub 验证）、
 * 设置里关掉后完全不联网、失败静默、页面与中英文词典都接好了；版本号在各处一致 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const R = path.join(__dirname, '..');
const U = require('../server/update.js');

/* ---- 版本号 ---- */
assert.equal(U.compare('v1.2.0', '1.1.0'), 1);
assert.equal(U.compare('1.1.0', 'v1.1.0'), 0);
assert.equal(U.compare('1.0.9', '1.1.0'), -1);
assert.equal(U.compare('1.10.0', '1.9.0'), 1, '按数字而不是按字符串比较');
assert.equal(U.compare('2.0.0', '1.99.99'), 1);
for (const bad of ['', null, undefined, 'latest', '1.2', '1.2.3.4', '1.2.0-beta', 'v1.x.0']) assert.equal(U.compare(bad, '1.1.0'), null, String(bad) + ' 不应被当成新版本');
const pkg = JSON.parse(fs.readFileSync(path.join(R, 'package.json'), 'utf8'));
assert.equal(pkg.version, U.VERSION, 'package.json 与 server/update.js 的版本号应一致');
assert.ok(!('license' in pkg), 'package.json 不写许可证字段');
assert.ok(new RegExp('^## \\[' + U.VERSION.replace(/\./g, '\\.') + '\\]', 'm').test(fs.readFileSync(path.join(R, 'CHANGELOG.md'), 'utf8')), 'CHANGELOG 应有当前版本的条目');
assert.ok(/'file-version': V, 'product-version': V/.test(fs.readFileSync(path.join(R, 'tools', 'pack', 'build.js'), 'utf8')) && /require\('\.\.\/\.\.\/server\/update\.js'\)\.VERSION/.test(fs.readFileSync(path.join(R, 'tools', 'pack', 'build.js'), 'utf8')), '打包写入的文件版本应取自同一个版本号');

/* ---- 只能打开本项目的发布页面 ---- */
const LATEST = 'https://github.com/lalala-git/qianzhang-writer/releases/latest';
assert.equal(U.releaseUrl('https://github.com/lalala-git/qianzhang-writer/releases/tag/v1.2.0'), 'https://github.com/lalala-git/qianzhang-writer/releases/tag/v1.2.0');
for (const bad of ['http://github.com/lalala-git/qianzhang-writer/releases/latest', 'https://evil.example/', 'https://github.com/other/repo/releases/latest', 'https://github.com/lalala-git/qianzhang-writer/releases/x&calc', 'https://github.com/lalala-git/qianzhang-writer/releases/ x', 'file:///C:/Windows/System32/calc.exe', 5, null, undefined, '']) assert.equal(U.releaseUrl(bad), LATEST, String(bad));

/* ---- 页面接线 ---- */
const A = fs.readFileSync(path.join(R, 'ui', 'app.js'), 'utf8'), S = fs.readFileSync(path.join(R, 'ui', 'page-settings.js'), 'utf8'), ST = fs.readFileSync(path.join(R, 'core', 'storage.js'), 'utf8');
assert.ok(/id="qz-update" hidden/.test(A) && /a === 'update-open'/.test(A) && /a === 'update-hide'/.test(A), '侧栏应有默认隐藏的新版本提示');
assert.ok(/attachKeys: function \(\) \{\s*this\.renderQuit\(\); this\.checkUpdate\(\);/.test(A), '连上本地服务后应在后台检查');
assert.ok(/qianzhang:update-check/.test(A) && /qianzhang:update-check/.test(S), '设置里应能关掉');
assert.ok(/settings\.updateNow/.test(S) && /settings\.updateToggle/.test(S));
assert.ok(/openRelease/.test(ST) && /\/update/.test(ST));
const ctx = { document: { documentElement: { lang:'zh-CN' }, addEventListener() {}, title:'' }, MutationObserver: function () { this.observe = () => {}; }, location: { reload() {} } };
ctx.window = ctx; ctx.self = ctx; vm.runInNewContext(fs.readFileSync(path.join(R, 'ui', 'i18n.js'), 'utf8'), ctx);
const need = ['有新版本', '点击打开下载页面（不会自动下载或替换程序）', '这个提醒先不显示', '没能打开下载页面', '版本与更新', '当前版本', '立即检查', '关闭新版本提醒', '开启新版本提醒', '新版本提醒已关闭', '检查中…', '没能完成检查（可能没有联网），可以稍后再试', '有新版本，点侧栏里的提示可打开下载页面', '已经是最新版本'];
for (const k of need) assert.ok(ctx.QZI18N.dict[k] && /[A-Za-z]/.test(ctx.QZI18N.dict[k]), '缺英文：' + k);
assert.ok(need.every(k => A.includes(k) || S.includes(k)), '词典里多了界面上没用到的词');
assert.ok(Object.keys(ctx.QZI18N.dict).filter(k => /^[\u4e00-\u9fa5]/.test(k) && need.includes(k)).length === need.length);

/* ---- 本地服务（假 GitHub） ---- */
function req(port, method, p, body, headers) {
  return new Promise((ok, no) => {
    const r = http.request({ host:'127.0.0.1', port, method, path:p, headers:Object.assign({ host:'127.0.0.1:' + port }, headers) }, res => {
      let s = ''; res.on('data', c => { s += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) {} ok({ status:res.statusCode, json:j }); });
    });
    r.on('error', no); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
async function startServer(tmp, name, env, bootstrap) {
  for (const d of ['core', 'ui', 'workspace']) fs.mkdirSync(path.join(tmp, 'srv', d), { recursive:true });
  const server = path.join(R, 'server', 'server.js');
  const child = spawn(process.execPath, ['-e', (bootstrap || '') + '; require(process.argv[1]);', server, path.join(tmp, 'srv'), '0'], { stdio:['ignore', 'pipe', 'pipe'], env:Object.assign({}, process.env, { QZ_DATA:path.join(tmp, name), PORT:'' }, env) });
  let out = '', timer; child.stdout.on('data', c => { out += c; });
  const port = await new Promise((ok, no) => { child.stdout.on('data', () => { const m = /127\.0\.0\.1:(\d+)/.exec(out); if (m) ok(+m[1]); }); timer = setTimeout(() => no(new Error('server 没启动')), 10000); });
  clearTimeout(timer);
  const p = (await req(port, 'GET', '/api/ping')).json;
  const H = { origin:'http://127.0.0.1:' + port, 'content-type':'application/json', 'x-qianzhang-token':p.token };
  return { child, port, ping:p, H, stop: () => new Promise(r => { child.once('exit', r); child.kill(); }) };
}
function fakeGithub(handler) {
  const hits = [];
  const srv = http.createServer((q, r) => { hits.push(q.url); handler(q, r); });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, hits, url:'http://127.0.0.1:' + srv.address().port + '/latest', close:() => new Promise(c => srv.close(c)) })));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const scratch = path.resolve(R, '.test-tmp'); fs.mkdirSync(scratch, { recursive:true });
  const tmp = fs.mkdtempSync(path.join(scratch, 'qianzhang-update-'));
  const opened = path.join(tmp, 'opened.txt');
  const boot = "global.__qzOpenUrl = u => require('fs').appendFileSync(" + JSON.stringify(opened) + ", u + '\\n')";
  let tag = 'v9.9.9';
  const gh = await fakeGithub((q, r) => { r.writeHead(200, { 'content-type':'application/json' }); r.end(JSON.stringify({ tag_name:tag, html_url:'https://github.com/lalala-git/qianzhang-writer/releases/tag/' + tag, body:'notes' })); });
  try {
    /* 有新版本 */
    let s = await startServer(tmp, 'd1', { QZ_UPDATE_URL:gh.url }, boot);
    try {
      assert.equal(s.ping.version, U.VERSION, 'ping 应报告版本号');
      assert.equal((await req(s.port, 'POST', '/api/update', {}, { origin:'http://127.0.0.1:' + s.port, 'content-type':'application/json' })).status, 403, '没令牌不能问');
      assert.equal((await req(s.port, 'POST', '/api/update', {}, Object.assign({}, s.H, { origin:'http://evil.example' }))).status, 403, '别的来源不能问');
      assert.equal(gh.hits.length, 0, '没授权的请求不会联网');
      let r = (await req(s.port, 'POST', '/api/update', {}, s.H)).json;
      assert.deepEqual([r.ok, r.newer, r.latest, r.current, r.url], [true, true, '9.9.9', U.VERSION, 'https://github.com/lalala-git/qianzhang-writer/releases/tag/v9.9.9']);
      await req(s.port, 'POST', '/api/update', {}, s.H);
      assert.equal(gh.hits.length, 1, '一段时间内重复查询用缓存，不反复联网');
      await req(s.port, 'POST', '/api/update', { force:true }, s.H);
      assert.equal(gh.hits.length, 2, '立即检查会重新联网');
      /* 打开发布页面：只会交给系统浏览器本项目的地址 */
      assert.equal((await req(s.port, 'POST', '/api/open-release', {}, { origin:'http://127.0.0.1:' + s.port, 'content-type':'application/json' })).status, 403);
      assert.equal(fs.existsSync(opened), false);
      await req(s.port, 'POST', '/api/open-release', { url:r.url }, s.H);
      await req(s.port, 'POST', '/api/open-release', { url:'https://evil.example/x' }, s.H);
      await req(s.port, 'POST', '/api/open-release', { url:'https://github.com/lalala-git/qianzhang-writer/releases/x&calc' }, s.H);
      assert.deepEqual(fs.readFileSync(opened, 'utf8').trim().split('\n'), [r.url, LATEST, LATEST]);
      /* 已经是最新 / 比当前旧：不提醒 */
      tag = 'v' + U.VERSION; r = (await req(s.port, 'POST', '/api/update', { force:true }, s.H)).json; assert.equal(r.newer, false); assert.equal(r.failed, undefined);
      tag = 'v0.0.1'; r = (await req(s.port, 'POST', '/api/update', { force:true }, s.H)).json; assert.equal(r.newer, false);
      tag = 'nightly'; r = (await req(s.port, 'POST', '/api/update', { force:true }, s.H)).json; assert.deepEqual([r.newer, r.failed], [false, true], '看不懂的版本号：静默当作没有');
      tag = 'v9.9.9';
    } finally { await s.stop(); }

    /* 在设置里关掉（环境变量对应的是测试和管理员用的总开关；页面里的开关则让页面根本不发 /api/update） */
    const before = gh.hits.length;
    s = await startServer(tmp, 'd2', { QZ_UPDATE_URL:gh.url, QZ_UPDATE_CHECK:'off' });
    try {
      const r = (await req(s.port, 'POST', '/api/update', { force:true }, s.H)).json;
      assert.deepEqual([r.newer, r.disabled], [false, true]);
      assert.equal(gh.hits.length, before, '关闭后不联网');
    } finally { await s.stop(); }

    /* 失败：服务器报错、返回乱码、连不上、很慢都静默 */
    const bad = await fakeGithub((q, r) => { r.writeHead(500); r.end('oops'); });
    const junk = await fakeGithub((q, r) => { r.writeHead(200); r.end('<html>not json'); });
    const dead = await fakeGithub(() => {}); const deadUrl = dead.url; await dead.close();
    for (const [label, url] of [['500', bad.url], ['乱码', junk.url], ['连不上', deadUrl]]) {
      s = await startServer(tmp, 'd3', { QZ_UPDATE_URL:url });
      try {
        const t0 = Date.now(); const resp = await req(s.port, 'POST', '/api/update', { force:true }, s.H);
        assert.equal(resp.status, 200, label); assert.deepEqual([resp.json.ok, resp.json.newer, resp.json.failed], [true, false, true], label);
        assert.ok(Date.now() - t0 < 5000, label + ' 不应卡住');
      } finally { await s.stop(); }
    }
    await bad.close(); await junk.close();
    await gh.close();
    console.log('test-update: 全部通过');
  } finally { try { await gh.close(); } catch (e) {} fs.rmSync(tmp, { recursive:true, force:true }); }
})().catch(e => { console.error(e); process.exit(1); });
