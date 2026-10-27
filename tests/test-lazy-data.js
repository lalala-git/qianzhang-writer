// 全新安装：服务启动、列书架都不该建出空的 data/projects；第一次保存才建
const assert = require('node:assert'), { spawn } = require('node:child_process'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-lazy-')), data = path.join(tmp, 'data');
const srv = spawn(process.execPath, [path.join(root, 'server', 'server.js'), root, '0'], { env:Object.assign({}, process.env, { QZ_DATA:data, PORT:'' }), stdio:['ignore', 'pipe', 'pipe'] });
const done = (e) => { srv.kill(); fs.rmSync(tmp, { recursive:true, force:true }); if (e) { console.error(e); process.exit(1); } console.log('首次保存才建作品目录：通过'); };
let out = '';
srv.stdout.on('data', async c => { out += c; const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (!m || done.started) return; done.started = 1;
  try { const base = m[0].replace(/\/$/, '');
    const l = await (await fetch(base + '/api/projects')).json(); assert.deepStrictEqual(l, { ok:true, projects:[] });
    const g = await fetch(base + '/api/project?projectId=workspace'); await g.text();
    assert.ok(!fs.existsSync(path.join(data, 'projects')), '只读请求建出了 data/projects');
    const { token } = await (await fetch(base + '/api/ping')).json();
    const body = JSON.stringify({ projectId:'t1', data:{ meta:{ title:'对照' }, chapters:[] }, project:{ meta:{ title:'对照' }, chapters:[] } });
    await (await fetch(base + '/api/project', { method:'POST', headers:{ 'content-type':'application/json', 'x-qz-token':token, 'x-token':token }, body })).text();
    done();
  } catch (e) { done(e); } });
setTimeout(() => done(new Error('服务没起来：' + out)), 8000).unref();
