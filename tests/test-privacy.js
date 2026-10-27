#!/usr/bin/env node
/* 隐私：AI 密钥加密落盘（不进 localStorage）、旧明文密钥迁移后删除、/api/ai-key 需要令牌、备份默认去掉密钥 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { KeyStore, AES } = require('../server/keystore.js');
const AI = require('../core/ai.js');

const KEY = 'sk-test-0123456789abcdef';
function memStorage(init) { const v = Object.assign({}, init); return { getItem:k => Object.hasOwn(v, k) ? v[k] : null, setItem:(k, x) => { v[k] = String(x); }, removeItem:k => { delete v[k]; }, v }; }
function req(port, method, p, body, headers) {
  return new Promise((ok, no) => {
    const r = http.request({ host:'127.0.0.1', port, method, path:p, headers:Object.assign({ host:'127.0.0.1:' + port }, headers) }, res => {
      let s = ''; res.on('data', c => { s += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) {} ok({ status:res.statusCode, json:j }); });
    });
    r.on('error', no); if (body) r.write(JSON.stringify(body)); r.end();
  });
}

async function run() {
  const scratch = path.resolve(__dirname, '..', '.test-tmp'); fs.mkdirSync(scratch, { recursive:true });
  const tmp = fs.mkdtempSync(path.join(scratch, 'qianzhang-privacy-'));
  try {
    /* 1. AES 回退：文件里没有明文；能解回来；篡改后解不开 */
    const ks = new KeyStore(path.join(tmp, 'a'), { dpapi:false });
    assert.deepEqual(await ks.get(), { key:'', protection:null });
    const s1 = await ks.set(KEY);
    assert.equal(s1.protection, 'aes-256-gcm-machine');
    const raw = fs.readFileSync(ks.file, 'utf8');
    assert.ok(!raw.includes(KEY) && !raw.includes(Buffer.from(KEY).toString('base64')), '密钥文件不能含明文');
    assert.equal((await new KeyStore(path.join(tmp, 'a'), { dpapi:false }).get()).key, KEY, '新进程（无缓存）能解开');
    const rec = JSON.parse(raw); rec.data = Buffer.from('x' + Buffer.from(rec.data, 'base64').toString('latin1'), 'latin1').toString('base64');
    fs.writeFileSync(ks.file, JSON.stringify(rec));
    const bad = await new KeyStore(path.join(tmp, 'a'), { dpapi:false }).get();
    assert.ok(bad.error && bad.key === '', '篡改或换机后返回错误而不是乱码');
    await ks.clear(); assert.ok(!fs.existsSync(ks.file));
    assert.equal(AES.open(AES.seal('中文密钥')), '中文密钥');
    /* 2. Windows：DPAPI */
    if (process.platform === 'win32') {
      const kd = new KeyStore(path.join(tmp, 'd'));
      const r = await kd.set(KEY); assert.equal(r.protection, 'dpapi');
      assert.ok(!fs.readFileSync(kd.file, 'utf8').includes(KEY));
      assert.equal((await new KeyStore(path.join(tmp, 'd')).get()).key, KEY);
      console.log('  DPAPI 往返通过');
    } else console.log('  （非 Windows，跳过 DPAPI）');

    /* 3. 前端：保存不写 localStorage；旧明文密钥迁移到 vault 后删除 */
    const st = memStorage({ 'qianzhang:model': JSON.stringify({ preset:'custom', baseUrl:'https://api.example.com/v1', model:'m', apiKey:KEY }) });
    let stored = '';
    const vault = { get:() => Promise.resolve({ key:stored, protection:stored ? 'aes-256-gcm-machine' : null }), set:k => { stored = k; return Promise.resolve({ key:k, protection:'aes-256-gcm-machine' }); } };
    await AI.attachVault(vault, st);
    assert.equal(stored, KEY, '旧密钥搬进加密保存');
    assert.ok(!st.v['qianzhang:model'].includes(KEY), '迁移后 localStorage 里不再有密钥');
    assert.equal(AI.loadSettings(st).apiKey, KEY);
    assert.equal(AI.loadSettings(st).baseUrl, 'https://api.example.com/v1');
    await AI.saveSettings(Object.assign(AI.loadSettings(st), { apiKey:'sk-new' }), st);
    assert.equal(stored, 'sk-new'); assert.ok(!st.v['qianzhang:model'].includes('sk-'));
    assert.equal(AI.keyInfo().persistent, true);

    /* 4. 备份：默认去掉所有密钥字段；勾选后才带模型连接 */
    const data = { meta:{ title:'x' }, nodes:[{ id:'a', apiKey:'k1', extra:{ api_key:'k2', Authorization:'Bearer k3', note:'keep' } }], access_token:'k4' };
    const out = AI.backupData(data, null), js = JSON.stringify(out);
    assert.ok(!/k1|k2|k3|k4/.test(js), '默认备份不含密钥：' + js);
    assert.equal(out.nodes[0].extra.note, 'keep'); assert.equal(data.nodes[0].apiKey, 'k1', '不改原数据');
    assert.equal(out.qianzhang_model, undefined);
    const withKey = AI.backupData(data, { preset:'custom', baseUrl:'u', model:'m', temperature:0.5, apiKey:'sk-x' });
    assert.equal(withKey.qianzhang_model.apiKey, 'sk-x');

    /* 5. 本地服务 /api/ai-key：没令牌 403；带令牌能存取；落盘不是明文 */
    for (const d of ['core', 'ui', 'workspace']) fs.mkdirSync(path.join(tmp, 'srv', d), { recursive:true });
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js'), path.join(tmp, 'srv'), '0'],
      { stdio:['ignore', 'pipe', 'pipe'], env:Object.assign({}, process.env, { QZ_DATA:path.join(tmp, 'srv-data') }) });
    const exited = once(child, 'exit');
    try {
      let out2 = ''; let timer; const port = await new Promise((ok, no) => { child.stdout.on('data', c => { out2 += c; const m = /127\.0\.0\.1:(\d+)/.exec(out2); if (m) ok(+m[1]); }); timer = setTimeout(() => no(new Error('server 没启动')), 10000); }); clearTimeout(timer);
      const ping = await req(port, 'GET', '/api/ping'); const token = ping.json.token;
      const H = { origin:'http://127.0.0.1:' + port, 'content-type':'application/json' };
      assert.equal((await req(port, 'POST', '/api/ai-key', { action:'get' }, H)).status, 403, '没令牌不能读');
      assert.equal((await req(port, 'POST', '/api/ai-key', { action:'get' }, Object.assign({}, H, { origin:'http://evil.example', 'x-qianzhang-token':token }))).status, 403, '别的来源不能读');
      const T = Object.assign({}, H, { 'x-qianzhang-token':token });
      assert.equal((await req(port, 'POST', '/api/ai-key', { action:'set', key:KEY }, T)).json.ok, true);
      assert.equal((await req(port, 'POST', '/api/ai-key', { action:'get' }, T)).json.key, KEY);
      const f = path.join(tmp, 'srv-data', 'app', 'ai-key.json');
      assert.ok(fs.existsSync(f) && !fs.readFileSync(f, 'utf8').includes(KEY));
      await req(port, 'POST', '/api/ai-key', { action:'clear' }, T); assert.ok(!fs.existsSync(f));
    } finally { child.kill(); await exited; }
    console.log('test-privacy: 全部通过');
  } finally { fs.rmSync(tmp, { recursive:true, force:true }); }
}
run().catch(e => { console.error(e); process.exit(1); });
