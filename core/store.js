/*! 千章 · core/store.js · 作品数据模型
 * 一本书 = 一个项目：章节、设定（人物/地点/规则…）、关系、角色对话。
 * 兼容旧版数据：未知字段原样保留；旧版 manuscript.files 自动拆成章节。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QZStore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPES = { PERSON:'人物', GROUP:'群体', PLACE:'地点', EVENT:'事件', ITEM:'物品', RULE:'规则', GEN:'其他' };
  const now = () => new Date().toISOString();
  const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  /** 清理「下一章预填」留下的空模板行和套娃行（只动这两种完全由模板生成的行，作者写的字不碰）。 */
  const PF_HEAD = /^(?:承接上章结尾|出场|该回收的伏笔|上章细纲|本章冲突|章末钩子)：/;
  const cleanOutline = o => { if (!o) return o; const nested = l => /^上章细纲：/.test(l) && PF_HEAD.test(l.slice(5).trim()); if (!o.split('\n').some(nested)) return o; /* 没被嵌套污染就原样保留（空的「本章冲突：」模板行是给作者填的） */ const out = o.split('\n').filter(l => !/^(?:本章冲突|章末钩子)：\s*$/.test(l) && !(/^上章细纲：/.test(l) && PF_HEAD.test(l.slice(5).trim())));
    return out.join('\n').trim() ? out.join('\n') : ''; };
  const str = x => typeof x === 'string' ? x : (x == null ? '' : String(x));

  /** 字数：去掉空白后的字符数（中文按字计）。 */
  /** 字数：每个汉字（及其他非拉丁字符）算 1，连续的英文/数字算 1 个词，不计空白和标点。 */
  const WC = new Map(); // 长章节字数缓存（按正文内容），长篇反复渲染目录时不重复计算
  function countWords(text) {
    const s = str(text); if (s.length < 300) return rawCount(s);
    let n = WC.get(s); if (n === undefined) { if (WC.size > 3000) WC.clear(); n = rawCount(s); WC.set(s, n); } return n;
  }
  function rawCount(s) { return (s.match(/[A-Za-z0-9_'-]+/g) || []).length + s.replace(/[A-Za-z0-9_'-]+/g, '').replace(/[\s\p{P}\p{S}]/gu, '').length; }

  /** 旧版：一个文件一段全文 + 若干 {start,end} 章节切片 → 独立章节。 */
  function chaptersFromManuscript(ms) {
    if (!isObj(ms) || !Array.isArray(ms.files)) return [];
    const out = [];
    ms.files.forEach(f => {
      if (!isObj(f) || typeof f.text !== 'string') return;
      const parts = Array.isArray(f.chapters) && f.chapters.length ? f.chapters
        : [{ id:f.id, title:(f.name || '未命名').replace(/\.(md|txt)$/i, ''), start:0, end:f.text.length }];
      parts.forEach(c => {
        let text = f.text.slice(c.start || 0, c.end == null ? f.text.length : c.end);
        const title = str(c.title) || '未命名章节';
        const first = text.split('\n')[0].replace(/^#+\s*/, '').trim();
        if (first && first === title.trim()) text = text.includes('\n') ? text.slice(text.indexOf('\n') + 1).replace(/^\s*\n/, '') : '';
        text = text.replace(/\s+$/, '');
        out.push({ id:str(c.id) || uid('CH'), title, text, order:typeof c.order === 'number' ? c.order : out.length,
          created_at:f.importedAt || now(), updated_at:f.importedAt || now() });
      });
    });
    return out.sort((a, b) => a.order - b.order).map((c, i) => Object.assign(c, { order:i }));
  }

  const HISTORY_MAX = 15, HISTORY_GAP = 10 * 60 * 1000;
  function normalize(raw, projectId) {
    const d = isObj(raw) ? JSON.parse(JSON.stringify(raw)) : {};
    d.format_version = d.format_version || 2;
    d.project_id = str(d.project_id || projectId || 'workspace');
    d.meta = isObj(d.meta) ? d.meta : {};
    if (!d.meta.title) d.meta.title = d.project_id === 'workspace' ? '我的作品' : '未命名作品'; // 旧版默认作品名
    d.nodes = (Array.isArray(d.nodes) ? d.nodes : []).filter(n => isObj(n) && n.id).map(n => {
      n.id = str(n.id); n.name = str(n.name) || n.id; n.type = TYPES[n.type] ? n.type : (n.type ? str(n.type) : 'GEN');
      n.summary = str(n.summary); n.detail = str(n.detail); return n;
    });
    const ids = new Set(d.nodes.map(n => n.id));
    d.relations = (Array.isArray(d.relations) ? d.relations : [])
      .filter(r => isObj(r) && ids.has(r.source) && ids.has(r.target))
      .map(r => { r.label = str(r.label); return r; });
    if (!Array.isArray(d.chapters)) d.chapters = chaptersFromManuscript(d.manuscript);
    d.chapters = d.chapters.filter(isObj).map((c, i) => Object.assign(c, {
      id:str(c.id) || uid('CH'), title:str(c.title) || '未命名章节', text:str(c.text),
      order:typeof c.order === 'number' ? c.order : i }));
    d.chats = (Array.isArray(d.chats) ? d.chats : []).filter(c => isObj(c) && c.characterId)
      .map(c => Object.assign(c, { messages:(Array.isArray(c.messages) ? c.messages : []).filter(isObj) }));
    d.volumes = (Array.isArray(d.volumes) ? d.volumes : []).filter(v => isObj(v) && v.id)
      .map((v, i) => Object.assign(v, { id:str(v.id), title:str(v.title) || '未命名卷', order:typeof v.order === 'number' ? v.order : i }));
    const vids = new Set(d.volumes.map(v => v.id));
    d.chapters.forEach(c => { if (c.volumeId && !vids.has(c.volumeId)) delete c.volumeId; if (c.outline != null) c.outline = cleanOutline(str(c.outline)); });
    d.foreshadows = (Array.isArray(d.foreshadows) ? d.foreshadows : []).filter(f => isObj(f) && f.id)
      .map(f => Object.assign(f, { title:str(f.title) || '未命名伏笔', note:str(f.note) }));
    if (d.writing && d.writing.templates != null) d.writing.templates = (Array.isArray(d.writing.templates) ? d.writing.templates : []).filter(t => isObj(t) && t.id).map(t => Object.assign(t, { name:str(t.name) || '我的模板', outline:str(t.outline) }));
    d.chapters.forEach(c => { if (c.branches != null) { c.branches = (Array.isArray(c.branches) ? c.branches : []).filter(b => isObj(b) && typeof b.text === 'string').map(b => ({ id:String(b.id || uid('br')), name:String(b.name || '分支'), text:b.text, at:b.at || now() })); if (!c.branches.length) delete c.branches; } });
    d.chapters.forEach(c => { if (c.history != null) c.history = (Array.isArray(c.history) ? c.history : []).filter(h => isObj(h) && typeof h.text === 'string').slice(-HISTORY_MAX); });
    d.nodes.forEach(n => { if (n.progress != null) n.progress = (Array.isArray(n.progress) ? n.progress : []).filter(x => isObj(x) && x.id).map(x => Object.assign(x, { text:str(x.text), dead:!!x.dead }, x.kind === 'power' || x.kind === 'res' ? {} : { kind:undefined })).map(x => { if (x.kind === undefined) delete x.kind; return x; }); });
    if (d.notes != null) d.notes = (Array.isArray(d.notes) ? d.notes : []).filter(x => isObj(x) && x.id).map(x => Object.assign(x, { text:str(x.text), links:(Array.isArray(x.links) ? x.links : []).map(String), pinned:!!x.pinned, at:x.at || now() }));
    if (d.reader != null && !(isObj(d.reader) && Array.isArray(d.reader.rows) && Array.isArray(d.reader.cols))) delete d.reader;
    d.writing = isObj(d.writing) ? d.writing : {};
    d.writing.goal = Math.max(100, parseInt(d.writing.goal, 10) || 2000);
    d.writing.daily = isObj(d.writing.daily) ? d.writing.daily : {};
    d.writing.perDay = Math.max(1, parseInt(d.writing.perDay, 10) || 1);
    if (d.writing.time != null && !isObj(d.writing.time)) delete d.writing.time;
    return d;
  }
  function today() { const t = new Date(), p = n => String(n).padStart(2, '0'); return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()); }

  function noteTags(t) { const out = []; String(t || '').replace(/[#＃]([^\s#＃，。,.!！?？、]{1,12})/g, (m, k) => { if (!out.includes(k)) out.push(k); return m; }); return out; }
  function Project(raw, projectId) {
    this.data = normalize(raw, projectId);
    this._listeners = [];
  }
  Project.TYPES = TYPES;
  Project.normalize = normalize;
  Project.countWords = countWords;
  Project.uid = uid;
  Project.noteTags = noteTags;

  Project.prototype = {
    constructor: Project,
    get id() { return this.data.project_id; },
    get title() { return this.data.meta.title; },
    onChange: function (fn) { this._listeners.push(fn); return () => { this._listeners = this._listeners.filter(x => x !== fn); }; },
    /** 撤销用：整本书的一个内存快照 / 恢复到快照（删设定、删伏笔等「删除 + 撤销」） */
    checkpoint: function () { return JSON.stringify(this.toJSON()); },
    rollback: function (snap) { const P = this.constructor, d = new P(JSON.parse(snap), this.id).data; this.data = d; this._changed('all'); },
    _changed: function (what) { this.data.meta.updated_at = now(); this._listeners.forEach(fn => fn(what)); },
    /** 文风锚点章（最多 5 章）。 */
    setStyleAnchors: function (ids) { const ok = (Array.isArray(ids) ? ids : []).filter(id => this.chapter(id)).slice(0, 5); if (ok.length) this.data.meta.styleAnchors = ok; else delete this.data.meta.styleAnchors; this._changed('meta'); },
    setBlurb: function (t) { this.data.meta.blurb = str(t).trim(); this._changed('meta'); },
    setTitle: function (t) { this.data.meta.title = str(t).trim() || '未命名作品'; this._changed('meta'); },
    toJSON: function () { return JSON.parse(JSON.stringify(this.data)); },
    stats: function () {
      const d = this.data;
      return { chapters:d.chapters.length, words:d.chapters.reduce((s, c) => s + countWords(c.text), 0),
        entities:d.nodes.length, characters:d.nodes.filter(n => n.type === 'PERSON').length,
        relations:d.relations.length, chats:d.chats.filter(c => c.messages.length).length };
    },

    /* ---------- 章节 ---------- */
    /** 阅读顺序：未分卷的在前，然后按卷顺序，卷内按 order。 */
    chapters: function () {
      const vo = new Map(this.data.volumes.map(v => [v.id, v.order]));
      const key = c => (c.volumeId && vo.has(c.volumeId) ? vo.get(c.volumeId) : -1);
      return this.data.chapters.slice().sort((a, b) => key(a) - key(b) || a.order - b.order);
    },
    chapter: function (id) { return this.data.chapters.find(c => c.id === id) || null; },
    addChapter: function (title, text, volumeId) {
      const c = { id:uid('CH'), title:str(title) || ('第' + (this.data.chapters.length + 1) + '章'), text:str(text),
        order:this.data.chapters.length, created_at:now(), updated_at:now() };
      if (volumeId && this.volume(volumeId)) c.volumeId = volumeId;
      this.data.chapters.push(c); this._changed('chapters'); return c;
    },
    updateChapter: function (id, patch) {
      const c = this.chapter(id); if (!c) return null;
      if ('title' in patch) c.title = str(patch.title);
      if ('text' in patch) {
        const next = str(patch.text), delta = countWords(next) - countWords(c.text);
        if (delta && !patch.silent) { const k = today(), d = this.data.writing.daily; d[k] = (d[k] || 0) + delta; this._logTime(k, delta, patch.at); }
        // 历史稿：内容变了且距上一份超过 10 分钟，就把改动前的版本存一份
        if (next !== c.text && c.text.trim()) { const h = c.history || [], last = h[h.length - 1];
          if (!last || Date.now() - Date.parse(last.at) > HISTORY_GAP) this._snap(c, '自动保存'); }
        c.text = next;
      }
      if ('outline' in patch) c.outline = str(patch.outline);
      if ('expect' in patch) { const v = str(patch.expect); if (['爽', '虐', '悬', '甜'].includes(v)) c.expect = v; else delete c.expect; }
      if ('storyTime' in patch) { const v = str(patch.storyTime).trim(); if (v) c.storyTime = v; else delete c.storyTime; }
      if ('status' in patch) { if (patch.status === 'published') c.status = 'published'; else delete c.status; }
      if ('publishAt' in patch) { if (/^\d{4}-\d{2}-\d{2}$/.test(patch.publishAt || '')) c.publishAt = patch.publishAt; else delete c.publishAt; }
      if ('volumeId' in patch) { if (patch.volumeId && this.volume(patch.volumeId)) c.volumeId = patch.volumeId; else delete c.volumeId; }
      c.updated_at = now(); this._changed('chapter'); return c;
    },
    _snap: function (c, note) {
      const h = c.history || (c.history = []), last = h[h.length - 1];
      if (last && last.text === c.text) { last.at = now(); if (note && note !== '自动保存') last.note = note; return last; }
      h.push({ at:now(), note:str(note) || '手动存档', text:c.text }); if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX); return h[h.length - 1];
    },
    /** 给章节存一份历史稿（最多保留 15 份）。 */
    snapshot: function (id, note) { const c = this.chapter(id); if (!c) return null; const s = this._snap(c, note); this._changed('chapter'); return s; },
    history: function (id) { const c = this.chapter(id); return c && c.history ? c.history.slice().reverse() : []; },
    /** 恢复到某份历史稿；恢复前先把当前版本存一份，所以可以反悔。不计入今日字数。 */
    /* ---------- 情节分支：同一章的另一种写法，可随时切换为正文 ---------- */
    branches: function (id) { const c = this.chapter(id); return c ? (c.branches || []) : []; },
    addBranch: function (id, name, text) {
      const c = this.chapter(id); if (!c) return null;
      const b = { id:uid('br'), name:String(name || '').trim() || '分支 ' + ((c.branches || []).length + 1), text:text != null ? String(text) : c.text, at:now() };
      (c.branches || (c.branches = [])).push(b); this._changed('chapter'); return b;
    },
    /** 把分支换成正文；原正文变成一个分支（名字由 keepName 指定），两边都不丢。 */
    switchBranch: function (id, bid, keepName) {
      const c = this.chapter(id), b = c && (c.branches || []).find(x => x.id === bid); if (!b) return null;
      this._snap(c, '切换分支前'); const old = c.text; c.text = b.text; b.text = old; const n = b.name; b.name = String(keepName || '').trim() || '原稿'; b.at = now();
      c.activeBranch = n; c.updated_at = now(); this._changed('chapter'); return c;
    },
    renameBranch: function (id, bid, name) { const b = this.branches(id).find(x => x.id === bid); if (b && String(name).trim()) { b.name = String(name).trim(); this._changed('chapter'); } return b; },
    removeBranch: function (id, bid) { const c = this.chapter(id); if (!c || !c.branches) return; c.branches = c.branches.filter(x => x.id !== bid); if (!c.branches.length) delete c.branches; this._changed('chapter'); },
    restore: function (id, at) {
      const c = this.chapter(id), h = c && (c.history || []).find(x => x.at === at); if (!h) return null;
      const text = h.text; this._snap(c, '恢复前'); c.text = text; c.updated_at = now(); this._changed('chapter'); return c;
    },
    /** 全书搜索：返回每处命中的章节、位置和上下文。 */
    search: function (q, limit) {
      q = str(q); const out = []; if (!q) return out; limit = limit || 500;
      this.chapters().forEach((c, ci) => { let i = c.text.indexOf(q);
        while (i >= 0 && out.length < limit) { out.push({ chapterId:c.id, no:ci + 1, title:c.title, index:i, before:c.text.slice(Math.max(0, i - 18), i).replace(/\n/g, ' '), after:c.text.slice(i + q.length, i + q.length + 18).replace(/\n/g, ' ') }); i = c.text.indexOf(q, i + q.length); } });
      return out;
    },
    /** 精确计数（不截断）：{ total, chapters }。 */
    searchCount: function (q) { q = str(q); let total = 0, chapters = 0; if (!q) return { total, chapters };
      this.chapters().forEach(c => { let n = 0, i = c.text.indexOf(q); while (i >= 0) { n++; i = c.text.indexOf(q, i + q.length); } if (n) { total += n; chapters++; } }); return { total, chapters }; },
    /** 全书替换。改动的章节先各存一份「替换前」历史稿。返回替换处数。 */
    replaceAll: function (q, rep, chapterIds) {
      q = str(q); rep = str(rep); if (!q || q === rep) return 0; let n = 0;
      const only = chapterIds ? new Set(chapterIds) : null;
      this.data.chapters.forEach(c => { if (only && !only.has(c.id)) return; const parts = c.text.split(q); if (parts.length < 2) return;
        this._snap(c, '替换「' + q + '」前'); n += parts.length - 1; c.text = parts.join(rep); c.updated_at = now(); });
      if (n) this._changed('chapter'); return n;
    },
    removeChapter: function (id) {
      const before = this.data.chapters.length;
      const gone = this.data.chapters.find(c => c.id === id);
      if (gone) { const T = this.data.chapterTrash = Array.isArray(this.data.chapterTrash) ? this.data.chapterTrash : []; T.unshift({ chapter:JSON.parse(JSON.stringify(gone)), deletedAt:now() }); T.length = Math.min(T.length, 20); } /* 删章进本书的章节回收站，可撤销/恢复 */
      this.data.chapters = this.data.chapters.filter(c => c.id !== id);
      this.chapters().forEach((c, i) => { c.order = i; });
      if (this.data.chapters.length !== before) this._changed('chapters');
    },
    /** 从章节回收站恢复：放回原来的位置（按 order），id 已被占用就不恢复 */
    restoreChapter: function (id) {
      const T = Array.isArray(this.data.chapterTrash) ? this.data.chapterTrash : [], k = T.findIndex(x => x.chapter && x.chapter.id === id); if (k < 0 || this.chapter(id)) return null;
      const c = T.splice(k, 1)[0].chapter, list = this.chapters(), at = Math.max(0, Math.min(list.length, c.order | 0)); list.splice(at, 0, c); list.forEach((x, i) => { x.order = i; }); this.data.chapters = list;
      if (c.volumeId && !(this.data.volumes || []).some(v => v.id === c.volumeId)) delete c.volumeId; this._changed('chapters'); return c;
    },
    moveChapter: function (id, delta) {
      const list = this.chapters(), i = list.findIndex(c => c.id === id), j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return false;
      if ((list[i].volumeId || '') !== (list[j].volumeId || '')) { // 跨卷：移到相邻卷的边上
        if (list[j].volumeId) list[i].volumeId = list[j].volumeId; else delete list[i].volumeId;
        this._changed('chapters'); return true;
      }
      [list[i], list[j]] = [list[j], list[i]];
      list.forEach((c, k) => { c.order = k; }); this._changed('chapters'); return true;
    },
    /** 把一段纯文本按「第X章 / # 标题」拆成多章。 */
    importText: function (text, fallbackTitle) {
      const lines = str(text).replace(/\r\n?/g, '\n').split('\n');
      const head = /^\s*(#{1,3}\s+.+|第[0-9一二三四五六七八九十百千零〇两]+[章回节卷].*)\s*$/;
      const parts = []; let cur = null;
      lines.forEach(l => {
        if (head.test(l)) { cur = { title:l.replace(/^\s*#+\s*/, '').trim(), lines:[] }; parts.push(cur); }
        else { if (!cur) { cur = { title:fallbackTitle || '导入的章节', lines:[] }; parts.push(cur); } cur.lines.push(l); }
      });
      // 书里只有一个空的默认章（没字、没细纲、没历史）：导入后把它去掉，免得目录里留一个空「第一章」
      const all = this.chapters(), lone = all.length === 1 && !all[0].text.trim() && !str(all[0].outline).trim() && !(all[0].history || []).length && /^(第[一1]章)?$/.test(str(all[0].title).trim()) ? all[0] : null;
      const made = parts.filter(p => p.lines.join('').trim() || parts.length === 1)
        .map(p => this.addChapter(p.title, p.lines.join('\n').trim()));
      if (lone && made.length) this.removeChapter(lone.id);
      return made;
    },

    /* ---------- 分卷 ---------- */
    volumes: function () { return this.data.volumes.slice().sort((a, b) => a.order - b.order); },
    volume: function (id) { return this.data.volumes.find(v => v.id === id) || null; },
    addVolume: function (title) {
      const v = { id:uid('VOL'), title:str(title).trim() || ('第' + (this.data.volumes.length + 1) + '卷'), order:this.data.volumes.length };
      this.data.volumes.push(v); this._changed('volumes'); return v;
    },
    renameVolume: function (id, title) { const v = this.volume(id); if (v) { v.title = str(title).trim() || v.title; this._changed('volumes'); } return v; },
    removeVolume: function (id) {
      this.data.volumes = this.data.volumes.filter(v => v.id !== id);
      this.data.chapters.forEach(c => { if (c.volumeId === id) delete c.volumeId; });
      this.volumes().forEach((v, i) => { v.order = i; }); this._changed('volumes');
    },
    /** 按卷分组的章节：[{ volume|null, chapters }]，未分卷的章节在最前。 */
    outline: function () {
      const all = this.chapters(), groups = [];
      const loose = all.filter(c => !c.volumeId);
      if (loose.length || !this.data.volumes.length) groups.push({ volume:null, chapters:loose });
      this.volumes().forEach(v => groups.push({ volume:v, chapters:all.filter(c => c.volumeId === v.id) }));
      return groups;
    },

    /* ---------- 伏笔 ---------- */
    foreshadows: function () { return this.data.foreshadows.slice(); },
    foreshadow: function (id) { return this.data.foreshadows.find(f => f.id === id) || null; },
    addForeshadow: function (fields) {
      const f = fields || {};
      const x = { id:uid('FS'), title:str(f.title).trim() || '未命名伏笔', note:str(f.note), plantedIn:f.plantedIn || null,
        dueChapter:parseInt(f.dueChapter, 10) || null, resolvedIn:null, created_at:now() };
      this.data.foreshadows.push(x); this._changed('foreshadows'); return x;
    },
    updateForeshadow: function (id, patch) {
      const f = this.foreshadow(id); if (!f) return null;
      ['title', 'note'].forEach(k => { if (k in patch) f[k] = str(patch[k]); });
      ['plantedIn', 'resolvedIn'].forEach(k => { if (k in patch) f[k] = patch[k] || null; });
      if ('dueChapter' in patch) f.dueChapter = parseInt(patch.dueChapter, 10) || null;
      this._changed('foreshadows'); return f;
    },
    removeForeshadow: function (id) { this.data.foreshadows = this.data.foreshadows.filter(f => f.id !== id); this._changed('foreshadows'); },
    /** 章节序号（从 1 开始），找不到返回 0。 */
    chapterNo: function (id) { return this.chapters().findIndex(c => c.id === id) + 1; },

    /* ---------- 码字目标 ---------- */
    templates: function () { return (this.data.writing.templates || []).slice(); },
    addTemplate: function (name, outline) { const t = { id:uid('TPL'), name:str(name).trim() || '我的模板', outline:str(outline) }; (this.data.writing.templates = this.data.writing.templates || []).push(t); this._changed('writing'); return t; },
    setReader: function (data) { if (data) this.data.reader = { cols:data.cols.slice(), rows:data.rows.map(r => ({ no:r.no, title:r.title, v:Object.assign({}, r.v) })), at:now() }; else delete this.data.reader; this._changed('reader'); },
    /** 写作时长：两次输入间隔 ≤ 2 分钟算在写；每小时的净增字数也记一笔。 */
    _logTime: function (k, delta, at) {
      const t = at || Date.now(), W = this.data.writing, T = W.time = isObj(W.time) ? W.time : {}, day = T[k] = isObj(T[k]) ? T[k] : { m:0, h:[] };
      if (!Array.isArray(day.h)) day.h = []; const hr = new Date(t).getHours(); day.h[hr] = (day.h[hr] || 0) + delta;
      if (this._lastType && t - this._lastType > 0 && t - this._lastType <= 120000) day.m = Math.round(((day.m || 0) + (t - this._lastType) / 60000) * 10) / 10;
      this._lastType = t;
    },
    /** 入正典：确认/忽略/故意这样写都记一笔，忽略过的不再弹。 */
    canonMark: function (key, action, note) { const W = this.data.writing, d = W.canonDismiss = isObj(W.canonDismiss) ? W.canonDismiss : {}; if (action !== 'accept') d[key] = { action, note:str(note).trim(), at:now() };
      (W.canonLog = Array.isArray(W.canonLog) ? W.canonLog : []).push({ key, action, note:str(note).trim(), at:now() }); if (W.canonLog.length > 500) W.canonLog.splice(0, W.canonLog.length - 500); this._changed('writing'); },
    /** 撤销一次标记（故意这样写/忽略/本章临时），让它重新出现在队列里 */
    canonUnmark: function (key) { const d = this.data.writing.canonDismiss; if (!d || !d[key]) return false; delete d[key]; this._changed('writing'); return true; },
    canonNote: function (key, note) { const d = this.data.writing.canonDismiss; if (!d || !d[key]) return false; d[key].note = str(note).trim(); this._changed('writing'); return true; },
    setRules: function (t) { this.data.writing.rules = str(t); this._changed('writing'); },
    setLadder: function (t) { this.data.writing.ladder = str(t).trim(); this._changed('writing'); },
    removeTemplate: function (id) { this.data.writing.templates = this.templates().filter(t => t.id !== id); this._changed('writing'); },
    setGoal: function (n) { this.data.writing.goal = Math.max(100, parseInt(n, 10) || 2000); this._changed('writing'); },

    /* ---------- 设定 ---------- */
    entities: function (filter) {
      const f = filter || {}, q = str(f.q).trim().toLowerCase();
      return this.data.nodes.filter(n => (!f.type || n.type === f.type) &&
        (!q || [n.name, n.summary, n.detail, n.id].some(x => str(x).toLowerCase().includes(q))));
    },
    entity: function (id) { return this.data.nodes.find(n => n.id === id) || null; },
    addEntity: function (fields) {
      const f = fields || {};
      const n = { id:uid(f.type || 'GEN'), name:str(f.name).trim() || '未命名', type:TYPES[f.type] ? f.type : 'PERSON',
        summary:str(f.summary), detail:str(f.detail), aliases:Array.isArray(f.aliases) ? f.aliases.map(str).filter(Boolean).join('、') : str(f.aliases), created_at:now(), updated_at:now() };
      this.data.nodes.push(n); this._changed('entities'); return n;
    },
    updateEntity: function (id, patch) {
      const n = this.entity(id); if (!n) return null;
      ['name', 'type', 'summary', 'detail', 'aliases'].forEach(k => { if (k in patch) n[k] = str(patch[k]); });
      if (!n.name.trim()) n.name = '未命名';
      n.updated_at = now(); this._changed('entity'); return n;
    },
    removeEntity: function (id) {
      this.data.nodes = this.data.nodes.filter(n => n.id !== id);
      this.data.relations = this.data.relations.filter(r => r.source !== id && r.target !== id);
      this.data.chats = this.data.chats.filter(c => c.characterId !== id);
      this._changed('entities');
    },
    /* ---------- 素材墙：灵感、片段、资料，可以挂到章节或设定上；正文里的 #标签 自动成为标签 ---------- */
    notes: function (filter) {
      const f = filter || {}, q = str(f.q).trim(), list = (this.data.notes || []).slice().sort((a, b) => (b.pinned - a.pinned) || String(b.at).localeCompare(String(a.at)));
      return list.filter(x => (!f.link || x.links.includes(f.link)) && (!f.tag || noteTags(x.text).includes(f.tag)) && (!q || x.text.includes(q)));
    },
    noteTags: function () { const m = new Map(); (this.data.notes || []).forEach(x => noteTags(x.text).forEach(t => m.set(t, (m.get(t) || 0) + 1))); return [...m].sort((a, b) => b[1] - a[1]); },
    addNote: function (text, links) {
      const x = { id:uid('NT'), text:str(text).trim(), links:(links || []).filter(Boolean).map(String), pinned:false, at:now() };
      (this.data.notes = this.data.notes || []).push(x); this._changed('notes'); return x;
    },
    updateNote: function (id, patch) {
      const x = (this.data.notes || []).find(y => y.id === id); if (!x) return null;
      if ('text' in patch) x.text = str(patch.text); if ('pinned' in patch) x.pinned = !!patch.pinned; if ('links' in patch) x.links = (patch.links || []).filter(Boolean).map(String);
      this._changed('notes'); return x;
    },
    linkNote: function (id, target, on) { const x = (this.data.notes || []).find(y => y.id === id); if (!x || !target) return null; const has = x.links.includes(target);
      if (on === undefined ? !has : on && !has) x.links.push(target); else if (has && !on) x.links = x.links.filter(l => l !== target); this._changed('notes'); return x; },
    removeNote: function (id) { this.data.notes = (this.data.notes || []).filter(y => y.id !== id); this._changed('notes'); },
    /* ---------- 状态变化（按章记录，如受伤、突破、获得物品、死亡） ---------- */
    addProgress: function (entityId, fields) {
      const n = this.entity(entityId); if (!n) return null; const f = fields || {};
      const x = { id:uid('PG'), chapterId:f.chapterId || null, text:str(f.text).trim(), dead:!!f.dead }; if (f.kind === 'power' || f.kind === 'res') x.kind = f.kind;
      (n.progress = n.progress || []).push(x); this._changed('entities'); return x;
    },
    updateProgress: function (entityId, pid, patch) {
      const n = this.entity(entityId), x = n && (n.progress || []).find(y => y.id === pid); if (!x) return null;
      if ('text' in patch) x.text = str(patch.text); if ('chapterId' in patch) x.chapterId = patch.chapterId || null; if ('dead' in patch) x.dead = !!patch.dead; if ('kind' in patch) { if (patch.kind === 'power' || patch.kind === 'res') x.kind = patch.kind; else delete x.kind; }
      this._changed('entities'); return x;
    },
    removeProgress: function (entityId, pid) { const n = this.entity(entityId); if (!n || !n.progress) return; n.progress = n.progress.filter(y => y.id !== pid); this._changed('entities'); },
    /** 某设定的状态变化，按章节顺序；upTo（章节序号，从 1 起）只返回截至该章的。 */
    progressOf: function (entityId, upTo) {
      const n = this.entity(entityId); if (!n || !n.progress) return [];
      const no = id => this.chapterNo(id) || Infinity;
      return n.progress.map(x => Object.assign({ no:no(x.chapterId) }, x)).filter(x => !upTo || x.no <= upTo).sort((a, b) => a.no - b.no);
    },
    /** 截至第 upTo 章已经死亡的设定 id。 */
    deadBy: function (upTo) { return this.data.nodes.filter(n => this.progressOf(n.id, upTo).some(x => x.dead)).map(n => n.id); },
    relationsOf: function (id) {
      return this.data.relations.map((r, index) => ({ index, r })).filter(x => x.r.source === id || x.r.target === id)
        .map(x => ({ index:x.index, label:x.r.label, otherId:x.r.source === id ? x.r.target : x.r.source,
          outgoing:x.r.source === id, other:this.entity(x.r.source === id ? x.r.target : x.r.source) }));
    },
    addRelation: function (source, target, label) {
      if (!this.entity(source) || !this.entity(target) || source === target) return null;
      const r = { source, target, label:str(label).trim() || '相关', created_at:now() };
      this.data.relations.push(r); this._changed('relations'); return r;
    },
    removeRelation: function (index) {
      if (index < 0 || index >= this.data.relations.length) return;
      this.data.relations.splice(index, 1); this._changed('relations');
    },

    /* ---------- 角色对话 ---------- */
    chat: function (characterId) { return this.data.chats.find(c => c.characterId === characterId) || null; },
    ensureChat: function (characterId) {
      let c = this.chat(characterId);
      if (!c) { c = { id:uid('CHAT'), characterId, messages:[], created_at:now() }; this.data.chats.push(c); }
      return c;
    },
    addMessage: function (characterId, role, text) {
      const m = { role, text:str(text), at:now() };
      this.ensureChat(characterId).messages.push(m); this._changed('chat'); return m;
    },
    clearChat: function (characterId) {
      const c = this.chat(characterId); if (c) { c.messages = []; this._changed('chat'); }
    },
  };
  return Project;
}));
