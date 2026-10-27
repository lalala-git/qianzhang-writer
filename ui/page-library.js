/*! 千章 · ui/page-library.js · 角色与设定：卡片/列表 + 详情抽屉 */
(function (root) {
  'use strict';
  const UI = root.QZUI, { esc, icon } = UI;
  const Pages = root.QZPages = root.QZPages || {};
  const TYPES = () => root.QZStore.TYPES;
  const VIEW = 'qianzhang:library-view';
  const state = { q:'', type:'' };
  const typeLabel = t => TYPES()[t] || t || '其他';

  /** 人物关系图：只画有关系的设定，点圆圈打开详情。 */
  function graph(app) {
    const p = app.project, rels = p.data.relations.filter(r => p.entity(r.source) && p.entity(r.target) && r.source !== r.target);
    const shown = new Set(app.project.entities(state).map(n => n.id)), ids = [...new Set(rels.flatMap(r => [r.source, r.target]))].filter(id => shown.has(id));
    if (!ids.length) return '<div class="empty-state small"><span class="empty-icon">' + icon('users') + '</span><h2>还没有人物关系</h2><p>打开一个角色，在详情里「添加关系」，比如「师徒」「宿敌」，这里就会画出关系图。</p></div>';
    const W = 900, H = Math.max(460, Math.min(760, 300 + ids.length * 20)), es = rels.filter(r => ids.includes(r.source) && ids.includes(r.target));
    const pos = root.QZCraft.layoutGraph(ids, es, W, H), deg = {}; es.forEach(r => { deg[r.source] = (deg[r.source] || 0) + 1; deg[r.target] = (deg[r.target] || 0) + 1; });
    if (ids.length <= 3) { const gap = ids.length === 2 ? 320 : 280, cx = W / 2, cy = H / 2; ids.forEach((id, k) => { pos[id] = ids.length === 3 ? { x:cx + Math.cos(-Math.PI / 2 + k * 2 * Math.PI / 3) * gap * .6, y:cy + 20 + Math.sin(-Math.PI / 2 + k * 2 * Math.PI / 3) * gap * .6 } : { x:cx + (k ? gap : -gap) / 2, y:cy }; }); } /* 两三个人时别拉到画布两端，名字会被裁掉 */
    const rad = id => 14 + Math.min(10, (deg[id] || 0) * 2), pair = {}, pairN = {};
    es.forEach(r => { const k = [r.source, r.target].sort().join('|'); pairN[k] = (pairN[k] || 0) + 1; });
    const lines = es.map(r => { const a = pos[r.source], b = pos[r.target], k = [r.source, r.target].sort().join('|'), n = pairN[k], i = pair[k] = (pair[k] || 0) + 1;
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, flip = r.source < r.target ? 1 : -1;
      const off = n > 1 ? (i - (n + 1) / 2) * 46 * flip : 0, ra = rad(r.source) + 3, rb = rad(r.target) + 3; /* 同一对人有几条关系就画几条弧线，标签各在各的弧上；线从圆边开始 */
      const x1 = a.x + ux * ra, y1 = a.y + uy * ra, x2 = b.x - ux * rb, y2 = b.y - uy * rb, mx = (a.x + b.x) / 2 - uy * off, my = (a.y + b.y) / 2 + ux * off;
      const lx = (x1 + 2 * mx + x2) / 4, ly = (y1 + 2 * my + y2) / 4, f = v => v.toFixed(1);
      return '<g class="g-edge" data-s="' + esc(r.source) + '" data-t="' + esc(r.target) + '"><path d="M' + f(x1) + ' ' + f(y1) + ' Q' + f(mx) + ' ' + f(my) + ' ' + f(x2) + ' ' + f(y2) + '"/>' + (r.label ? '<text x="' + f(lx) + '" y="' + f(ly - 5) + '">' + esc(r.label) + '</text>' : '') + '</g>'; }).join('');
    const dots = ids.map(id => { const n = p.entity(id), q = pos[id], r = 14 + Math.min(10, (deg[id] || 0) * 2);
      return '<a class="g-node" href="#/library/' + encodeURIComponent(id) + '" data-id="' + esc(id) + '"><circle cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="' + r + '" style="--h:' + UI.hue(n.name) + '"/><text class="g-init" x="' + q.x.toFixed(1) + '" y="' + (q.y + 5).toFixed(1) + '">' + esc(Array.from(n.name)[0]) + '</text><text class="g-name" x="' + q.x.toFixed(1) + '" y="' + (q.y + r + 15).toFixed(1) + '">' + esc(n.name) + '</text></a>'; }).join('');
    return '<div class="graph-wrap"><svg class="rel-graph" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="人物关系图">' + lines + dots + '</svg><p class="muted small">' + ids.length + ' 个设定 · ' + es.length + ' 条关系。悬停圆圈高亮相关的人，点击打开详情。</p></div>';
  }
  function cards(app) {
    const list = app.project.entities(state);
    const view = (typeof localStorage !== 'undefined' && localStorage.getItem(VIEW)) || 'grid';
    if (view === 'graph') return graph(app);
    if (!list.length) return '<div class="empty-state small"><span class="empty-icon">' + icon('users') + '</span><h2>' + (app.project.data.nodes.length ? '没有匹配的设定' : '还没有任何设定') + '</h2><p>' + (app.project.data.nodes.length ? '换个关键词或类别试试。' : '先建一个主角吧，名字和一句话简介就够了。') + '</p><button class="btn primary" data-act="library.add">' + icon('plus') + '新建设定</button></div>';
    return '<div class="entity-' + view + '">' + list.map(n => {
      const rels = app.project.relationsOf(n.id).length;
      return '<button class="entity-card" data-act="library.open" data-id="' + esc(n.id) + '">' + UI.avatar(n.name, n.type === 'PERSON' ? '' : 'sq')
        + '<span class="ec-body"><span class="ec-head"><b>' + esc(n.name) + '</b><span class="tag t-' + esc(n.type) + '">' + esc(typeLabel(n.type)) + '</span></span>'
        + '<span class="ec-sum">' + (esc(n.summary) || '<i class="muted">暂无简介</i>') + '</span>'
        + (rels ? '<span class="ec-meta">' + icon('link') + rels + ' 条关系</span>' : '') + '</span></button>';
    }).join('') + '</div>';
  }

  function drawer(app, id) {
    const p = app.project, n = p.entity(id); if (!n) return '';
    const others = p.data.nodes.filter(x => x.id !== n.id);
    const still = state.lastDrawer === id; state.lastDrawer = id;
    return '<div class="drawer-mask' + (still ? ' still' : '') + '" data-act="library.close"></div><aside class="drawer' + (still ? ' still' : '') + '" role="dialog" aria-label="设定详情">'
      + '<div class="drawer-head">' + UI.avatar(n.name, 'lg' + (n.type === 'PERSON' ? '' : ' sq')) + '<div class="grow"><input class="title-input" data-f="name" value="' + esc(n.name) + '" aria-label="名称"><select class="select sm" data-f="type">'
      + Object.keys(TYPES()).map(k => '<option value="' + k + '"' + (k === n.type ? ' selected' : '') + '>' + TYPES()[k] + '</option>').join('') + (TYPES()[n.type] ? '' : '<option selected>' + esc(n.type) + '</option>') + '</select></div>'
      + '<button class="icon-btn" data-act="library.close" aria-label="关闭">' + icon('x') + '</button></div>'
      + '<div class="drawer-body"><label class="field"><span>别名 / 外号（逗号分隔，体检时一起识别）</span><input class="input" data-f="aliases" value="' + esc(n.aliases || '') + '" placeholder="如：阿河, 小沈"></label><label class="field"><span>一句话简介</span><textarea class="input" rows="2" data-f="summary" placeholder="TA 是谁？">' + esc(n.summary) + '</textarea></label>'
      + '<label class="field"><span>详细设定</span><textarea class="input" rows="7" data-f="detail" placeholder="外貌、性格、经历、秘密……">' + esc(n.detail) + '</textarea></label>'
      + progressHtml(p, n)
      + '<div class="field"><span>关系</span><div class="rel-list">' + (p.relationsOf(n.id).map(r => '<div class="rel">' + UI.avatar(r.other ? r.other.name : '?', 'sm') + '<span class="grow"><b>' + esc(r.other ? r.other.name : r.otherId) + '</b><small>' + (r.outgoing ? '' : '对方 → ') + esc(r.label) + '</small></span><button class="icon-btn sm" data-act="library.unlink" data-i="' + r.index + '" title="移除关系">' + icon('x') + '</button></div>').join('') || '<p class="muted">还没有关系</p>') + '</div>'
      + (others.length ? '<div class="rel-add"><select class="select" id="rel-target">' + others.map(o => '<option value="' + esc(o.id) + '">' + esc(o.name) + '</option>').join('') + '</select><input class="input" id="rel-label" placeholder="关系，如：师徒"><button class="btn" data-act="library.link">添加</button></div>' : '') + '</div></div>'
      + '<div class="drawer-foot"><button class="btn danger ghost" data-act="library.remove">' + icon('trash') + '删除</button><span class="grow"></span><a class="btn primary" href="#/chat/' + encodeURIComponent(n.id) + '">' + icon('chat') + '和 TA 聊天</a></div></aside>';
  }

  const kindSel = x => '<select class="select sm pg-kind" data-pg="kind" data-pid="' + esc(x.id) + '" title="标成「境界」或「资源」后，分析页会画成长线并提醒升太快、停滞、资源透支">' + [['', '变化'], ['power', '境界'], ['res', '资源']].map(o => '<option value="' + o[0] + '"' + ((x.kind || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
  function progressHtml(p, n) {
    const list = p.progressOf(n.id), chs = p.chapters();
    const sel = x => '<select class="select sm" data-pg="chapterId" data-pid="' + esc(x.id) + '"><option value="">（未指定章）</option>' + chs.map((c, i) => '<option value="' + esc(c.id) + '"' + (c.id === x.chapterId ? ' selected' : '') + '>' + (i + 1) + '. ' + esc(c.title) + '</option>').join('') + '</select>';
    return '<div class="field"><span>状态变化（按章记录：受伤、突破、得到物品、死亡……；境界、资源单独标出来，分析页会画成长线）</span><div class="pg-list">'
      + (list.map(x => '<div class="pg' + (x.dead ? ' dead' : '') + (x.kind ? ' ' + x.kind : '') + '">' + sel(x) + kindSel(x) + '<input class="input sm" data-pg="text" data-pid="' + esc(x.id) + '" value="' + esc(x.text) + '" placeholder="' + (x.kind === 'power' ? '写上境界，如：突破筑基' : x.kind === 'res' ? '资源 +/- 数量，如：灵石 +100' : '如：左臂受伤 / 得到青锋剑') + '">'
        + '<label class="pg-dead" title="此章之后再开口说话会被体检提示"><input type="checkbox" data-pg="dead" data-pid="' + esc(x.id) + '"' + (x.dead ? ' checked' : '') + '>死亡</label><button class="icon-btn sm" data-act="library.unprogress" data-pid="' + esc(x.id) + '" title="删除">' + icon('x') + '</button></div>').join('') || '<p class="muted small">还没有记录。写到关键变化时记一笔，体检和 AI 会知道 TA「此时此刻」的状态。</p>')
      + '</div><button class="btn sm ghost" data-act="library.progress">' + icon('plus') + '记录一个变化</button></div>';
  }

  function refreshList(app) { const el = document.getElementById('entity-host'); if (el) el.innerHTML = cards(app); }

  Pages.library = {
    label:'角色与设定', icon:'users',
    render: function (app, params) {
      const counts = {}; app.project.data.nodes.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });
      const view = (typeof localStorage !== 'undefined' && localStorage.getItem(VIEW)) || 'grid';
      return '<header class="page-head"><div><h1>角色与设定</h1><p class="muted">' + app.project.data.nodes.length + ' 条设定 · ' + app.project.data.relations.length + ' 条关系</p></div>'
        + '<button class="btn primary" data-act="library.add">' + icon('plus') + '新建设定</button></header>'
        + '<div class="toolbar"><label class="search">' + icon('search') + '<input id="lib-q" placeholder="搜索名称或内容" value="' + esc(state.q) + '"></label>'
        + '<div class="chips"><button class="chip' + (state.type ? '' : ' on') + '" data-act="library.type" data-t="">全部</button>'
        + Object.keys(counts).map(k => '<button class="chip' + (state.type === k ? ' on' : '') + '" data-act="library.type" data-t="' + esc(k) + '">' + esc(typeLabel(k)) + ' <small>' + counts[k] + '</small></button>').join('') + '</div>'
        + '<div class="seg"><button class="icon-btn' + (view === 'grid' ? ' on' : '') + '" data-act="library.view" data-v="grid" title="卡片">' + icon('grid') + '</button><button class="icon-btn' + (view === 'list' ? ' on' : '') + '" data-act="library.view" data-v="list" title="列表">' + icon('list') + '</button><button class="icon-btn' + (view === 'graph' ? ' on' : '') + '" data-act="library.view" data-v="graph" title="关系图">' + icon('share') + '</button></div></div>'
        + '<div id="entity-host">' + cards(app) + '</div><div id="drawer-host">' + (params[0] ? drawer(app, params[0]) : '') + '</div>';
    },
    mount: function (app, params) {
      const svg = document.querySelector('.rel-graph');
      if (svg) svg.addEventListener('mouseover', e => { const g = e.target.closest('.g-node'); svg.classList.toggle('focus', !!g); if (!g) return; const id = g.dataset.id, near = new Set([id]);
        svg.querySelectorAll('.g-edge').forEach(x => { const on = x.dataset.s === id || x.dataset.t === id; x.classList.toggle('on', on); if (on) { near.add(x.dataset.s); near.add(x.dataset.t); } });
        svg.querySelectorAll('.g-node').forEach(x => x.classList.toggle('on', near.has(x.dataset.id))); });
      if (svg) svg.addEventListener('mouseleave', () => svg.classList.remove('focus'));
      const q = document.getElementById('lib-q');
      q.addEventListener('input', () => { state.q = q.value; refreshList(app); });
      const host = document.getElementById('drawer-host');
      host.addEventListener('change', e => { const k = e.target.dataset.pg; if (!k || k === 'text') return;
        app.project.updateProgress(app.route.params[0], e.target.dataset.pid, { [k]:k === 'dead' ? e.target.checked : e.target.value }); app.renderPage(); });
      host.addEventListener('input', e => {
        if (e.target.dataset.pg && e.target.dataset.pg === 'text') { app.project.updateProgress(app.route.params[0], e.target.dataset.pid, { text:e.target.value }); return; }
        const f = e.target.dataset.f, id = app.route.params[0]; if (!f || !id) return;
        app.project.updateEntity(id, { [f]:e.target.value });
        if (f === 'type') { app.renderPage(); return; }
        refreshList(app);
      });
      if (!params[0]) state.lastDrawer = '';
    },
    actions: {
      progress: app => { const last = app.project.chapters().slice(-1)[0]; app.project.addProgress(app.route.params[0], { chapterId:last && last.id, text:'' }); app.renderPage();
        setTimeout(() => { const i = document.querySelectorAll('.pg input[data-pg="text"]'); if (i.length) i[i.length - 1].focus(); }, 50); },
      unprogress: (app, el) => { app.project.removeProgress(app.route.params[0], el.dataset.pid); app.renderPage(); },
      add: app => UI.prompt('新建设定', '名字（取消就不建）', '').then(t => { if (t == null || !t.trim()) return; const n = app.project.addEntity({ name:t.trim(), type:state.type || 'PERSON' }); app.navigate('library', false, [n.id]); }),
      open: (app, el) => app.navigate('library', false, [el.dataset.id]),
      close: app => app.navigate('library'),
      type: (app, el) => { state.type = el.dataset.t; app.renderPage(); },
      view: (app, el) => { localStorage.setItem(VIEW, el.dataset.v); app.renderPage(); },
      link: app => { const id = app.route.params[0], t = document.getElementById('rel-target').value, l = document.getElementById('rel-label').value;
        if (app.project.addRelation(id, t, l)) app.renderPage(); },
      unlink: (app, el) => { app.project.removeRelation(+el.dataset.i); app.renderPage(); },
      remove: app => { const n = app.project.entity(app.route.params[0]);
        { const snap = app.project.checkpoint(); app.project.removeEntity(n.id); app.navigate('library'); UI.undoToast('已删除「' + n.name + '」及其关系和对话', () => { app.project.rollback(snap); app.navigate('library', false, [n.id]); }); } },
    },
  };
  Pages.library._state = state;
}(typeof self !== 'undefined' ? self : globalThis));
