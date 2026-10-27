'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { once } = require('node:events');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const noRev = o => { delete o._rev; delete o._by; return o; };
async function run() {
  const scratch = path.resolve(__dirname, '..', '.test-tmp');
  fs.mkdirSync(scratch, { recursive:true });
  const root = fs.mkdtempSync(path.join(scratch, 'qianzhang-server-'));
  for (const d of ['examples', 'core', 'ui', 'workspace']) fs.mkdirSync(path.join(root, d));
  fs.writeFileSync(path.join(root, 'examples', 'old-sample.json'), '{"nodes":[]}');
  fs.writeFileSync(path.join(root, 'ui', 'notes.txt'), 'x');
  fs.writeFileSync(path.join(root, 'workspace', 'index.html'), '<h1>my workspace</h1>');
  fs.writeFileSync(path.join(root, 'core', 'store.js'), '');
  fs.writeFileSync(path.join(root, 'ui', 'style.css'), '');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'private');
  // 故障只注入此测试子进程，既不新增脚本文件，也不接触真实项目。
  const bootstrap = [
    "const fs = require('node:fs'), path = require('node:path');",
    "const rename = fs.renameSync, write = fs.writeFileSync;",
    "Date.now = () => 1700000000000;", // 确定复现同毫秒备份碰撞
    "fs.renameSync = function(from, to) {",
    "  if (path.basename(to) === 'atomic.json' && JSON.parse(fs.readFileSync(from, 'utf8')).failRename)",
    "    throw new Error('fixture rename failure');",
    "  return rename.apply(this, arguments);",
    "};",
    "fs.writeFileSync = function(target, content, options) {",
    "  if (typeof content === 'string' && content.includes('\"failWrite\": true')) {",
    "    write.call(this, target, content.slice(0, 10), options);",
    "    throw new Error('fixture partial write failure');",
    "  }",
    "  return write.apply(this, arguments);",
    "};",
    "require(process.argv[1]);",
  ].join('\n');
  const child = spawn(process.execPath, ['-e', bootstrap, path.join(__dirname, '..', 'server', 'server.js'), root, '0'],
    { stdio:['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  let serverErrors = '';
  child.stderr.on('data', chunk => { serverErrors += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('server startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        output += chunk;
        const m = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
        if (m) { clearTimeout(timeout); resolve(Number(m[1])); }
      });
      child.on('exit', code => { clearTimeout(timeout); reject(new Error('server exited ' + code + ': ' + serverErrors)); });
    });
    const base = 'http://127.0.0.1:' + port;
    for (const entry of ['/', '/index.html']) {
      const response = await fetch(base + entry);
      assert.equal(response.url, base + '/workspace/');
      assert.equal(await response.text(), '<h1>my workspace</h1>');
    }
    assert.equal((await fetch(base + '/examples/old-sample.json')).status, 404); // 不再公开 examples 目录
    assert.equal((await fetch(base + '/ui/notes.txt')).status, 404);
    assert.equal((await fetch(base + '/workspace/index.html')).status, 200);
    assert.equal((await fetch(base + '/core/store.js')).status, 200);
    assert.equal((await fetch(base + '/ui/style.css')).status, 200);
    assert.equal((await fetch(base + '/ui/style/api/ping')).status, 404);
    assert.equal((await fetch(base + '/secret.txt')).status, 404);
    assert.equal((await fetch(base + '/.git/config')).status, 404);
    let symlinkChecked = false;
    try {
      fs.symlinkSync(path.join(root, 'secret.txt'), path.join(root, 'ui', 'leak.css'), 'file');
      symlinkChecked = true;
      assert.equal((await fetch(base + '/ui/leak.css')).status, 404);
    } catch (e) {
      if (symlinkChecked) throw e;
    }
    const hostileHostStatus = await new Promise((resolve, reject) => {
      http.get({ hostname:'127.0.0.1', port, path:'/api/ping',
        headers:{ Host:'attacker.invalid' } }, res => { res.resume(); resolve(res.statusCode); })
        .on('error', reject);
    });
    assert.equal(hostileHostStatus, 403);
    const ping = await (await fetch(base + '/api/ping')).json();
    assert.equal(ping.ok, true);
    assert.equal(typeof ping.token, 'string');
    const content = { project_id:'minimal', nodes:[], relations:[], manuscript:{ files:[], facts:[] } };
    const body = JSON.stringify({ projectId:'minimal', content });
    const headers = { 'Content-Type':'application/json', 'X-Qianzhang-Token':ping.token };
    assert.equal((await fetch(base + '/api/save', { method:'POST', headers, body })).status, 403);
    assert.equal((await fetch(base + '/api/save', { method:'POST', headers:{ ...headers, Origin:'http://attacker.invalid' }, body })).status, 403);
    const saved = await fetch(base + '/api/save', { method:'POST', headers:{ ...headers, Origin:base }, body });
    assert.equal(saved.status, 200);
    assert.equal(fs.existsSync(path.join(root, 'data', 'projects', 'minimal.json')), true);
    { const got = await (await fetch(base + '/api/project?projectId=minimal')).json(); assert.equal(got._rev, 1, '保存会带上版本号'); delete got._rev; assert.deepEqual(got, content); }
    const dotted = { project_id:'new.book', nodes:[], relations:[] };
    assert.equal((await fetch(base + '/api/save', { method:'POST',
      headers:{ ...headers, Origin:base },
      body:JSON.stringify({ projectId:'new.book', content:dotted }) })).status, 200);
    assert.deepEqual(noRev(await (await fetch(base + '/api/project?projectId=new.book')).json()), dotted);
    const post = async (projectId, data) => fetch(base + '/api/save', { method:'POST',
      headers:{ ...headers, Origin:base }, body:JSON.stringify({ projectId, content:data, baseRev:(() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'data', 'projects', projectId + '.json'), 'utf8'))._rev || 0; } catch (e) { return undefined; } })() }) });
    const projects = path.join(root, 'data', 'projects');
    const stable = { project_id:'atomic', nodes:[], relations:[], note:'original' };
    assert.equal((await post('atomic', stable)).status, 200);
    const original = fs.readFileSync(path.join(projects, 'atomic.json'), 'utf8');
    for (const fault of ['failRename', 'failWrite']) {
      const failed = await post('atomic', { ...stable, note:'must not replace original', [fault]:true });
      assert.equal(failed.status, 400);
      assert.match((await failed.json()).error, /fixture/);
      assert.equal(fs.readFileSync(path.join(projects, 'atomic.json'), 'utf8'), original);
      assert.equal(fs.readdirSync(projects).some(name => name.endsWith('.tmp')), false,
        '失败写入或替换之后不遗留含作者内容的临时文件');
    }
    assert.deepEqual(noRev(await (await fetch(base + '/api/project?projectId=atomic')).json()), stable);
    assert.equal((await post('atomic', { ...stable, note:'recovered' })).status, 200);
    // 固定 Date.now 保证备份同毫秒，不得覆盖之前的备份。
    const backups = path.join(projects, '.backup');
    const beforeBackups = fs.readdirSync(backups).filter(name => name.startsWith('minimal.') && !name.includes('.day-'));
    assert.equal((await post('minimal', { ...content, note:'second' })).status, 200);
    assert.equal((await post('minimal', { ...content, note:'third' })).status, 200);
    assert.equal(fs.readdirSync(backups).filter(name => name.startsWith('minimal.') && !name.includes('.day-')).length, beforeBackups.length + 2);
    assert.equal(fs.readdirSync(backups).filter(name => /^minimal[.]day-\d{4}-\d{2}-\d{2}[.]bak$/.test(name)).length, 1, '每天只留一份日备份');

    const sibling = { project_id:'queued.book', nodes:[], relations:[] };
    assert.equal((await post('queued.book', sibling)).status, 200);
    assert.equal((await post('queued.book', { ...sibling, note:'second' })).status, 200);
    const siblingBackups = fs.readdirSync(backups).filter(name => name.startsWith('queued.book.') && !name.includes('.day-'));
    assert.equal(siblingBackups.length, 1);

    // 作品列表：按修改时间倒序，带标题
    fs.writeFileSync(path.join(projects, 'titled.json'), JSON.stringify({ project_id:'titled', meta:{ title:'雾海' }, nodes:[], relations:[], chapters:[{ text:'一二 三' }] }));
    const listed = (await (await fetch(base + '/api/projects')).json()).projects;
    assert.ok(listed.some(x => x.id === 'titled' && x.title === '雾海' && x.words === 3));
    assert.ok(listed.some(x => x.id === 'minimal') && !listed.some(x => x.id.includes('backup')));

    // 前端存储层排队调用真实回环服务；不连接外网或真实项目。
    const Storage = require('../core/storage.js');
    const previous = global.fetch;
    global.fetch = (url, options) => previous(url, { ...options, headers:{ ...options && options.headers, Origin:base } });
    try {
      const store = new Storage({ apiBase:base + '/api', localStorage:null });
      assert.equal(await store.connect(), true);
      const results = await Promise.all(Array.from({ length:12 }, (_, version) =>
        store.save('queued', { project_id:'queued', nodes:[], relations:[], version })));
      assert.ok(results.every(r => r === 'server'));
      assert.equal((await store.load('queued')).version, 11);
      assert.equal(await store.load('nothing-here'), null);
      assert.ok((await store.list()).some(x => x.id === 'titled' && x.title === '雾海' && x.words === 3));
      assert.equal(fs.readdirSync(backups).filter(name => /^queued[.][0-9]+[.]/.test(name)).length, 10);
      assert.deepEqual(fs.readdirSync(backups).filter(name => name.startsWith('queued.book.') && !name.includes('.day-')), siblingBackups);
      assert.equal(fs.readdirSync(backups).filter(name => name.startsWith('queued.book.day-')).length, 1, '别的作品的日备份不受清理影响');
      assert.equal(fs.readdirSync(projects).some(name => name.endsWith('.tmp')), false);
    } finally { global.fetch = previous; }
    assert.equal((await fetch(base + '/api/project?projectId=..%2Fsecret')).status, 400);
    assert.equal((await fetch(base + '/data/projects/minimal.json')).status, 404);
    { // 回收站：删除→列出→恢复→再删→彻底删除
      const H = { ...headers, Origin:base }, T = b => fetch(base + '/api/trash', { method:'POST', headers:H, body:JSON.stringify(b) }).then(r => r.json());
      const tb = { project_id:'trashme', meta:{ title:'要删的书' }, nodes:[], relations:[] };
      assert.equal((await fetch(base + '/api/save', { method:'POST', headers:H, body:JSON.stringify({ projectId:'trashme', content:tb }) })).status, 200);
      const sv = b => fetch(base + '/api/save', { method:'POST', headers:H, body:JSON.stringify(b) });
      const r1 = await (await sv({ projectId:'trashme', content:tb, baseRev:1 })).json(); assert.equal(r1.rev, 2);
      assert.equal((await sv({ projectId:'trashme', content:tb, baseRev:1 })).status, 409, '基于旧版本的保存被拒，不覆盖');
      assert.equal((await sv({ projectId:'trashme', content:{ project_id:'trashme', nodes:[], relations:[] } })).status, 409, '没打开就保存（不带版本号）不能盖掉已有的书');
      { const a1 = await (await sv({ projectId:'trashme', content:tb, baseRev:2, client:'tabA' })).json(); assert.equal(a1.rev, 3);
        assert.equal((await sv({ projectId:'trashme', content:tb, baseRev:2, client:'tabA', unload:true })).status, 200, '同一窗口关页补存只落后一版时放行');
        assert.equal((await sv({ projectId:'trashme', content:tb, baseRev:3, client:'tabB', unload:true })).status, 409, '别的窗口仍然拦'); }
      assert.equal((await fetch(base + '/api/trash', { method:'POST', headers, body:JSON.stringify({ projectId:'trashme' }) })).status, 403, '回收站也要同源授权');
      assert.equal((await T({ projectId:'trashme' })).ok, true);
      assert.equal((await (await fetch(base + '/api/projects')).json()).projects.some(x => x.id === 'trashme'), false, '删除后不在书单');
      let items = (await (await fetch(base + '/api/trash')).json()).items; assert.equal(items[0].title, '要删的书');
      assert.equal((await T({ action:'restore', file:items[0].file })).projectId, 'trashme');
      assert.equal((await (await fetch(base + '/api/projects')).json()).projects.some(x => x.id === 'trashme'), true, '恢复后回到书单');
      await T({ projectId:'trashme' }); items = (await (await fetch(base + '/api/trash')).json()).items;
      assert.equal((await T({ action:'purge', file:'../x.json' })).ok, false);
      await T({ action:'purge', file:items[0].file }); assert.equal((await (await fetch(base + '/api/trash')).json()).items.length, 0);
    }
    console.log('本地服务：回收站、入口授权、原子写失败保全、临时清理、同毫秒备份、项目隔离及排队保存通过；符号链接测试' +
      (symlinkChecked ? '通过' : '未运行（系统不允许创建）'));
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    const resolved = fs.realpathSync(root);
    if (!resolved.startsWith(fs.realpathSync(scratch) + path.sep))
      throw new Error('temporary directory escaped its parent');
    fs.rmSync(resolved, { recursive:true, force:true });
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
