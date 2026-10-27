/*! 千章 · server/keystore.js · AI 密钥在本机加密保存
 * 密钥不再放浏览器 localStorage，而是由本地服务加密后写到 <data>/app/ai-key.json：
 *   - Windows：DPAPI（CurrentUser），由系统按当前 Windows 账户加密，文件拷到别的电脑或别的账户都解不开；
 *   - 其他系统，或 DPAPI 不可用时：AES-256-GCM，密钥由本机标识 + 用户名 + 随机盐经 scrypt 派生。
 * 能防的是：备份/同步/误分享 data 文件夹时密钥被直接读出。防不了的是：以你的账户运行的恶意程序。 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');

const ENTROPY = 'qianzhang-ai-key-v1';
function ps(script, env) {
  return new Promise((ok, no) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide:true, timeout:15000, env:Object.assign({}, process.env, env) },
    (e, out) => e ? no(e) : ok(String(out).trim())));
}
const DPAPI = {
  protect: text => ps("Add-Type -AssemblyName System.Security; $b=[Text.Encoding]::UTF8.GetBytes($env:QZ_IN); $e=[Text.Encoding]::UTF8.GetBytes($env:QZ_ENT); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$e,'CurrentUser'))", { QZ_IN:text, QZ_ENT:ENTROPY }),
  unprotect: b64 => ps("Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String($env:QZ_IN); $e=[Text.Encoding]::UTF8.GetBytes($env:QZ_ENT); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$e,'CurrentUser'))", { QZ_IN:b64, QZ_ENT:ENTROPY })
    .then(x => Buffer.from(x, 'base64').toString('utf8')),
};
/* 本机标识：Linux machine-id、macOS 硬件 UUID、Windows MachineGuid；都拿不到时退回主机名 */
function machineId() {
  for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) { try { const s = fs.readFileSync(f, 'utf8').trim(); if (s) return s; } catch (e) {} }
  try { if (process.platform === 'darwin') { const m = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding:'utf8', timeout:5000 })); if (m) return m[1]; } } catch (e) {}
  try { if (process.platform === 'win32') { const m = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding:'utf8', windowsHide:true, timeout:5000 })); if (m) return m[1]; } } catch (e) {}
  return 'host:' + os.hostname();
}
function machineKey(salt) {
  let user = ''; try { user = os.userInfo().username; } catch (e) {}
  return crypto.scryptSync([ENTROPY, machineId(), user, os.homedir()].join('\n'), salt, 32);
}
const AES = {
  seal: text => { const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', machineKey(salt), iv);
    const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return { alg:'aes-256-gcm-machine', salt:salt.toString('base64'), iv:iv.toString('base64'), tag:c.getAuthTag().toString('base64'), data:data.toString('base64') }; },
  open: r => { const d = crypto.createDecipheriv('aes-256-gcm', machineKey(Buffer.from(r.salt, 'base64')), Buffer.from(r.iv, 'base64'));
    d.setAuthTag(Buffer.from(r.tag, 'base64')); return Buffer.concat([d.update(Buffer.from(r.data, 'base64')), d.final()]).toString('utf8'); },
};

function KeyStore(dataRoot, opts) {
  const o = opts || {};
  this.file = path.join(dataRoot, 'app', 'ai-key.json');
  this.useDpapi = o.dpapi != null ? o.dpapi : process.platform === 'win32';
  this.cache = undefined; // 解密后的值只留在本地服务内存里
}
KeyStore.prototype = {
  read: function () { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { return null; } },
  /** {key, protection}；没有存过时 key 为空串。文件损坏或在别的电脑/账户上解不开时返回 error。 */
  get: async function () {
    const r = this.read();
    if (!r || !r.alg) return { key:'', protection:null };
    if (this.cache !== undefined) return { key:this.cache, protection:r.alg };
    try {
      const key = r.alg === 'dpapi' ? await DPAPI.unprotect(r.data) : r.alg === 'aes-256-gcm-machine' ? AES.open(r) : null;
      if (key == null) throw new Error('未知的加密方式');
      this.cache = key; return { key, protection:r.alg };
    } catch (e) { return { key:'', protection:r.alg, error:'已保存的密钥无法在这台电脑或这个账户上解开，请重新填写' }; }
  },
  set: async function (key) {
    key = String(key || '');
    if (!key) return this.clear();
    let rec = null;
    if (this.useDpapi) { try { rec = { alg:'dpapi', data:await DPAPI.protect(key) }; } catch (e) { console.warn('DPAPI 不可用，改用 AES：' + e.message); } }
    if (!rec) rec = AES.seal(key);
    rec.v = 1; rec.saved_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.file), { recursive:true });
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec), { mode:0o600 });
    fs.renameSync(tmp, this.file);
    this.cache = key;
    return { key, protection:rec.alg };
  },
  clear: async function () { try { fs.unlinkSync(this.file); } catch (e) {} this.cache = ''; return { key:'', protection:null }; },
};
module.exports = { KeyStore, AES, machineId };
