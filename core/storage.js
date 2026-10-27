/*! 千章 · core/storage.js · 本地服务 + 浏览器双重保存
 * 有本地服务时写入 data/projects/<id>.json；同时在浏览器留一份副本。
 * 同一项目的保存严格排队，后发的内容一定最后落盘。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QZStorage = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'qianzhang:v3:project:', TRASH = 'qianzhang:v3:trash:', CONFLICT = 'qianzhang:v3:conflict:';
  const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

  function Storage(options) {
    const o = options || {};
    this.apiBase = o.apiBase || '/api';
    this.local = o.localStorage !== undefined ? o.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
    this.token = null; this.server = false;
    this._queue = {}; this._rev = {}; this.client = Math.random().toString(36).slice(2, 12); this._newerLocal = {}; this.onQuota = null;
  }
  Storage.validId = id => ID.test(id || '');
  Storage.prototype = {
    connect: function () {
      return fetch(this.apiBase + '/ping', { cache:'no-store' }).then(r => r.ok ? r.json() : null)
        .then(j => { this.token = j && j.token; this.server = !!this.token; return this.server; })
        .catch(() => { this.server = false; return false; });
    },
    /** 本地服务上的加密密钥：action = get | set | clear */
    aiKey: function (action, key) {
      if (!this.server) return Promise.reject(new Error('未连接本地服务'));
      return fetch(this.apiBase + '/ai-key', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Qianzhang-Token':this.token }, body:JSON.stringify({ action, key }) })
        .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok && !j.error) throw new Error('密钥保存失败（' + r.status + '）'); return j; }));
    },
    _localGet: function (id) {
      try { const s = this.local && this.local.getItem(KEY + id); return s ? JSON.parse(s) : null; } catch (e) { return null; }
    },
    _localSet: function (id, data) {
      try { this.local && this.local.setItem(KEY + id, JSON.stringify(data)); return true; } catch (e) { if (this.onQuota) this.onQuota(e); return false; } // 浏览器空间满：通知界面，不静默
    },
    /** 版本冲突时：把这次没存上的内容挪到冲突区，主副本删掉，下次打开不会拿它去盖别的窗口。 */
    _parkConflict: function (id, data) {
      try { if (this.local) { this.local.setItem(CONFLICT + id, JSON.stringify(data)); this.local.removeItem(KEY + id); } } catch (e) { /* 空间不足时宁可不留，也不覆盖 */ }
    },
    conflictCopy: function (id) { try { const s = this.local && this.local.getItem(CONFLICT + id); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    _localIds: function () {
      const out = [];
      if (!this.local) return out;
      for (let i = 0; i < this.local.length; i++) { const k = this.local.key(i); if (k && k.startsWith(KEY)) out.push(k.slice(KEY.length)); }
      return out;
    },
    /** 作品清单：[{id,title,updated_at}]，服务端优先，补上仅在浏览器里的。 */
    list: function () {
      const fromServer = this.server
        ? fetch(this.apiBase + '/projects', { cache:'no-store' }).then(r => r.ok ? r.json() : { projects:[] })
          .then(j => (j.projects || []).map(p => ({ id:p.id, title:p.title, words:p.words, updated_at:p.updatedAt ? new Date(p.updatedAt).toISOString() : '' }))).catch(() => []) : Promise.resolve([]);
      return fromServer.then(list => {
        const seen = new Set(list.map(p => p.id));
        this._localIds().forEach(id => {
          if (seen.has(id)) return; const d = this._localGet(id);
          if (d) list.push({ id, title:(d.meta && d.meta.title) || id, words:(d.chapters || []).reduce((n, c) => n + String(c && c.text || '').replace(/\s/g, '').length, 0), updated_at:d.meta && d.meta.updated_at });
        });
        return list.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      });
    },
    load: function (id) {
      if (!this.server) return Promise.resolve(this._localGet(id));
      return fetch(this.apiBase + '/project?projectId=' + encodeURIComponent(id), { cache:'no-store' })
        .then(r => {
          if (r.status === 204 || r.status === 404) { this._rev[id] = 0; return this._localGet(id); }
          if (!r.ok) throw new Error('读取作品失败（HTTP ' + r.status + '）');
          return r.json().then(j => { this._rev[id] = j && j._rev || 0; const loc = this._localGet(id);
            // 浏览器副本比服务端新（例如上次关页时没来得及落盘）：用新的那份，并标记需要补存
            if (loc && loc.meta && j && j.meta && String(loc.meta.updated_at || '') > String(j.meta.updated_at || '')) { this._newerLocal[id] = true; return loc; }
            return j; });
        });
    },
    /** 删除作品：移进回收站（服务端 data/projects/.trash，浏览器副本另存 trash 键），可恢复。 */
    trash: function (id) {
      const d = this._localGet(id); try { if (this.local) { if (d && !this.server) this.local.setItem(TRASH + id + '.' + Date.now(), JSON.stringify(d)); this.local.removeItem(KEY + id); } } catch (e) { if (this.onQuota) this.onQuota(e); return Promise.reject(new Error('浏览器空间不足，没能移进回收站')); }
      if (!this.server) return Promise.resolve(true);
      return fetch(this.apiBase + '/trash', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Qianzhang-Token':this.token }, body:JSON.stringify({ projectId:id }) })
        .then(r => r.ok ? true : r.json().catch(() => ({})).then(j => { throw new Error(j.error || '删除失败'); }));
    },
    trashList: function () {
      const local = []; if (this.local) for (let i = 0; i < this.local.length; i++) { const k = this.local.key(i), m = k && k.startsWith(TRASH) && /^(.+)\.(\d+)$/.exec(k.slice(TRASH.length)); if (m) { let t = m[1]; try { t = JSON.parse(this.local.getItem(k)).meta.title || t; } catch (e) {} local.push({ file:k, id:m[1], title:t, deletedAt:+m[2], local:true }); } }
      const srv = this.server ? fetch(this.apiBase + '/trash', { cache:'no-store' }).then(r => r.ok ? r.json() : { items:[] }).then(j => j.items || []).catch(() => []) : Promise.resolve([]);
      return srv.then(list => { const seen = new Set(list.map(x => x.id + x.deletedAt)); return list.concat(local.filter(x => !list.some(s => s.id === x.id && Math.abs(s.deletedAt - x.deletedAt) < 5000))).sort((a, b) => b.deletedAt - a.deletedAt); });
    },
    purge: function (item) {
      if (item.local) { this.local.removeItem(item.file); return Promise.resolve(true); }
      for (let i = this.local ? this.local.length - 1 : -1; i >= 0; i--) { const k = this.local.key(i); if (k && k.startsWith(TRASH + item.id + '.')) this.local.removeItem(k); }
      return fetch(this.apiBase + '/trash', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Qianzhang-Token':this.token }, body:JSON.stringify({ action:'purge', file:item.file }) }).then(r => r.ok);
    },
    restore: function (item) {
      if (item.local) return Promise.resolve().then(() => {
        const d = JSON.parse(this.local.getItem(item.file)); let id = item.id;
        if (this._localGet(id)) id = (id + '-r' + Date.now().toString(36)).slice(0, 64);
        d.project_id = id;
        // 新副本确实保存成功后才移除原记录；配额满或服务失败时保留可恢复的稿件。
        return this.save(id, d).then(() => { this.local.removeItem(item.file); return id; });
      });
      return fetch(this.apiBase + '/trash', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Qianzhang-Token':this.token }, body:JSON.stringify({ action:'restore', file:item.file }) })
        .then(r => r.json()).then(j => { if (!j.ok) throw new Error(j.error || '恢复失败'); for (let i = this.local ? this.local.length - 1 : -1; i >= 0; i--) { const k = this.local.key(i); if (k && k.startsWith(TRASH + item.id + '.')) this.local.removeItem(k); } return j.projectId; });
    },
    /** 打开作品时浏览器副本更新：返回一次 true，让界面补存。 */
    takeNewerLocal: function (id) { const v = !!this._newerLocal[id]; delete this._newerLocal[id]; return v; },
    /** 返回 Promise<'server'|'local'>。 */
    save: function (id, data, opt) {
      const now = !!((opt && opt.unload) || this._unloading); const localOk = this._localSet(id, data);
      if (!this.server) return Promise.resolve(localOk ? 'local' : Promise.reject(new Error('浏览器存储已满')));
      const prev = this._queue[id] || Promise.resolve();
      const post = () => {
        const body = JSON.stringify({ projectId:id, content:data, baseRev:this._rev[id], client:this.client, unload:now });
        // 浏览器保活限额按完整请求的 UTF-8 字节计，中文稿不能用字符数估算。
        const keep = now && new TextEncoder().encode(body).byteLength < 60000;
        return fetch(this.apiBase + '/save', { method:'POST', keepalive:keep,
          headers:{ 'Content-Type':'application/json', 'X-Qianzhang-Token':this.token }, body });
      };
      const done = r => r.json().catch(() => ({})).then(j => {
        if (r.ok) { if (j.rev != null) this._rev[id] = j.rev; return 'server'; }
        if (r.status === 409) this._parkConflict(id, data);
        const e = new Error(r.status === 409 ? '另一个窗口刚改过这本书，这次的改动没有存进去（已另存一份在浏览器里，不会覆盖那边）。请刷新页面再写' : (j.error || ('保存失败 HTTP ' + r.status))); e.status = r.status; if (r.status === 409) e.conflict = true; throw e; });
      // 服务重启后口令会变：403 时重新握手再试一次
      const run = () => post().then(r => r.status === 403 ? this.connect().then(() => post()) : r).then(done);
      if (now) { const p0 = run(); p0.catch(() => {}); return p0; } // 关页：立刻补存，不排队；小请求使用 keepalive，大稿仍先留浏览器副本。
      const p = prev.catch(() => {}).then(run);
      this._queue[id] = p;
      return p;
    },
  };
  return Storage;
}));
