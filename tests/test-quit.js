#!/usr/bin/env node
/* 桌面程序退出：/api/quit 需要令牌、源码运行时不可用；由 exe 启动时 ping 报告 app/mode，退出请求会调用启动器注册的退出函数；
 * 启动器：没有 Edge/Chrome 时弹提示并改用默认浏览器，默认浏览器模式有托盘「退出千章」，不再让用户去任务管理器 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const L = fs.readFileSync(path.join(__dirname, '..', 'tools', 'pack', 'launcher.js'), 'utf8');
assert.ok(/global\.__qzQuit = function/.test(L) && /global\.__qzMode = 'window'/.test(L), '启动器应注册退出函数和模式');
assert.ok(/if \(!exe\) \{\s*alert\('没有找到 Microsoft Edge 或 Google Chrome/.test(L) && /useDefaultBrowser\(url, '没找到 Edge\/Chrome'\)/.test(L), '没有浏览器时应提示并改用默认浏览器');
assert.ok(/NotifyIcon/.test(L) && /'退出千章'/.test(L) && /cmd === 'quit'/.test(L), '默认浏览器模式应有托盘退出');
assert.ok(/E\.QZ_BROWSER === 'none'\) return undefined/.test(L), '应能模拟没有浏览器来测试');
assert.ok(!/任务管理器/.test(L), '不应再让用户去任务管理器');
const A = fs.readFileSync(path.join(__dirname, '..', 'ui', 'app.js'), 'utf8');
assert.ok(/id="qz-quit" hidden/.test(A) && /a === 'quit'/.test(A), '页面应有默认隐藏的退出按钮');

function req(port, method, p, body, headers) {
  return new Promise((ok, no) => {
    const r = http.request({ host:'127.0.0.1', port, method, path:p, headers:Object.assign({ host:'127.0.0.1:' + port }, headers) }, res => {
      let s = ''; res.on('data', c => { s += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) {} ok({ status:res.statusCode, json:j }); });
    });
    r.on('error', no); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
async function start(root, data, bootstrap) {
  const server = path.join(__dirname, '..', 'server', 'server.js');
  const args = bootstrap ? ['-e', bootstrap + '; require(process.argv[1]);', server, root, '0'] : [server, root, '0'];
  const child = spawn(process.execPath, args, { stdio:['ignore', 'pipe', 'pipe'], env:Object.assign({}, process.env, { QZ_DATA:data }) });
  let out = '', timer; child.stdout.on('data', c => { out += c; });
  const port = await new Promise((ok, no) => { child.stdout.on('data', () => { const m = /127\.0\.0\.1:(\d+)/.exec(out); if (m) ok(+m[1]); }); timer = setTimeout(() => no(new Error('server 没启动')), 10000); });
  clearTimeout(timer);
  return { child, port, out:() => out, exited:new Promise(r => child.on('exit', code => r(code))) };
}
(async () => {
  const scratch = path.resolve(__dirname, '..', '.test-tmp'); fs.mkdirSync(scratch, { recursive:true });
  const tmp = fs.mkdtempSync(path.join(scratch, 'qianzhang-quit-'));
  for (const d of ['core', 'ui', 'workspace']) fs.mkdirSync(path.join(tmp, 'srv', d), { recursive:true });
  try {
    /* 源码运行：没有退出函数 */
    let s = await start(path.join(tmp, 'srv'), path.join(tmp, 'd1'));
    try {
      const p = (await req(s.port, 'GET', '/api/ping')).json; assert.equal(p.app, false); assert.equal(p.mode, null);
      const H = { origin:'http://127.0.0.1:' + s.port, 'content-type':'application/json' };
      assert.equal((await req(s.port, 'POST', '/api/quit', {}, H)).status, 403, '没令牌不能退出');
      assert.equal((await req(s.port, 'POST', '/api/quit', {}, Object.assign({ 'x-qianzhang-token':p.token }, H))).status, 404, '源码运行不提供退出');
    } finally { s.child.kill(); await s.exited; }
    /* exe 启动：启动器注册了退出函数 */
    s = await start(path.join(tmp, 'srv'), path.join(tmp, 'd2'), "global.__qzMode = 'browser'; global.__qzQuit = from => { console.log('QUIT:' + from); setTimeout(() => process.exit(0), 50); }");
    const p = (await req(s.port, 'GET', '/api/ping')).json; assert.equal(p.app, true); assert.equal(p.mode, 'browser');
    const H = { origin:'http://127.0.0.1:' + s.port, 'content-type':'application/json' };
    assert.equal((await req(s.port, 'POST', '/api/quit', {}, Object.assign({}, H, { origin:'http://evil.example', 'x-qianzhang-token':p.token }))).status, 403, '别的来源不能退出');
    const r = await req(s.port, 'POST', '/api/quit', {}, Object.assign({ 'x-qianzhang-token':p.token }, H)); assert.equal(r.status, 200);
    const code = await Promise.race([s.exited, new Promise(x => setTimeout(() => x('timeout'), 5000))]);
    if (code === 'timeout') { s.child.kill(); assert.fail('退出请求后服务没有结束'); }
    assert.ok(/QUIT:page/.test(s.out()), s.out());
    console.log('test-quit: 全部通过');
  } finally { fs.rmSync(tmp, { recursive:true, force:true }); }
})().catch(e => { console.error(e); process.exit(1); });
