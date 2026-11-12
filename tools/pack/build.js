/*! 千章 · 打包成 Windows 单文件程序：node tools/pack/build.js [输出目录]
 *  1) 把 node.exe 和程序文件封装成本地服务 qianzhang-engine.exe（Node SEA）；
 *  2) 用 Windows 自带的 .NET Framework 编译器 csc.exe 编出窗口外壳 Qianzhang.exe（原生窗口 + WebView2），把本地服务和 WebView2 组件嵌进去。
 *  WebView2 SDK 只在打包时从 NuGet 临时下载固定版本，不进仓库依赖。设 QZ_PACK_EDGE=1 只出原来的浏览器窗口版。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const WEBVIEW2_SDK = '1.0.4078.44'; /* NuGet Microsoft.Web.WebView2，固定版本 */
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
  const exe = path.join(work, 'qianzhang-engine.exe'), final = path.join(out, 'Qianzhang.exe');
  const V = require('../../server/update.js').VERSION; /* 与 package.json、界面显示、发布版本同一个来源 */
  fs.copyFileSync(process.execPath, exe);
  const npmEnv = Object.assign({}, process.env, { npm_config_cache: path.join(work, 'npm-cache'), npm_config_update_notifier: 'false' });
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  /* 图标和版本信息（rcedit 只在打包时临时下载，不进仓库依赖）；必须在注入程序之前改资源 */
  try {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--prefix', path.join(work, 'rc'), '--no-save', '--no-audit', '--no-fund', 'rcedit@4.0.1'], { stdio: 'inherit', shell: true, env: npmEnv });
    const m = require(path.join(work, 'rc', 'node_modules', 'rcedit')), rcedit = m.rcedit || m.default || m;
    await rcedit(exe, { icon: path.join(__dirname, 'icon.ico'), 'file-version': V, 'product-version': V, 'version-string': { ProductName: '千章', FileDescription: '千章 · 网文写作台', CompanyName: '千章 contributors', OriginalFilename: 'Qianzhang.exe', InternalName: 'Qianzhang' } });
  } catch (e) { console.warn('设置图标失败（不影响使用）：' + e.message); }
  execFileSync(npx, ['--yes', 'postject@1.0.0-alpha.6', exe, 'NODE_SEA_BLOB', blob,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit', shell: true, env: npmEnv });
  guiSubsystem(exe); /* 不弹控制台窗口 */
  /* 有的目录（比如被沙箱工具处理过的）带“低完整性”继承标记，exe 会以低完整性运行，浏览器窗口打开后一片空白。
     给 exe 显式设成中等完整性（普通程序的默认级别） */
  let kind = 'WebView2 窗口版';
  if (process.env.QZ_PACK_EDGE) { fs.copyFileSync(exe, final); kind = '浏览器窗口版'; }
  else try { await buildHost(exe, final, V); } catch (e) { console.warn('WebView2 窗口外壳没打成（' + e.message + '），改为输出原来的浏览器窗口版'); fs.copyFileSync(exe, final); kind = '浏览器窗口版'; }
  if (process.platform === 'win32') try { execFileSync('icacls', [final, '/setintegritylevel', 'M'], { stdio: 'ignore' }); } catch (e) { console.warn('设置完整性级别失败：' + e.message); }
  fs.rmSync(work, { recursive: true, force: true });
  const bad = files.filter(f => /(^|\/)(data|backups?)\//i.test(f));
  if (bad.length) throw new Error('打包清单里混进了数据文件：' + bad.join(', '));
  console.log('已生成 ' + final + '（' + kind + '，' + files.length + ' 个程序文件，不含作品与备份）');
}
/* 窗口外壳：下载固定版本的 WebView2 SDK，用 csc.exe 编译 host/QianzhangHost.cs，把本地服务和 WebView2 组件作为资源嵌进去 */
async function buildHost(engine, exe, V) {
  const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (!fs.existsSync(csc)) throw new Error('找不到 .NET Framework 4 的 csc.exe');
  const pkg = path.join(work, 'webview2.nupkg'), dir = path.join(work, 'webview2');
  const url = 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/' + WEBVIEW2_SDK + '/microsoft.web.webview2.' + WEBVIEW2_SDK + '.nupkg';
  const r = await fetch(url); if (!r.ok) throw new Error('下载 WebView2 SDK 失败：' + r.status);
  fs.writeFileSync(pkg, Buffer.from(await r.arrayBuffer()));
  fs.mkdirSync(dir, { recursive: true }); execFileSync('tar', ['-xf', pkg, '-C', dir], { stdio: 'inherit' });
  const core = path.join(dir, 'lib', 'net462', 'Microsoft.Web.WebView2.Core.dll'), forms = path.join(dir, 'lib', 'net462', 'Microsoft.Web.WebView2.WinForms.dll'), loader = path.join(dir, 'runtimes', 'win-x64', 'native', 'WebView2Loader.dll');
  for (const f of [core, forms, loader]) if (!fs.existsSync(f)) throw new Error('WebView2 SDK 里缺少 ' + path.basename(f));
  const h = crypto.createHash('sha256'); for (const f of [engine, core, forms, loader]) h.update(fs.readFileSync(f));
  const id = V + '-' + h.digest('hex').slice(0, 12), v4 = (V.split('.').concat(['0', '0', '0', '0'])).slice(0, 4).join('.');
  const info = path.join(work, 'BuildInfo.cs');
  fs.writeFileSync(info, 'using System.Reflection;\n[assembly: AssemblyVersion("' + v4 + '")]\n[assembly: AssemblyFileVersion("' + v4 + '")]\n[assembly: AssemblyInformationalVersion("' + V + '")]\nstatic class BuildInfo { public const string Id = "' + id + '"; }\n');
  const host = path.join(__dirname, 'host');
  execFileSync(csc, ['/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001', '/out:' + exe,
    '/win32icon:' + path.join(__dirname, 'icon.ico'), '/win32manifest:' + path.join(host, 'app.manifest'),
    '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:' + core, '/r:' + forms,
    '/resource:' + engine + ',qz.qianzhang-engine.exe', '/resource:' + core + ',qz.Microsoft.Web.WebView2.Core.dll',
    '/resource:' + forms + ',qz.Microsoft.Web.WebView2.WinForms.dll', '/resource:' + loader + ',qz.WebView2Loader.dll', '/resource:' + path.join(__dirname, 'icon.ico') + ',qz.icon.ico',
    path.join(host, 'QianzhangHost.cs'), info], { stdio: 'inherit' });
}
