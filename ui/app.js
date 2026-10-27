/*! 千章 · ui/app.js · 应用外壳：导航、路由、自动保存、主题
 * 页面模块注册在 QZPages[name] = { label, icon, render(app, params), mount?(app, params, el), actions?{} }。
 * 点击 [data-act="页面.动作"] 或 [data-act="动作"] 由这里统一分发。 */
(function (root) {
  'use strict';
  const UI = root.QZUI, Project = root.QZStore, Storage = root.QZStorage;
  /** 侧栏只留 5 个入口；同组页面用顶部小标签切换。路由不变，旧书签照样能用。 */
  const GROUPS = [
    { k:'write', label:'写作', icon:'pen', pages:['write'] },
    { k:'plan', label:'规划', icon:'map', pages:['plan', 'library', 'notes'], tabs:{ plan:'大纲与伏笔', library:'设定库与关系图', notes:'素材墙' } },
    { k:'insight', label:'分析', icon:'chart', pages:['insight'] },
    { k:'publish', label:'发布', icon:'share', pages:['publish'] },
    { k:'more', label:'更多', icon:'more', pages:['home', 'chat', 'settings'], tabs:{ home:'概览', chat:'角色聊天', settings:'设置与备份' } }];
  const groupOf = page => GROUPS.find(g => g.pages.includes(page)) || GROUPS[4];
  const LAST = 'qianzhang:last-route:', CURRENT = 'qianzhang:current', THEME = 'qianzhang:theme';

  function App(el) {
    this.el = el; this.storage = new Storage(); this.project = null; this.storage.onQuota = () => { if (!this._quotaWarned) { this._quotaWarned = true; UI.toast('浏览器存储空间满了，浏览器里的备用副本没存上（本地文件不受影响）。可以在设置里导出备份后清理旧书。', 'err'); } };
    this.route = { page:'home', params:[] }; this.saveState = 'idle'; this._timer = null;
    // 关页/切后台：立刻同步存，不等 0.7 秒的防抖（构造时就挂上，最早的改动也护住）
    if (typeof root.addEventListener === 'function') { root.addEventListener('beforeunload', e => { if (this.saveNow() === 'risky') { e.preventDefault(); e.returnValue = ''; } }); /* 只有真的可能丢稿（上次保存失败、发不出去）才拦；已存好或正在随关页一起发出的不打扰 */ root.addEventListener('pagehide', () => this.saveNow()); }
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.saveNow(); });
  }
  App.prototype = {
    pages: function () { return root.QZPages; },
    start: function () {
      // 自检：有页面脚本没注册上（多半是语法错），顶部给一条看得见的提示，而不是静悄悄失效
      const need = ['home', 'write', 'plan', 'library', 'publish', 'settings'], miss = need.filter(k => !(root.QZPages || {})[k]); if (/[?&]selfcheck=fail\b/.test(location.search)) miss.push('selfcheck-test'); /* 隐藏开关：?selfcheck=fail 强制显示自检提示，方便验证 */
      if (miss.length || !root.QZCraft || !root.QZStore) setTimeout(() => { const b = document.createElement('div'); b.className = 'boot-error'; b.setAttribute('role', 'alert');
        b.textContent = '有功能没能加载（' + miss.concat(!root.QZCraft ? ['craft'] : [], !root.QZStore ? ['store'] : []).join('、') + '）。你的稿子不受影响，请刷新页面；还不行就把这句话发给开发者。'; document.body.prepend(b); }, 0);
      this.applyTheme(this.theme());
      this.el.innerHTML = this.shell();
      this.bind();
      return this.storage.connect().then(() => { this.attachKeys(); return this.open(localStorage.getItem(CURRENT) || 'workspace'); })
        .then(() => { window.addEventListener('hashchange', () => this.go()); const O = this.pages().onboard;
          if (O && !this.noBook() && O.shouldShow(this) && !/^#\/write\//.test(location.hash)) this.navigate('onboard', true); else this.go(); });
    },
    /** 连上本地服务：AI 密钥改由本地服务加密保存；旧版存在浏览器里的明文密钥搬过去后删除 */
    attachKeys: function () {
      this.renderQuit();
      const AI = root.QZAI; if (!AI || !this.storage.server) return Promise.resolve();
      const st = this.storage;
      return AI.attachVault({ get:() => st.aiKey('get'), set:k => st.aiKey('set', k) }).then(r => { if (r && r.error) UI.toast(r.error, 'err'); }).catch(() => {});
    },
    /** 由 Qianzhang.exe 启动时，侧栏常驻「退出千章」；在默认浏览器里打开时关页面不会退出，这是主要的退出方式 */
    renderQuit: function () {
      const host = document.getElementById('qz-quit'); if (!host) return;
      host.hidden = !this.storage.app; host.classList.toggle('attn', this.storage.mode === 'browser');
    },
    quitApp: function () {
      return UI.confirm('退出千章', '会先保存，然后关闭千章的本地服务。之后这个页面就不能再保存了，可以直接关掉。', '退出').then(ok => {
        if (!ok) return; return Promise.resolve(this.flush && this.flush()).catch(() => {}).then(() => this.storage.quit()).then(done => {
          if (!done) return UI.toast('没能退出：本地服务没有响应', 'err');
          document.body.innerHTML = '<div class="quit-done"><h1>千章已退出</h1><p>可以关闭这个页面了。再次使用时，双击 Qianzhang.exe。</p></div>';
        }).catch(() => UI.toast('没能退出：本地服务没有响应', 'err'));
      });
    },
    /* ---------- 作品 ---------- */
    open: function (id) {
      let failed = false;
      return this.storage.load(id).catch(e => { failed = true; UI.toast(e.message + '。为了不覆盖磁盘上的稿子，这次先不保存，请刷新重试', 'err'); return this.storage._localGet ? this.storage._localGet(id) : null; }).then(raw => {
        // 找不到这本书（比如刚删进回收站、或浏览器记的是旧书）：别凭空建一本以 id 为名的空书盖上去，回到最近的一本
        if (!raw && !failed && id === 'workspace' && !this._triedShelf) { this._triedShelf = true; return this.storage.list().then(l => { const b = (l || []).find(x => x.id !== 'workspace'); return this.open(b ? b.id : 'workspace'); }); } /* 没有上次的书：书架上有书就打开第一本 */
        if (!raw && !failed && id !== 'workspace') return this.storage.list().then(l => { const next = l.find(x => x.id !== id); return this.open(next ? next.id : 'workspace'); });
        this._loadFailed = failed;
        this.project = new Project(raw || { project_id:id, meta:{ title:id === 'workspace' ? '我的作品' : id } }, id);
        this._implicit = !raw && !failed && id === 'workspace'; /* 书架是空的：只在内存里放一本草稿，写下第一章或第一条设定前不落盘，也不进书单 */
        if (!raw && !failed && id !== 'workspace' && Storage.validId(id)) this.storage.save(id, this.project.toJSON()).catch(() => {}); // 新建的书立刻落盘；首次打开的默认「我的作品」等写下第一个字再存，不留空书
        if (raw && this.storage.takeNewerLocal && this.storage.takeNewerLocal(id)) setTimeout(() => this.scheduleSave(), 0); // 浏览器副本更新，补存到本地文件
        localStorage.setItem(CURRENT, id);
        this.project.onChange(() => this.scheduleSave());
        this.refreshChrome();
      });
    },
    /** 切书：回到这本书上次停留的位置（没有就回首页）。 */
    switchTo: function (id) {
      return this.flush().then(() => this.open(id)).then(() => {
        const last = localStorage.getItem(LAST + id), parts = last ? last.replace(/^#\/?/, '').split('/').map(decodeURIComponent) : [];
        const ok = parts[0] && this.pages()[parts[0]] && (parts[0] !== 'write' || !parts[1] || this.project.chapter(parts[1]));
        if (ok) { this.navigate(parts[0], true, parts.slice(1)); const c = parts[0] === 'write' && parts[1] && this.project.chapter(parts[1]); UI.toast('已切换到《' + this.project.title + '》' + (c ? '，回到上次写的「' + c.title + '」' : '')); }
        else this.navigate('home', true);
      });
    },
    createProject: function (title, raw) {
      const base = String(title || 'book').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
      const id = (base && /^[a-z0-9]/.test(base) ? base : 'book') + '-' + Date.now().toString(36);
      const data = Object.assign({}, raw || {}, { project_id:id });
      data.meta = Object.assign({}, data.meta, { title:title || '未命名作品' });
      const p = new Project(data, id);
      return this.storage.save(id, p.toJSON()).then(() => this.switchTo(id));
    },
    /** 删除作品：确认后移进回收站，可在「回收站」恢复。删的是当前书就切到别的书。 */
    deleteProject: function (id, title) {
      id = id || this.project.id; title = title || (id === this.project.id ? this.project.title : id);
      return UI.confirm('删除作品', '把《' + title + '》移进回收站？之后可以在 设置 → 回收站 里恢复。', '移进回收站').then(ok => {
        if (!ok) return false; const cur = id === this.project.id;
        return (cur ? this.flush().then(() => this.storage.save(id, this.project.toJSON())) : Promise.resolve()).then(() => { if (cur) { clearTimeout(this._timer); this.saveState = 'idle'; } return this.storage.trash(id); }) /* 先确保真的落盘一份，回收站里才有东西可恢复 */
          .then(() => this.storage.list()).then(l => { const next = l.find(x => x.id !== id); UI.toast('已移进回收站：《' + title + '》');
            if (!cur) return true; if (next) return this.switchTo(next.id).then(() => true);
            return this.createProject('未命名作品').then(() => true); })
          .catch(e => { UI.toast(e.message, 'err'); return false; });
      });
    },
    trashDialog: function () {
      const ct = (this.project && Array.isArray(this.project.data.chapterTrash)) ? this.project.data.chapterTrash : [], chs = ct.length ? '<h4 class="trash-h">本书删掉的章节</h4><div class="trash-list">' + ct.map(x => '<div class="trash-item"><span><b>' + UI.esc(x.chapter.title || '无题') + '</b><small>' + new Date(x.deletedAt).toLocaleString() + ' 删除 · ' + Array.from(String(x.chapter.text || '')).length + ' 字</small></span><button class="btn sm" data-chrestore="' + UI.esc(x.chapter.id) + '">恢复章节</button></div>').join('') + '</div><h4 class="trash-h">删掉的作品</h4>' : '';
      return this.storage.trashList().then(items => UI.modal({ title:'回收站', body:chs + (items.length ? '<div class="trash-list">' + items.map((x, i) => '<div class="trash-item"><span><b>' + UI.esc(x.title) + '</b><small>' + new Date(x.deletedAt).toLocaleString() + ' 删除</small></span><button class="btn sm" data-restore="' + i + '">恢复</button><button class="btn ghost sm danger" data-purge="' + i + '" title="彻底删除，无法恢复">彻底删除</button></div>').join('') + '</div><div class="trash-foot"><button class="btn ghost sm danger" data-purge-all title="彻底删除回收站里的全部作品，无法恢复">清空回收站（' + items.length + '）</button></div>' : '<p class="muted">回收站是空的。删除的作品会先放在这里。</p>'),
        buttons:[{ label:'关闭', value:null }], onOpen: w => { const sync = () => { const n = w.querySelectorAll('.trash-list [data-purge]').length, pa = w.querySelector('[data-purge-all]'); if (pa && !pa.disabled) { if (n) { pa.textContent = '清空回收站（' + n + '）'; delete pa.dataset.sure; } else pa.remove(); } }; w.addEventListener('click', e => { const cr = e.target.closest('[data-chrestore]'); if (cr) { e.stopPropagation(); const c = this.project.restoreChapter(cr.dataset.chrestore); if (c) { cr.closest('.trash-item').remove(); sync(); UI.toast('已恢复章节「' + (c.title || '无题') + '」'); this.renderPage && this.renderPage(); } return; } const pa = e.target.closest('[data-purge-all]'); if (pa) { e.stopPropagation(); if (pa.dataset.sure !== '1') { pa.dataset.sure = '1'; pa.textContent = '再点一次确认清空'; return; } pa.disabled = true; const left = items.filter((x, i) => w.querySelector('[data-purge="' + i + '"]')); left.reduce((q, it) => q.then(() => this.storage.purge(it)), Promise.resolve()).then(() => { w.querySelector('.trash-list').innerHTML = ''; pa.remove(); UI.toast('回收站已清空（' + left.length + ' 本）'); }).catch(err => UI.toast(err.message, 'err')); return; } const pg = e.target.closest('[data-purge]'); if (pg) { e.stopPropagation(); const it = items[+pg.dataset.purge]; if (pg.dataset.sure !== '1') { pg.dataset.sure = '1'; pg.textContent = '再点一次确认'; return; } this.storage.purge(it).then(() => { pg.closest('.trash-item').remove(); sync(); UI.toast('已彻底删除《' + it.title + '》'); }); return; }
          const b = e.target.closest('[data-restore]'); if (!b) return; e.stopPropagation(); b.disabled = true;
          this.storage.restore(items[+b.dataset.restore]).then(id => { UI.toast('已恢复'); w.querySelector('[data-i="0"]').click(); return this.switchTo(id); }).catch(err => UI.toast(err.message, 'err')); }, true); } }));
    },
    /** 空书架上的隐式草稿：还没有任何章节/设定，就不保存（改目标、改设置都不会留下空书） */
    /** 书架为空、只有内存里的隐式草稿：顶栏不显示“当前作品”，也不进引导。 */
    noBook: function () { return !!(this._implicit && this.draftOnly()); },
    draftOnly: function () {
      if (!this._implicit || !this.project) return false;
      const d = this.project.data || {}, has = (this.project.chapters ? this.project.chapters().length : 0) || (d.nodes || []).length;
      if (has) { this._implicit = false; return false; }
      return true;
    },
    scheduleSave: function () {
      if (this.draftOnly()) return;
      if (this._loadFailed) { this.setSaveState('error'); return; } // 读取失败时不写，免得把磁盘上的好稿子盖成空的
      this._ver = (this._ver || 0) + 1; // 改动版本号：保存途中又改了，回来后要再存一次
      if (this.saveState !== 'conflict') this.setSaveState('dirty'); clearTimeout(this._timer);
      this._timer = setTimeout(() => this.flush(), 700);
    },
    /** 关页/切后台：有没存的改动就立刻整本发出（keepalive，不排队），同时写浏览器副本。返回是否有改动。 */
    saveNow: function () {
      if (!this.project || !this.storage || this.draftOnly()) return false; const st = this.saveState, dirty = st === 'dirty' || st === 'saving' || st === 'error' || (this._ver || 0) !== (this._sentVer || 0);
      if (!dirty) return false; if (st === 'conflict') return 'risky'; clearTimeout(this._timer); const v = this._ver || 0;
      try { const p = this.storage.save(this.project.id, this.project.toJSON(), { unload:true }); this._sentVer = v; if (p && p.then) p.then(() => { if ((this._ver || 0) === v) this.setSaveState('saved'); }, () => {}); } catch (e) { return 'risky'; /* 页面要走了，能做的只有这些 */ }
      return st === 'error' ? 'risky' : 'sent';
    },
    flush: function () {
      clearTimeout(this._timer);
      if (this._inflight) return this._inflight.then(() => this.flush());
      if (!this.project || this.draftOnly() || (this.saveState !== 'dirty' && this.saveState !== 'error')) return Promise.resolve();
      const v = this._ver || 0, id = this.project.id; this.setSaveState('saving'); this._sentVer = v;
      const p = this._inflight = this.storage.save(id, this.project.toJSON())
        .then(where => { this._inflight = null; clearTimeout(this._retry);
          if ((this._ver || 0) !== v && this.project && this.project.id === id) { this.setSaveState('dirty'); return this.flush(); }
          this.setSaveState(where === 'server' ? 'saved' : 'local'); })
        .catch(e => { this._inflight = null;
          if (e && e.conflict) { this.setSaveState('conflict'); UI.toast(e.message, 'err'); return; }
          const first = this.saveState !== 'error'; this.setSaveState('error'); if (first) UI.toast('保存失败：' + e.message + '（会自动重试，左下角状态栏会一直显示）', 'err'); /* 只提示一次，之后状态栏常驻 */
          clearTimeout(this._retry); this._retry = setTimeout(() => { if (this.saveState === 'error') this.flush(); }, 15000); });
      return p;
    },
    setSaveState: function (s) {
      this.saveState = s;
      const el = document.getElementById('save-state'); if (!el) return;
      const map = { idle:['', '已同步'], dirty:['busy', '有改动…'], saving:['busy', '保存中…'], saved:['ok', '已保存到本地文件'], conflict:['err', '另一个窗口改过，请刷新'], local:['ok', '已保存在浏览器'], error:['err', '未保存 · 重试中'] };
      el.className = 'save-state ' + map[s][0]; el.querySelector('span').textContent = map[s][1];
    },
    /* ---------- 主题 ---------- */
    theme: function () { return localStorage.getItem(THEME) || 'light'; },
    applyTheme: function (t) { document.documentElement.dataset.theme = t; },
    toggleTheme: function () {
      const t = this.theme() === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME, t); this.applyTheme(t); this.refreshChrome();
    },
    /* ---------- 路由 ---------- */
    navigate: function (page, replace, params) {
      const h = '#/' + page + (params && params.length ? '/' + params.map(encodeURIComponent).join('/') : '');
      if (location.hash === h) this.go(); else if (replace) { history.replaceState(null, '', h); this.go(); } else location.hash = h;
    },
    go: function () {
      const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
      const page = this.pages()[parts[0]] ? parts[0] : 'home';
      if (this.focus && page !== 'write' && this.pages().write.focusLocked(this)) { // 小黑屋锁定中
        const dest = location.hash; history.replaceState(null, '', '#/write/' + encodeURIComponent(this.focus.chapterId || '')); this.pages().write.lockBar(this, () => { location.hash = dest; }); return;
      }
      if (this.focus && page !== 'write') { clearInterval(this.focus.timer); this.focus = null; document.body.classList.remove('focus-mode'); }
      this.route = { page, params:parts.slice(1) };
      if (this.project && page !== 'home') try { localStorage.setItem(LAST + this.project.id, location.hash); } catch (e) { /* 存不下就算了 */ }
      this.renderPage();
    },
    renderPage: function () {
      const P = this.pages()[this.route.page], main = document.getElementById('main');
      if (!P || !this.project) return;
      { const t = document.getElementById('ch-text'), c = t && this.project.chapter(t.dataset.id); if (c && t.value !== c.text && t._base === c.text && t.value !== t._base) this.project.updateChapter(c.id, { text:t.value }); } // 重绘前把还没落进数据的正文收进来，不丢字
      const g = groupOf(this.route.page), tabs = g.tabs && g.pages.includes(this.route.page) ? '<nav class="subtabs">' + g.pages.filter(k => this.pages()[k]).map(k => '<a href="#/' + k + '" class="' + (k === this.route.page ? 'on' : '') + '">' + g.tabs[k] + '</a>').join('') + '</nav>' : '';
      document.querySelectorAll('.nn-card').forEach(x => x.remove());
      main.innerHTML = '<div class="page page-' + this.route.page + (tabs ? ' has-tabs' : '') + '">' + tabs + P.render(this, this.route.params) + '</div>';
      main.scrollTop = 0;
      if (P.mount) P.mount(this, this.route.params, main);
      { const t = document.getElementById('ch-text'); if (t) t._base = t.value; }
      this.refreshChrome();
      document.title = this.noBook() ? '千章' : (P.label === '首页' ? '' : P.label + ' · ') + this.project.title + ' · 千章';
    },
    /* ---------- 外壳 ---------- */
    shell: function () {
      return '<aside class="sidebar" id="sidebar"><a class="brand" href="#/home" title="概览"><b class="wordmark">千章</b><small>陪你写到第一千章</small></a>'
        + '<button class="project-switch" data-act="home.switch" id="project-switch" title="切换作品（Alt+B）" aria-haspopup="listbox"></button>'
        + '<button class="pal-btn" data-act="palette" title="命令面板（Ctrl+K）">' + UI.icon('search') + '<span>搜索</span><kbd>Ctrl K</kbd></button>' + '<nav class="nav" id="nav"></nav><div class="side-foot"><div class="save-state" id="save-state"><i></i><span>已同步</span></div>'
        + '<a class="icon-btn" href="#/settings" id="settings-btn" title="设置（备份、回收站、外观）" aria-label="设置">' + UI.icon('settings') + '</a><button class="icon-btn" data-act="theme" id="theme-btn" title="切换深浅色"></button></div>'
        + '<button class="btn sm quit-btn" data-act="quit" id="qz-quit" hidden title="保存并关闭千章">' + UI.icon('x') + '退出千章</button></aside>'
        + '<main class="main" id="main"></main><div id="toasts" class="toasts"></div>';
    },
    refreshChrome: function () {
      const nav = document.getElementById('nav'); if (!nav) return;
      const P = this.pages();
      const cur = groupOf(this.route && this.route.page);
      const mini = P.onboard && this.project && P.onboard.minimal(this);
      document.body.classList.toggle('ob-minimal', !!mini);
      nav.innerHTML = GROUPS.filter(g => !mini || g.k === 'write' || g.k === 'more').map(g => { const first = g.pages.find(k => P[k]), badge = g.pages.map(k => P[k] && P[k].badge && this.project ? P[k].badge(this) : 0).find(Boolean);
        return first ? '<a href="#/' + first + '" class="nav-item' + (cur === g ? ' on' : '') + '" data-group="' + g.k + '">' + UI.icon(g.icon) + '<span data-short="' + g.label + '">' + g.label + '</span>' + (badge ? '<em class="nav-badge" title="已逾期的伏笔">' + badge + '</em>' : '') + '</a>' : ''; }).join('');
      if (this.project && this.noBook()) document.getElementById('project-switch').innerHTML = '<span class="ps-label">还没有作品</span><span class="ps-caret">' + UI.icon('chevron') + '</span>';
      else if (this.project) document.getElementById('project-switch').innerHTML = '<span class="ps-label">当前作品</span><span class="ps-title" title="' + UI.esc(this.project.title) + '">' + UI.esc(this.project.title) + '</span><span class="ps-caret">' + UI.icon('chevron') + '</span>';
      document.getElementById('theme-btn').innerHTML = UI.icon(this.theme() === 'dark' ? 'sun' : 'moon');
    },
    bind: function () {
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = document.querySelectorAll('details.menu[open]'); if (m.length) { m.forEach(d => { d.removeAttribute('open'); const s = d.querySelector('summary'); s && s.focus(); }); e.stopPropagation(); } } }, true);
      document.addEventListener('click', e => {
        const mp = e.target.closest('.menu-pop button'); if (mp) { const d = mp.closest('details.menu'); if (d) d.removeAttribute('open'); } // 点了菜单项就收起
        if (!e.target.closest('details.menu')) document.querySelectorAll('details.menu[open]').forEach(d => d.removeAttribute('open'));
        const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
        const [a, b] = t.dataset.act.split('.');
        if (!b) { if (a === 'theme') this.toggleTheme(); if (a === 'palette' && root.QZPalette) root.QZPalette.open(this); if (a === 'quit') this.quitApp(); return; }
        const P = this.pages()[a], fn = P && P.actions && P.actions[b];
        if (fn) { e.preventDefault(); fn(this, t, e); }
      });
      document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.flush().then(() => UI.flash('已保存')); return; }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k' && root.QZPalette && this.project) { e.preventDefault(); root.QZPalette.open(this); return; }
        if (document.querySelector('.modal-wrap')) return;
        if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'b' && this.pages().home.switcher) { e.preventDefault(); this.pages().home.switcher(this); return; }
        const P = this.pages()[this.route.page];
        if (P && P.onKey && this.project && P.onKey(this, e)) e.preventDefault();
      });
    },
  };
  root.QZApp = App;
}(typeof self !== 'undefined' ? self : globalThis));
