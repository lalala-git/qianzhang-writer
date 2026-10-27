/*! 千章 · ui/page-notes.js · 素材墙：随手记灵感、片段、资料，挂到章节或设定上，写作时就近取用。 */
(function (root) {
  'use strict';
  const UI = root.QZUI, { esc, icon } = UI;
  const Pages = root.QZPages = root.QZPages || {};
  const state = { q:'', tag:'', link:'' };

  /** 挂接对象：章节或设定。找不到（被删了）就不显示。 */
  function target(p, id) {
    const c = p.chapter(id); if (c) return { id, kind:'ch', name:(p.chapterNo(id) || '') + '. ' + c.title, href:'#/write/' + encodeURIComponent(id) };
    const n = p.entity(id); if (n) return { id, kind:'en', name:n.name, href:'#/library/' + encodeURIComponent(id) };
    return null;
  }
  function targetOptions(p, empty) {
    const chs = p.chapters(), ens = p.data.nodes;
    return '<option value="">' + esc(empty) + '</option>' + (ens.length ? '<optgroup label="设定">' + ens.map(n => '<option value="' + esc(n.id) + '">' + esc(n.name) + '</option>').join('') + '</optgroup>' : '')
      + (chs.length ? '<optgroup label="章节">' + chs.map((c, i) => '<option value="' + esc(c.id) + '">' + (i + 1) + '. ' + esc(c.title) + '</option>').join('') + '</optgroup>' : '');
  }
  /** 正文里的 #标签 高亮显示。 */
  function body(text) { return esc(text).replace(/[#＃]([^\s#＃，。,.!！?？、&<]{1,12})/g, '<b class="nt-tag">#$1</b>').replace(/\n/g, '<br>'); }
  function card(p, x, opts) {
    const o = opts || {}, links = x.links.map(id => target(p, id)).filter(Boolean);
    return '<article class="nt' + (x.pinned ? ' pinned' : '') + '" data-id="' + esc(x.id) + '"><div class="nt-text">' + body(x.text) + '</div>'
      + (links.length ? '<div class="nt-links">' + links.map(l => '<a class="nt-link ' + l.kind + '" href="' + l.href + '">' + esc(l.name) + '</a>').join('') + '</div>' : '')
      + '<div class="nt-foot"><span class="muted small">' + esc(String(x.at).slice(5, 10).replace('-', '/')) + '</span><span class="grow"></span>'
      + (o.insert ? '<button class="btn sm ghost nt-ins" data-n="insert" title="插入到正文光标处（不带 #标签）">' + icon('arrowDown') + '插入正文</button>' : '')
      + '<button class="icon-btn sm' + (x.pinned ? ' on' : '') + '" data-n="pin" title="' + (x.pinned ? '取消置顶' : '置顶') + '">' + icon('pin') + '</button>'
      + '<button class="icon-btn sm" data-n="edit" title="编辑">' + icon('pen') + '</button><button class="icon-btn sm" data-n="del" title="删除">' + icon('trash') + '</button></div></article>';
  }
  /** 卡片上的置顶 / 编辑 / 删除（删除点两次）。返回 true 表示需要重画。 */
  function cardAction(p, el) {
    const b = el.closest('[data-n]'), a = el.closest('.nt'); if (!b || !a) return false; const id = a.dataset.id, x = (p.data.notes || []).find(y => y.id === id); if (!x) return false;
    if (b.dataset.n === 'pin') { p.updateNote(id, { pinned:!x.pinned }); return true; }
    if (b.dataset.n === 'del') { if (b.dataset.sure) { p.removeNote(id); UI.toast('已删除这条素材'); return true; } b.dataset.sure = '1'; b.classList.add('danger'); b.title = '再点一次确认删除'; UI.toast('再点一次删除'); return false; }
    if (b.dataset.n === 'edit') {
      const t = a.querySelector('.nt-text'); if (t.querySelector('textarea')) return false;
      t.innerHTML = '<textarea class="input nt-edit" rows="4">' + esc(x.text) + '</textarea><div class="row"><button class="btn sm primary" data-n="ok">保存</button><button class="btn sm ghost" data-n="cancel">取消</button></div>';
      const ta = t.querySelector('textarea'); ta.focus(); return false;
    }
    if (b.dataset.n === 'ok') { p.updateNote(id, { text:a.querySelector('.nt-edit').value }); return true; }
    if (b.dataset.n === 'cancel') return true;
    return false;
  }

  Pages.notes = {
    label:'素材墙', icon:'note',
    render: function (app) {
      const p = app.project, all = p.data.notes || [], list = p.notes(state), tags = p.noteTags();
      if (state.link && !target(p, state.link)) state.link = '';
      return '<div class="page-head"><div><h1>素材墙</h1><p class="muted">灵感、对白片段、查到的资料都先丢这里。用 <b>#标签</b> 分类，挂到章节或人物上，写到那里时在写作页「更多 → 本章素材」里就能看到。</p></div></div>'
        + '<section class="panel nt-capture"><textarea class="input" id="nt-new" rows="2" placeholder="随手记一条……例：#反派 他笑的时候从不露牙  （Ctrl+Enter 保存）"></textarea>'
        + '<div class="row"><select class="select sm" id="nt-to">' + targetOptions(p, '不挂接') + '</select><span class="grow"></span><button class="btn primary sm" data-act="notes.add">' + icon('plus') + '记下来</button></div></section>'
        + (all.length ? '<div class="nt-filter"><input class="input sm" id="nt-q" placeholder="搜索素材" value="' + esc(state.q) + '">'
          + '<select class="select sm" id="nt-link">' + targetOptions(p, '全部挂接').replace('value="' + esc(state.link) + '"', 'value="' + esc(state.link) + '" selected') + '</select>'
          + '<div class="nt-tags"><button class="chip' + (state.tag ? '' : ' on') + '" data-tag="">全部 ' + all.length + '</button>' + tags.slice(0, 20).map(t => '<button class="chip' + (state.tag === t[0] ? ' on' : '') + '" data-tag="' + esc(t[0]) + '">#' + esc(t[0]) + ' ' + t[1] + '</button>').join('') + '</div></div>'
          + (list.length ? '<div class="nt-wall" id="nt-wall">' + list.map(x => card(p, x)).join('') + '</div>' : '<div class="empty-mini">' + icon('search') + '<p>没有符合条件的素材。</p></div>')
          : '<div class="empty-mini nt-empty">' + icon('note') + '<p>还没有素材。洗澡时想到的桥段、刷到的好句子、查到的史料，先记一笔，免得忘。</p></div>');
    },
    mount: function (app) {
      const p = app.project, ta = document.getElementById('nt-new');
      if (ta) ta.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); Pages.notes.actions.add(app); } });
      const q = document.getElementById('nt-q'); let tm;
      if (q) q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { state.q = q.value; app.renderPage(); const n = document.getElementById('nt-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
      const lk = document.getElementById('nt-link'); if (lk) lk.addEventListener('change', () => { state.link = lk.value; app.renderPage(); });
      document.querySelectorAll('.nt-tags [data-tag]').forEach(b => b.addEventListener('click', () => { state.tag = b.dataset.tag; app.renderPage(); }));
      const wall = document.getElementById('nt-wall'); if (wall) wall.addEventListener('click', e => { if (cardAction(p, e.target)) app.renderPage(); });
    },
    actions: {
      add: app => { const ta = document.getElementById('nt-new'), to = document.getElementById('nt-to'); if (!ta || !ta.value.trim()) { ta && ta.focus(); return; }
        app.project.addNote(ta.value, [to && to.value]); app.renderPage(); UI.toast('记下了'); setTimeout(() => { const n = document.getElementById('nt-new'); n && n.focus(); }, 30); },
    },
    /** 写作页用：本章素材弹窗。列出挂到本章、以及挂到本章出场人物上的素材，可以新记、插入正文。 */
    chapterModal: function (app, c, insert) {
      const p = app.project, ids = [c.id].concat(p.data.nodes.filter(n => n.name && c.text.includes(n.name)).map(n => n.id));
      const draw = w => {
        const mine = p.notes({ link:c.id }), rel = p.notes().filter(x => !x.links.includes(c.id) && x.links.some(l => ids.includes(l)));
        w.querySelector('.nt-mini').innerHTML = (mine.length || rel.length ? (mine.length ? '<h4>挂在本章</h4>' + mine.map(x => card(p, x, { insert:true })).join('') : '')
          + (rel.length ? '<h4>本章出场人物的素材</h4>' + rel.map(x => card(p, x, { insert:true })).join('') : '') : '<p class="muted small pad">本章还没有素材。在上面记一条，会自动挂到本章。</p>');
      };
      return UI.modal({ title:'本章素材 · ' + c.title, body:'<div class="nt-qadd"><textarea class="input" id="nt-qtext" rows="2" placeholder="记一条，自动挂到本章（Ctrl+Enter）"></textarea><button class="btn sm primary" id="nt-qsave">' + icon('plus') + '记下</button></div><div class="nt-mini"></div><p class="muted small"><a href="#/notes">打开素材墙看全部 →</a></p>',
        buttons:[{ label:'关闭', value:true }],
        onOpen: w => {
          draw(w); const t = w.querySelector('#nt-qtext');
          const save = () => { if (!t.value.trim()) return t.focus(); p.addNote(t.value, [c.id]); t.value = ''; draw(w); UI.toast('已挂到本章'); };
          w.querySelector('#nt-qsave').addEventListener('click', save);
          t.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); } });
          w.querySelector('.nt-mini').addEventListener('click', e => {
            const b = e.target.closest('[data-n="insert"]');
            if (b) { const x = (p.data.notes || []).find(y => y.id === b.closest('.nt').dataset.id); if (x && insert) { insert(x.text.replace(/[#＃][^\s#＃，。,.!！?？、]{1,12}\s?/g, '').trim()); UI.toast('已插入到光标处'); } return; }
            if (e.target.closest('a')) { w.querySelector('[data-v="__x"]').click(); return; }
            if (cardAction(p, e.target)) draw(w);
          });
        } });
    },
  };
}(typeof self !== 'undefined' ? self : globalThis));
