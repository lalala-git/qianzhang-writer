/* 新版本提醒：只问 GitHub 一次“最新的发布是哪个版本”，不上传任何作品或个人数据；
 * 不自动下载、不替换程序，只在页面上提示，点击后用系统浏览器打开发布页面。
 * 设置里可关；断网或请求失败时静默（只有用户在设置里点“立即检查”时才会如实告知）。 */
'use strict';
const http = require('node:http');
const https = require('node:https');
const { execFile } = require('node:child_process');

const VERSION = '1.1.0';
const API = 'https://api.github.com/repos/lalala-git/qianzhang-writer/releases/latest';
const RELEASES = 'https://github.com/lalala-git/qianzhang-writer/releases';
const RELEASE_URL = /^https:\/\/github\.com\/lalala-git\/qianzhang-writer\/releases(\/[A-Za-z0-9._\/-]*)?$/;
const OK_TTL = 6 * 3600 * 1000, FAIL_TTL = 30 * 60 * 1000, TIMEOUT = 6000, MAX_BODY = 256 * 1024;

/** 「v1.2.3」「1.2.3」→ [1,2,3]；带预发布后缀或格式不对的返回 null（不提醒） */
function parse(v) {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(String(v == null ? '' : v).trim());
  return m ? [+m[1], +m[2], +m[3]] : null;
}
/** a、b 都是版本号字符串：a 更新返回 1，相同 0，更旧 -1，任一无法解析返回 null */
function compare(a, b) {
  const x = parse(a), y = parse(b); if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
/** 只允许打开本项目的发布页面；其他地址一律换成发布列表页 */
function releaseUrl(u) { return typeof u === 'string' && RELEASE_URL.test(u) ? u : RELEASES + '/latest'; }

function get(url, ms) {
  return new Promise((ok, no) => {
    let done = false, timer; const end = (f, v) => { if (done) return; done = true; clearTimeout(timer); f(v); };
    let req;
    try {
      req = (url.startsWith('https:') ? https : http).get(url, { headers: { 'User-Agent': 'Qianzhang/' + VERSION, Accept: 'application/vnd.github+json' } }, res => {
        if (res.statusCode !== 200) { res.resume(); return end(no, new Error('HTTP ' + res.statusCode)); }
        let n = 0; const parts = [];
        res.on('data', c => { n += c.length; if (n > MAX_BODY) req.destroy(new Error('too large')); else parts.push(c); });
        res.on('end', () => end(ok, Buffer.concat(parts).toString('utf8')));
        res.on('error', e => end(no, e));
      });
    } catch (e) { return end(no, e); }
    req.on('error', e => end(no, e));
    timer = setTimeout(() => { end(no, new Error('timeout')); try { req.destroy(); } catch (e) {} }, ms);
  });
}

let cache = null, inflight = null;
/** 查最新发布。force=true 时忽略缓存（设置里的“立即检查”）。永远不抛错：失败时 failed:true、newer:false。 */
function check(force) {
  if (process.env.QZ_UPDATE_CHECK === 'off') return Promise.resolve({ ok: true, current: VERSION, newer: false, disabled: true });
  if (!force && cache && Date.now() - cache.at < (cache.result.failed ? FAIL_TTL : OK_TTL)) return Promise.resolve(cache.result);
  if (inflight) return inflight;
  const url = process.env.QZ_UPDATE_URL || API;
  inflight = get(url, TIMEOUT).then(body => {
    const j = JSON.parse(body); const c = compare(j && j.tag_name, VERSION);
    if (c === null) throw new Error('bad tag');
    return { ok: true, current: VERSION, latest: String(j.tag_name).replace(/^v/, ''), newer: c > 0, url: releaseUrl(j.html_url) };
  }).catch(() => ({ ok: true, current: VERSION, newer: false, failed: true })).then(result => { cache = { at: Date.now(), result }; inflight = null; return result; });
  return inflight;
}

/** 用系统浏览器打开（测试里可用 global.__qzOpenUrl 替换） */
function openExternal(url) {
  if (typeof global.__qzOpenUrl === 'function') return global.__qzOpenUrl(url);
  const cb = () => {};
  if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', url], { windowsHide: true }, cb);
  else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], cb);
}
function _reset() { cache = null; inflight = null; }

module.exports = { VERSION, API, RELEASES, parse, compare, releaseUrl, check, openExternal, _reset };
