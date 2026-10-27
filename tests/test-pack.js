#!/usr/bin/env node
/* exe 打包：清单里不含作品/备份；服务端 QZ_DATA 指向外部 data 目录时能列出已有的书，且不往程序目录写数据 */
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { files, SKIP } = require('../tools/pack/build.js');
assert.ok(files.includes('server/server.js') && files.includes('workspace/index.html'));
assert.ok(!files.some(f => /(^|\/)(data|backups?|\.backup)\//i.test(f) || /\.bak$/i.test(f)), 'exe 清单混入数据');
for (const f of ['data/projects/a.json', 'examples/backup/x.json', 'ui/x.bak', 'server/a.log']) assert.ok(SKIP.test(f), f);
assert.ok(!SKIP.test('ui/app.js'));
/* launcher 里的选目录逻辑：从仓库 dist 运行 → 仓库 data */
const L = fs.readFileSync(path.join(__dirname, '..', 'tools', 'pack', 'launcher.js'), 'utf8');
assert.ok(/basename\(exeDir\)\.toLowerCase\(\) === 'dist'/.test(L) && /path\.join\(repo, 'data'\)/.test(L) && /process\.env\.QZ_DATA = dataDir/.test(L));
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-pack-')), app = path.join(tmp, 'app'), data = path.join(tmp, 'repo-data');
  fs.mkdirSync(path.join(app, 'workspace'), { recursive: true }); fs.writeFileSync(path.join(app, 'workspace', 'index.html'), 'x');
  fs.mkdirSync(path.join(data, 'projects'), { recursive: true });
  const book = { project_id:'my-old-book', format_version:1, meta:{ title:'老书' }, nodes:[], relations:[] };
  fs.writeFileSync(path.join(data, 'projects', 'my-old-book.json'), JSON.stringify(book));
  const before = fs.readFileSync(path.join(data, 'projects', 'my-old-book.json'), 'utf8');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js'), app, '0'], { stdio:['ignore', 'pipe', 'pipe'], env:Object.assign({}, process.env, { QZ_DATA:data }) });
  try {
    const port = await new Promise((ok, no) => { let o = ''; const t = setTimeout(() => no(new Error('timeout')), 5000); child.stdout.on('data', c => { o += c; const m = o.match(/127\.0\.0\.1:(\d+)/); if (m) { clearTimeout(t); ok(m[1]); } }); });
    const r = await (await fetch('http://127.0.0.1:' + port + '/api/projects')).json();
    const list = r.projects || r.list || r;
    assert.ok(JSON.stringify(list).includes('my-old-book'), JSON.stringify(r));
    assert.ok(!fs.existsSync(path.join(app, 'data')), '不应在程序目录建 data');
    assert.strictEqual(fs.readFileSync(path.join(data, 'projects', 'my-old-book.json'), 'utf8'), before);
    console.log('打包与数据目录测试通过');
  } finally { child.kill(); fs.rmSync(tmp, { recursive:true, force:true }); }
})().catch(e => { console.error(e); process.exit(1); });
/* PE 子系统改成图形界面（用一个最小的假 PE 头测试） */
{
  const { guiSubsystem } = require('../tools/pack/build.js');
  const f = path.join(os.tmpdir(), 'qz-pe-' + process.pid + '.bin'), b = Buffer.alloc(512);
  b.writeUInt32LE(0x80, 0x3c); b.writeUInt32LE(0x4550, 0x80); b.writeUInt16LE(3, 0x80 + 24 + 68); fs.writeFileSync(f, b);
  assert.strictEqual(guiSubsystem(f), 3); assert.strictEqual(fs.readFileSync(f).readUInt16LE(0x80 + 24 + 68), 2); fs.unlinkSync(f);
  assert.ok(/--app=/.test(L) && /--user-data-dir=/.test(L) && /instance\.json/.test(L) && /7811/.test(L), '启动器应开独立窗口、单实例、避开 7801');
}
