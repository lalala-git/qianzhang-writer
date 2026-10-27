/*! 千章 · ui/page-plan.js · 大纲伏笔：分卷目录与细纲总览 + 伏笔本 */
(function (root) {
  'use strict';
  const UI = root.QZUI, { esc, icon } = UI;
  const Pages = root.QZPages = root.QZPages || {};
  const C = () => root.QZCraft;

  // 伏笔多、章节多时每个下拉都放几百个选项会拖慢页面：先只放选中项，聚焦时再填满
  function chapterOptions(p, value) { return p.chapters().map((c, i) => '<option value="' + esc(c.id) + '"' + (c.id === value ? ' selected' : '') + '>' + (i + 1) + '. ' + esc(c.title) + '</option>').join(''); }
  function chapterSelect(p, id, value, empty) {
    const all = p.chapters(), i = all.findIndex(c => c.id === value), c = all[i];
    return '<select class="select sm" data-fs="' + id + '" data-lazy="' + esc(empty) + '"><option value="">' + empty + '</option>'
      + (c ? '<option value="' + esc(c.id) + '" selected>' + (i + 1) + '. ' + esc(c.title) + '</option>' : '') + '</select>';
  }
  function fillLazy(p, el) {
    if (!el || el.tagName !== 'SELECT' || el.dataset.lazy == null) return;
    const v = el.value; el.innerHTML = '<option value="">' + esc(el.dataset.lazy) + '</option>' + chapterOptions(p, v); el.value = v; delete el.dataset.lazy;
  }

  function overdueCount(p) { const n = p.chapters().length; return p.foreshadows().filter(f => C().foreshadowStatus(f, n) === 'overdue').length; }

  /** 时间线：每章的书中时间 + 人物状态变化 + 伏笔埋设/回收。 */
  function timeline(app) {
    const p = app.project, all = p.chapters(), by = {};
    const add = (cid, html) => { if (cid) (by[cid] = by[cid] || []).push(html); };
    p.data.nodes.forEach(n => (n.progress || []).forEach(x => add(x.chapterId, '<span class="tl-ev' + (x.dead ? ' dead' : '') + '"><b>' + esc(n.name) + '</b>' + esc(x.text || (x.dead ? '' : '（变化）')) + (x.dead ? ' ✝' : '') + '</span>')));
    p.foreshadows().forEach(f => { add(f.plantedIn, '<span class="tl-ev fs">埋 · ' + esc(f.title) + '</span>'); add(f.resolvedIn, '<span class="tl-ev ok">收 · ' + esc(f.title) + '</span>'); });
    const rows = all.map((c, i) => (by[c.id] || c.storyTime) ? '<a class="tl-row" href="#/write/' + encodeURIComponent(c.id) + '"><span class="ch-no">' + (i + 1) + '</span><span class="tl-time">' + esc(c.storyTime || '—') + '</span><span class="tl-title">' + esc(c.title) + '</span><span class="tl-evs">' + (by[c.id] || []).join('') + '</span></a>' : '').join('');
    return '<section class="panel tl"><div class="panel-head"><div><h2>' + icon('list') + ' 时间线</h2><p class="muted small">只列出填了「书中时间」、记录了人物状态变化或埋/收伏笔的章节。书中时间在写作页细纲框里填，状态变化在设定详情里记。</p></div></div>'
      + (rows || '<div class="empty-mini">' + icon('list') + '<p>还没有可显示的事件。</p></div>') + '</section>';
  }

  Pages.plan = {
    label:'大纲伏笔', icon:'map', badge:app => overdueCount(app.project),
    render: function (app) {
      const p = app.project, all = p.chapters(), n = all.length, filter = app.planFilter || 'active';
      const outline = p.outline().map(g => '<div class="vol"><div class="vol-title">' + (g.volume
          ? '<b>' + esc(g.volume.title) + '</b><span class="muted small">' + g.chapters.length + ' 章 · ' + g.chapters.reduce((s, c) => s + root.QZStore.countWords(c.text), 0).toLocaleString() + ' 字</span><span class="grow"></span><button class="icon-btn sm" data-act="plan.renameVol" data-id="' + esc(g.volume.id) + '" title="重命名">' + icon('pen') + '</button><button class="icon-btn sm" data-act="plan.removeVol" data-id="' + esc(g.volume.id) + '" title="删除分卷（章节保留）">' + icon('trash') + '</button>'
          : '<b>未分卷</b><span class="muted small">' + g.chapters.length + ' 章</span>') + '</div>'
        + (g.chapters.length ? g.chapters.map(c => '<a class="ol-item" href="#/write/' + encodeURIComponent(c.id) + '"><span class="ch-no">' + (all.indexOf(c) + 1) + '</span><span class="grow"><b>' + esc(c.title) + '</b><span class="ol-note">' + (c.outline ? esc(c.outline) : '<i class="muted">还没写细纲</i>') + '</span></span><span class="ch-words">' + root.QZStore.countWords(c.text).toLocaleString() + '</span></a>').join('') : '<p class="muted small pad">本卷还没有章节，在写作页可把章节移入。</p>') + '</div>').join('');
      const items = p.foreshadows().map(f => ({ f, st:C().foreshadowStatus(f, n) }))
        .filter(x => filter === 'all' || (filter === 'done' ? x.st === 'resolved' : x.st !== 'resolved'))
        .sort((a, b) => ['overdue', 'soon', 'open', 'resolved'].indexOf(a.st) - ['overdue', 'soon', 'open', 'resolved'].indexOf(b.st));
      const fs = items.map(({ f, st }) => '<div class="fs-item ' + st + '"><div class="fs-top"><span class="tag ' + st + '">' + C().STATUS_LABEL[st] + '</span><input class="fs-title" data-fs="title" data-id="' + esc(f.id) + '" value="' + esc(f.title) + '">'
        + (st === 'resolved' ? '<button class="btn sm ghost" data-act="plan.reopen" data-id="' + esc(f.id) + '">撤销回收</button>' : '<button class="btn sm" data-act="plan.resolve" data-id="' + esc(f.id) + '">' + icon('check') + '已回收</button>')
        + '<button class="icon-btn sm" data-act="plan.removeFs" data-id="' + esc(f.id) + '" title="删除">' + icon('trash') + '</button></div>'
        + '<textarea class="input fs-note" rows="1" data-fs="note" data-id="' + esc(f.id) + '" placeholder="细节：读者看到了什么、真相是什么、怎么回收">' + esc(f.note) + '</textarea>'
        + '<div class="fs-meta" data-id="' + esc(f.id) + '"><label>埋于 ' + chapterSelect(p, 'plantedIn', f.plantedIn, '（未指定）') + '</label>'
        + '<label>计划第 <input class="input xs" type="number" min="1" data-fs="dueChapter" data-id="' + esc(f.id) + '" value="' + (f.dueChapter || '') + '" placeholder="?"> 章回收</label>'
        + (f.resolvedIn ? '<label>回收于 ' + chapterSelect(p, 'resolvedIn', f.resolvedIn, '（未指定）') + '</label>' : '') + '</div></div>').join('');
      const cnt = k => p.foreshadows().filter(f => k === 'done' ? f.resolvedIn : k === 'active' ? !f.resolvedIn : true).length;
      return '<header class="page-head"><div><h1>大纲与伏笔</h1><p class="muted">分卷 → 章节 → 细纲，一眼看清全书走向；伏笔埋下就登记，到期前提醒你回收。</p></div></header>'
        + '<div class="plan-layout"><section class="panel"><div class="panel-head"><h2>' + icon('list') + ' 分卷目录</h2><button class="btn sm" data-act="plan.addVol">' + icon('plus') + '新建分卷</button></div>' + outline + '</section>'
        + '<section class="panel"><div class="panel-head"><h2>' + icon('flag') + ' 伏笔本</h2><button class="btn sm primary" data-act="plan.addFs">' + icon('plus') + '登记伏笔</button></div>'
        + '<div class="seg">' + [['active', '待回收'], ['done', '已回收'], ['all', '全部']].map(([k, l]) => '<button class="' + (filter === k ? 'on' : '') + '" data-act="plan.filter" data-k="' + k + '">' + l + ' ' + cnt(k) + '</button>').join('') + '</div>'
        + (fs || '<div class="empty-mini">' + icon('flag') + '<p>' + (filter === 'done' ? '还没有回收的伏笔。' : '还没有登记伏笔。写作时在「⋯」菜单里点「在本章埋一个伏笔」，或在这里登记。') + '</p></div>') + '</section></div>'
        + timeline(app);
    },
    mount: function (app) {
      const host = document.querySelector('.page-plan'); if (!host) return;
      const save = e => {
        const el = e.target, k = el.dataset.fs; if (!k) return;
        const id = el.dataset.id || (el.closest('.fs-meta') || {}).dataset.id; if (!id) return;
        app.project.updateForeshadow(id, { [k]:el.value });
        if (e.type === 'change' && (k === 'dueChapter' || k === 'plantedIn' || k === 'resolvedIn')) app.renderPage();
      };
      ['focusin', 'mousedown', 'touchstart'].forEach(t => host.addEventListener(t, e => fillLazy(app.project, e.target), { passive:true }));
      host.addEventListener('input', e => { if (e.target.tagName !== 'SELECT' && e.target.dataset.fs !== 'dueChapter') save(e); });
      host.addEventListener('change', e => { if (e.target.tagName === 'SELECT' || e.target.dataset.fs === 'dueChapter') save(e); });
    },
    actions: {
      filter: (app, el) => { app.planFilter = el.dataset.k; app.renderPage(); },
      addVol: app => UI.prompt('新建分卷', '卷名', '第' + (app.project.data.volumes.length + 1) + '卷').then(t => { if (t != null) { app.project.addVolume(t); app.renderPage(); } }),
      renameVol: (app, el) => { const v = app.project.volume(el.dataset.id); UI.prompt('重命名分卷', '卷名', v.title).then(t => { if (t != null) { app.project.renameVolume(v.id, t); app.renderPage(); } }); },
      removeVol: (app, el) => { const snap = app.project.checkpoint(); app.project.removeVolume(el.dataset.id); app.renderPage(); UI.undoToast('已删除分卷，章节回到「未分卷」', () => { app.project.rollback(snap); app.renderPage(); }); },
      addFs: app => UI.prompt('登记伏笔', '伏笔是什么？', '').then(t => { if (t && t.trim()) { let cid = null; try { cid = (JSON.parse(localStorage.getItem('qianzhang:caret:' + app.project.id)) || {}).id; } catch (e) {} const at = app.project.chapter(cid) || app.project.chapters().slice(-1)[0]; app.project.addForeshadow({ title:t, plantedIn:at && at.id }); UI.toast('已登记，埋在第 ' + (at ? app.project.chapterNo(at.id) : '?') + ' 章（正在写的这章）'); app.planFilter = 'active'; app.renderPage(); } }),
      resolve: (app, el) => { const last = app.project.chapters().slice(-1)[0]; app.project.updateForeshadow(el.dataset.id, { resolvedIn:last ? last.id : 'unknown' }); UI.toast('已标记回收' + (last ? '（记在最新一章，可修改）' : '')); app.renderPage(); },
      reopen: (app, el) => { app.project.updateForeshadow(el.dataset.id, { resolvedIn:null }); app.renderPage(); },
      removeFs: (app, el) => { const snap = app.project.checkpoint(); app.project.removeForeshadow(el.dataset.id); app.renderPage(); UI.undoToast('已删除这条伏笔', () => { app.project.rollback(snap); app.renderPage(); }); },
    },
  };
}(typeof self !== 'undefined' ? self : globalThis));
