/*! 千章 · 打包成 Windows 单文件程序：node tools/pack/build.js [输出目录] */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const repo = path.resolve(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(repo, 'dist'));
const work = path.join(out, '.build');
const files = [];
const SKIP = /(^|\/)(data|projects|backups?|node_modules|dist)(\/|$)|\.(bak|backup|tmp|log)$|~$/i;
function add(dir) {
  for (const e of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.name.startsWith('.') || SKIP.test(rel)) continue; /* 作品、备份、临时文件不进 exe */
    if (e.isDirectory()) add(rel); else files.push(rel);
  }
}
['server', 'core', 'ui', 'workspace'].forEach(add);
/* 把 PE 头里的子系统从“控制台”(3) 改成“图形界面”(2)：双击时不再出现命令行窗口 */
function guiSubsystem(file) {
  const fd = fs.openSync(file, 'r+'), b = Buffer.alloc(2), h = Buffer.alloc(4);
  try {
    fs.readSync(fd, h, 0, 4, 0x3c); const pe = h.readUInt32LE(0);
    fs.readSync(fd, h, 0, 4, pe); if (h.readUInt32LE(0) !== 0x4550) throw new Error('不是 PE 文件');
    const at = pe + 24 + 68; fs.readSync(fd, b, 0, 2, at);
    const was = b.readUInt16LE(0); if (was !== 2 && was !== 3) throw new Error('子系统值异常 ' + was);
    b.writeUInt16LE(2, 0); fs.writeSync(fd, b, 0, 2, at); return was;
  } finally { fs.closeSync(fd); }
}
module.exports = { files, SKIP, guiSubsystem }; /* 测试只取文件清单，不打包 */
if (require.main === module) {
  if (process.platform !== 'win32' && !process.env.QZ_PACK_ANY) {
    console.error('tools/pack/build.js 只能在 Windows 上运行：它把当前的 node.exe 和程序文件封装成 Qianzhang.exe。\n在 Linux/macOS 上请直接运行 node server/server.js .（见 README）。');
    process.exit(1);
  }
  build().catch(e => { console.error(e); process.exit(1); });
}
async function build() {
  fs.mkdirSync(work, { recursive: true });
  const assets = { __list__: path.join(work, 'list.json') };
  fs.writeFileSync(assets.__list__, JSON.stringify(files));
  for (const f of files) assets[f] = path.join(repo, f);
  const blob = path.join(work, 'sea.blob');
  fs.writeFileSync(path.join(work, 'sea-config.json'), JSON.stringify({
    main: path.join(__dirname, 'launcher.js'), output: blob,
    disableExperimentalSEAWarning: true, useCodeCache: false, assets }));
  execFileSync(process.execPath, ['--experimental-sea-config', path.join(work, 'sea-config.json')], { stdio: 'inherit' });
  const exe = path.join(out, 'Qianzhang.exe');
  fs.copyFileSync(process.execPath, exe);
  const npmEnv = Object.assign({}, process.env, { npm_config_cache: path.join(work, 'npm-cache'), npm_config_update_notifier: 'false' });
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  /* 图标和版本信息（rcedit 只在打包时临时下载，不进仓库依赖）；必须在注入程序之前改资源 */
  try {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--prefix', path.join(work, 'rc'), '--no-save', '--no-audit', '--no-fund', 'rcedit@4.0.1'], { stdio: 'inherit', shell: true, env: npmEnv });
    const m = require(path.join(work, 'rc', 'node_modules', 'rcedit')), rcedit = m.rcedit || m.default || m;
    await rcedit(exe, { icon: path.join(__dirname, 'icon.ico'), 'version-string': { ProductName: '千章', FileDescription: '千章 · 网文写作台', CompanyName: '千章 contributors', OriginalFilename: 'Qianzhang.exe', InternalName: 'Qianzhang' } });
  } catch (e) { console.warn('设置图标失败（不影响使用）：' + e.message); }
  execFileSync(npx, ['--yes', 'postject@1.0.0-alpha.6', exe, 'NODE_SEA_BLOB', blob,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit', shell: true, env: npmEnv });
  guiSubsystem(exe); /* 不弹控制台窗口 */
  /* 有的目录（比如被沙箱工具处理过的）带“低完整性”继承标记，exe 会以低完整性运行，浏览器窗口打开后一片空白。
     给 exe 显式设成中等完整性（普通程序的默认级别） */
  if (process.platform === 'win32') try { execFileSync('icacls', [exe, '/setintegritylevel', 'M'], { stdio: 'ignore' }); } catch (e) { console.warn('设置完整性级别失败：' + e.message); }
  fs.rmSync(work, { recursive: true, force: true });
  const bad = files.filter(f => /(^|\/)(data|backups?)\//i.test(f));
  if (bad.length) throw new Error('打包清单里混进了数据文件：' + bad.join(', '));
  console.log('已生成 ' + exe + '（' + files.length + ' 个程序文件，不含作品与备份）');
}
