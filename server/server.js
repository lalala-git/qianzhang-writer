#!/usr/bin/env node
/*! 千章 · local static server and project saves */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = fs.realpathSync(path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.cwd()));
const portArg = process.argv.indexOf('--port'), PORT = parseInt(process.env.PORT || (portArg > 0 ? process.argv[portArg + 1] : (process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '')) || '7801', 10);
const TOKEN = crypto.randomBytes(32).toString('hex');
const PUBLIC = new Set(['workspace', 'core', 'ui']);
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.yaml':'text/yaml; charset=utf-8', '.md':'text/markdown; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon',
};
const PROJECT_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const { KeyStore } = require('./keystore.js');
const updater = require('./update.js');
const MAX_BODY = 24 * 1024 * 1024;

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type':type || 'text/plain; charset=utf-8',
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(body);
}
function json(res, code, body) { send(res, code, JSON.stringify(body), MIME['.json']); }
function localHost(req, server) {
  const port = server.address().port;
  return req.headers.host === '127.0.0.1:' + port || req.headers.host === 'localhost:' + port;
}
/* 作品目录：默认 <ROOT>/data/projects；QZ_DATA 指向另一个 data 目录（exe 用它读仓库或 exe 旁边的 data，不放进会被覆盖的程序目录） */
const DATA_ROOT = process.env.QZ_DATA ? path.resolve(process.env.QZ_DATA) : path.join(ROOT, 'data');
/* create=false 时不建目录（只读请求）：全新安装在第一次保存前不会出现空的 data/projects */
function dataDirectory(create) {
  if (!create && !fs.existsSync(path.join(DATA_ROOT, 'projects'))) return path.join(path.resolve(DATA_ROOT), 'projects');
  if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
  const base = fs.realpathSync(DATA_ROOT), dir = path.join(base, 'projects');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  if (fs.lstatSync(dir).isSymbolicLink() || !fs.statSync(dir).isDirectory() ||
      !inside(base, fs.realpathSync(dir)) || (!process.env.QZ_DATA && !inside(ROOT, base))) throw new Error('数据目录边界无效');
  return dir;
}
const keys = new KeyStore(DATA_ROOT);
/* 写入类接口：同源页面 + 本次启动的随机令牌 + JSON 请求体 */
function authorized(req) {
  return req.headers.origin === 'http://' + req.headers.host && req.headers['x-qianzhang-token'] === TOKEN && req.headers['content-type'] === 'application/json';
}
function readJson(req, limit) {
  return new Promise((ok, no) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > limit) { no(new Error('请求太大')); req.destroy(); } }); req.on('end', () => { try { ok(JSON.parse(raw || '{}')); } catch (e) { no(e); } }); });
}
function projectFile(id, create) {
  if (!PROJECT_ID.test(id || '')) return null;
  const dir = dataDirectory(create);
  const file = path.join(dir, id + '.json');
  if (fs.existsSync(file) && (fs.lstatSync(file).isSymbolicLink() || !inside(dir, fs.realpathSync(file))))
    throw new Error('项目文件边界无效');
  return file;
}
function staticFile(pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { return null; }
  if (rel === '/workspace/') rel = '/workspace/index.html';
  const parts = rel.split('/').filter(Boolean);
  if (!parts.length || !PUBLIC.has(parts[0]) || parts.some(x => x === '.' || x === '..' || x.startsWith('.'))) return null;
  const asset = parts[parts.length - 1];
  const allowed = parts.length === 2 && (
    parts[0] === 'workspace' ? asset === 'index.html'
    : parts[0] === 'core' ? /^[a-z0-9-]+\.js$/.test(asset)
    : /^[a-z0-9-]+\.(js|css)$/.test(asset));
  if (!allowed) return null;
  let file = path.resolve(ROOT, ...parts);
  if (!inside(ROOT, file) || !fs.existsSync(file)) return null;
  if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || !MIME[path.extname(file).toLowerCase()]) return null;
  let partPath = ROOT;
  for (const part of path.relative(ROOT, file).split(path.sep)) {
    partPath = path.join(partPath, part);
    if (fs.lstatSync(partPath).isSymbolicLink()) return null;
  }
  const real = fs.realpathSync(file);
  return inside(ROOT, real) && fs.statSync(real).isFile() ? real : null;
}

const server = http.createServer(function (req, res) {
  if (!localHost(req, server)) return json(res, 403, { ok:false, error:'主机名不被允许' });
  let url;
  try { url = new URL(req.url, 'http://' + req.headers.host); }
  catch (e) { return json(res, 400, { ok:false, error:'请求地址无效' }); }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (url.pathname === '/api/ping' && req.method === 'GET') /* app：由桌面程序启动（可从页面退出）；mode：window 独立窗口 / browser 默认浏览器 */
    return json(res, 200, { ok:true, token:TOKEN, app:typeof global.__qzQuit === 'function', mode:global.__qzMode || null, version:updater.VERSION });
  /* AI 密钥：加密存在 data/app，页面只在需要时向本地服务要（不进 localStorage、作品或备份） */
  if (url.pathname === '/api/ai-key' && req.method === 'POST') {
    if (!authorized(req)) return json(res, 403, { ok:false, error:'写入授权失败' });
    readJson(req, 8192).then(async input => {
      const r = input.action === 'set' ? await keys.set(input.key) : input.action === 'clear' ? await keys.clear() : await keys.get();
      json(res, 200, Object.assign({ ok:!r.error }, r));
    }).catch(e => json(res, 400, { ok:false, error:e.message }));
    return;
  }
  /* 退出：只有桌面程序注册了退出函数时才有效（源码运行用 Ctrl+C） */
  if (url.pathname === '/api/quit' && req.method === 'POST') {
    if (!authorized(req)) return json(res, 403, { ok:false, error:'写入授权失败' });
    if (typeof global.__qzQuit !== 'function') return json(res, 404, { ok:false, error:'源码运行请在终端按 Ctrl+C 结束' });
    json(res, 200, { ok:true }); setTimeout(() => global.__qzQuit('page'), 200); return;
  }
  /* 新版本提醒：页面启动后、或设置里点“立即检查”时才来问；只读 GitHub 的最新发布信息，永远不下载、不替换程序 */
  if (url.pathname === '/api/update' && req.method === 'POST') {
    if (!authorized(req)) return json(res, 403, { ok:false, error:'写入授权失败' });
    readJson(req, 1024).then(i => updater.check(!!(i && i.force))).catch(() => ({ ok:true, current:updater.VERSION, newer:false, failed:true })).then(r => json(res, 200, r));
    return;
  }
  /* 用系统浏览器打开发布页面（Edge 应用窗口里不适合跳外链）；只会打开本项目的发布地址 */
  if (url.pathname === '/api/open-release' && req.method === 'POST') {
    if (!authorized(req)) return json(res, 403, { ok:false, error:'写入授权失败' });
    readJson(req, 1024).then(i => { const u = updater.releaseUrl(i && i.url); updater.openExternal(u); json(res, 200, { ok:true, url:u }); }).catch(e => json(res, 400, { ok:false, error:e.message }));
    return;
  }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    try {
      const dir = dataDirectory();
      const list = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => f.endsWith('.json') && PROJECT_ID.test(f.slice(0, -5))).map(f => {
        const file = path.join(dir, f), id = f.slice(0, -5);
        if (fs.lstatSync(file).isSymbolicLink()) return null;
        let title = id, words;
        try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); if (d && d.meta && d.meta.title) title = String(d.meta.title); if (d && Array.isArray(d.chapters)) words = d.chapters.reduce((n, c) => n + String(c && c.text || '').replace(/\s/g, '').length, 0); } catch (e) { /* 损坏文件仍列出，打开时再报错 */ }
        return { id, title, words, updatedAt:fs.statSync(file).mtimeMs };
      }).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
      return json(res, 200, { ok:true, projects:list });
    } catch (e) { return json(res, 500, { ok:false, error:e.message }); }
  }
  if (url.pathname === '/api/project' && req.method === 'GET') {
    try {
      const file = projectFile(url.searchParams.get('projectId'));
      if (!file) return json(res, 400, { ok:false, error:'项目 ID 无效' });
      if (!fs.existsSync(file)) { res.writeHead(204, { 'Cache-Control':'no-store' }); return res.end(); } // 尚无磁盘保存
      return send(res, 200, fs.readFileSync(file), MIME['.json']);
    } catch (e) { return json(res, 403, { ok:false, error:e.message }); }
  }
  if (url.pathname === '/api/trash' && req.method === 'GET') {
    try { const dir = path.join(dataDirectory(), '.trash'); const list = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => /^([a-z0-9][a-z0-9._-]{0,63})\.(\d+)\.json$/.exec(f)).filter(Boolean).map(m => {
        let title = m[1]; try { const d = JSON.parse(fs.readFileSync(path.join(dir, m[0]), 'utf8')); if (d && d.meta && d.meta.title) title = String(d.meta.title); } catch (e) {}
        return { file:m[0], id:m[1], title, deletedAt:+m[2] }; }).sort((a, b) => b.deletedAt - a.deletedAt) : [];
      return json(res, 200, { ok:true, items:list }); } catch (e) { return json(res, 500, { ok:false, error:e.message }); }
  }
  if (url.pathname === '/api/trash' && req.method === 'POST') {
    if (req.headers.origin !== 'http://' + req.headers.host || req.headers['x-qianzhang-token'] !== TOKEN) return json(res, 403, { ok:false, error:'写入授权失败' });
    let raw = ''; req.on('data', c => { raw += c; if (raw.length > 4096) req.destroy(); });
    req.on('end', function () {
      try { const input = JSON.parse(raw || '{}'), dir = dataDirectory(true), trash = path.join(dir, '.trash');
        if (!fs.existsSync(trash)) fs.mkdirSync(trash);
        if (fs.lstatSync(trash).isSymbolicLink() || !inside(dir, fs.realpathSync(trash))) throw new Error('回收站目录边界无效');
        if (input.action === 'purge') { const m = /^([a-z0-9][a-z0-9._-]{0,63})\.(\d+)\.json$/.exec(input.file || ''); if (!m) return json(res, 400, { ok:false, error:'回收站文件无效' });
          const f = path.join(trash, m[0]); if (fs.existsSync(f)) fs.unlinkSync(f); return json(res, 200, { ok:true }); }
        if (input.action === 'restore') {
          const m = /^([a-z0-9][a-z0-9._-]{0,63})\.(\d+)\.json$/.exec(input.file || ''); if (!m) return json(res, 400, { ok:false, error:'回收站文件无效' });
          let id = m[1]; if (fs.existsSync(projectFile(id))) id = (id + '-r' + Date.now().toString(36)).slice(0, 64);
          const d = JSON.parse(fs.readFileSync(path.join(trash, m[0]), 'utf8')); d.project_id = id;
          fs.writeFileSync(projectFile(id), JSON.stringify(d, null, 2), { flag:'wx' }); fs.unlinkSync(path.join(trash, m[0]));
          return json(res, 200, { ok:true, projectId:id });
        }
        const file = projectFile(input.projectId); if (!file) return json(res, 400, { ok:false, error:'项目 ID 无效' });
        if (fs.existsSync(file)) fs.renameSync(file, path.join(trash, input.projectId + '.' + Date.now() + '.json'));
        return json(res, 200, { ok:true });
      } catch (e) { return json(res, 400, { ok:false, error:e.message }); }
    });
    return;
  }
  if (url.pathname === '/api/save' && req.method === 'POST') {
    if (req.headers.origin !== 'http://' + req.headers.host ||
        req.headers['x-qianzhang-token'] !== TOKEN ||
        req.headers['content-type'] !== 'application/json')
      return json(res, 403, { ok:false, error:'写入授权失败' });
    const chunks = [];
    let size = 0, oversized = false;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY) oversized = true;
      else chunks.push(chunk);
    });
    req.on('end', function () {
      if (oversized) return json(res, 413, { ok:false, error:'项目文件过大' });
      try {
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const file = projectFile(input.projectId, true);
        if (!file) return json(res, 400, { ok:false, error:'项目 ID 无效' });
        const data = input.content;
        if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.relations) ||
            data.project_id !== input.projectId)
          return json(res, 400, { ok:false, error:'项目数据无效' });
        // 防多窗口互相覆盖：带了 baseRev 的保存必须基于磁盘上的最新版本
        let diskRev = 0; if (fs.existsSync(file)) { try { diskRev = JSON.parse(fs.readFileSync(file, 'utf8'))._rev || 0; } catch (e) { diskRev = 0; } }
        let diskBy = ''; if (fs.existsSync(file)) { try { diskBy = JSON.parse(fs.readFileSync(file, 'utf8'))._by || ''; } catch (e) { diskBy = ''; } }
        // 关页时的补存可能比上一次保存的回执先出发：同一个窗口、只落后一版，放行
        const sameTab = input.unload && input.client && diskBy === String(input.client) && +input.baseRev === diskRev - 1;
        if (input.baseRev == null && fs.existsSync(file) && !input.create) return json(res, 409, { ok:false, error:'版本冲突：这本书已经存在，请先打开再保存', rev:diskRev });
        if (input.baseRev != null && +input.baseRev !== diskRev && !sameTab) return json(res, 409, { ok:false, error:'版本冲突', rev:diskRev });
        data._rev = diskRev + 1; if (input.client) data._by = String(input.client).slice(0, 24); else delete data._by;
        const body = JSON.stringify(data, null, 2);
        if (Buffer.byteLength(body) > MAX_BODY) return json(res, 413, { ok:false, error:'项目文件过大' });
        const dir = path.dirname(file);
        const tmp = path.join(dir, input.projectId + '.' + crypto.randomBytes(8).toString('hex') + '.tmp');
        let fd = null, created = false, backup = null;
        try {
          fd = fs.openSync(tmp, 'wx'); created = true;
          fs.writeFileSync(fd, body, { encoding:'utf8' });
          fs.fsyncSync(fd);
          fs.closeSync(fd); fd = null;
          if (fs.existsSync(file)) {
            backup = path.join(dir, '.backup');
            if (!fs.existsSync(backup)) fs.mkdirSync(backup);
            if (fs.lstatSync(backup).isSymbolicLink() || !inside(dir, fs.realpathSync(backup)))
              throw new Error('备份目录边界无效');
            const name = input.projectId + '.' + Date.now() + '.' + crypto.randomBytes(8).toString('hex') + '.bak';
            fs.copyFileSync(file, path.join(backup, name), fs.constants.COPYFILE_EXCL);
            // 每天第一次保存时另存一份「日备份」，保留最近 14 天，防止连续保存把好版本挤掉
            const d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            const daily = path.join(backup, input.projectId + '.day-' + day + '.bak');
            if (!fs.existsSync(daily)) fs.copyFileSync(file, daily, fs.constants.COPYFILE_EXCL);
          }
          fs.renameSync(tmp, file); created = false;
        } finally {
          if (fd !== null) fs.closeSync(fd);
          if (created) fs.unlinkSync(tmp); // 写到一半或替换失败，不遗留作者内容临时副本
        }
        // 只有成功替换后才清理旧备份；清理失败不能把已提交的保存误报为失败。
        if (backup) {
          const prefix = input.projectId + '.';
          try {
            fs.readdirSync(backup).filter(x => x.startsWith(prefix) && /^\d+(?:\.[a-f0-9]{16})?\.bak$/.test(x.slice(prefix.length)))
              .sort().reverse().slice(10).forEach(x => fs.unlinkSync(path.join(backup, x)));
            fs.readdirSync(backup).filter(x => x.startsWith(prefix + 'day-') && /^day-\d{4}-\d{2}-\d{2}\.bak$/.test(x.slice(prefix.length)))
              .sort().reverse().slice(14).forEach(x => fs.unlinkSync(path.join(backup, x)));
          } catch (e) { console.warn('旧备份清理失败：' + e.message); }
        }
        return json(res, 200, { ok:true, projectId:input.projectId, rev:data._rev });
      } catch (e) { return json(res, 400, { ok:false, error:e.message }); }
    });
    return;
  }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { ok:false, error:'接口不存在' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '405');
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(302, { Location:'/workspace/', 'Cache-Control':'no-store' });
    return res.end();
  }
  const file = staticFile(url.pathname);
  if (!file) return send(res, 404, '404 找不到资源');
  try { send(res, 200, req.method === 'HEAD' ? '' : fs.readFileSync(file),
    MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'); }
  catch (e) { send(res, 500, '500 读取失败'); }
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('千章 Qianzhang 本地服务 http://127.0.0.1:' + server.address().port + '/');
  console.log('项目保存目录：' + path.join(DATA_ROOT, 'projects'));
});
server.on('error', function (e) { console.error('本地服务启动失败：' + e.message); process.exitCode = 1; });
