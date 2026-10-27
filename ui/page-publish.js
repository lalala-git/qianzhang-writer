/*! 千章 · ui/page-publish.js · 发布：存稿状况、平台预设、发布前自查、导出。 */
(function (root) {
  'use strict';
  const UI = root.QZUI, { esc, icon } = UI;
  const Pages = root.QZPages = root.QZPages || {};
  const PREF = 'qianzhang:publish';
  const pref = () => { try { return Object.assign({ platform:'qidian', range:'stock' }, JSON.parse(localStorage.getItem(PREF) || '{}')); } catch (e) { return { platform:'qidian', range:'stock' }; } };
  function pick(p, range) {
    const all = p.chapters();
    if (range === 'all') return all;
    if (range === 'stock') return all.filter(c => c.status !== 'published');
    if (range === 'last') return all.slice(-1);
    if (range.startsWith('v:')) return all.filter(c => c.volumeId === range.slice(2));
    return all;
  }
  Pages.publish = {
    label:'发布', icon:'share',
    render: function (app) {
      const C = root.QZCraft, p = app.project, o = pref(), s = C.stock(p), list = pick(p, o.range), P = C.PLATFORMS[o.platform] || C.PLATFORMS.plain;
      if (!p.chapters().length) return '<section class="empty-state"><span class="empty-icon">' + icon('share') + '</span><h2>还没有可以发布的章节</h2><p>写好章节后，这里会按平台排好版、做发布前自查，再一键复制或导出。</p><div class="row center"><a class="btn primary" href="#/write">' + icon('pen') + '去写第一章</a></div></section>';
      const issues = C.publishCheck(p, list, o.platform, String(p.data.writing.sensitive || '').split(/[\s,，、]+/).filter(Boolean));
      const total = list.reduce((n, c) => n + root.QZStore.countWords(c.text), 0);
      const plats = Object.keys(C.PLATFORMS).map(k => '<label class="seg-opt"><input type="radio" name="pb-plat" value="' + k + '"' + (k === o.platform ? ' checked' : '') + '><span>' + C.PLATFORMS[k].name + '</span></label>').join('');
      const ranges = [['stock', '未发布的章节（' + s.unpub + ' 章）'], ['last', '最新一章'], ['all', '全书']].concat(p.volumes().map(v => ['v:' + v.id, v.title]));
      return '<div class="page-head"><div><h1>发布</h1><p class="muted">按平台排好版，发之前先自查一遍。章节标记「已发布」后会从存稿里扣掉。</p></div></div>'
        + '<div class="pb-stats"><div class="pb-stat ' + s.level + '"><b>' + s.stock + '</b><span>章存稿</span>' + (s.notCounted > 0 ? '<small title="存稿只算最后一章已发布之后、写满 ' + s.minWords + ' 字的章节">另 ' + s.notCounted + ' 章未计入</small>' : '') + '</div><div class="pb-stat"><b>' + s.days + '</b><span>天可更（每天 ' + s.perDay + ' 章）</span></div><div class="pb-stat"><b>' + s.published + '</b><span>章已发布</span></div>'
        + (s.next ? '<div class="pb-stat"><b class="sm">' + esc(s.next.publishAt) + '</b><span>下一次定时：' + esc(s.next.title) + '</span></div>' : '') + '</div>'
        + '<section class="panel pb-main"><div class="pb-ctl"><div class="aw-seg">' + plats + '</div><select class="select sm" id="pb-range">' + ranges.map(r => '<option value="' + esc(r[0]) + '"' + (r[0] === o.range ? ' selected' : '') + '>' + esc(r[1]) + '</option>').join('') + '</select>'
        + '<span class="muted small">' + esc(P.tip) + '</span><span class="grow"></span><span class="pill">' + list.length + ' 章 · ' + total.toLocaleString() + ' 字</span></div>'
        + '<div class="pb-grid"><div><h3>发布前自查 ' + (issues.length ? '<em class="nav-badge">' + issues.length + '</em>' : '') + '</h3>'
        + (issues.length ? '<ul class="pb-issues">' + issues.slice(0, 60).map(x => '<li class="' + x.kind + '"><a href="#/write/' + encodeURIComponent(x.chapterId) + '">' + esc(x.title) + '</a><span>' + esc(x.text) + '</span></li>').join('') + '</ul>'
          : '<p class="pb-ok">' + icon('check') + ' 没发现问题，可以发了</p>')
        + '</div><div><h3>预览</h3><pre class="pb-preview" id="pb-preview">' + esc(C.publishText(p, list.slice(0, 2), o.platform).slice(0, 1600)) + (list.length > 2 ? '\n\n……' : '') + '</pre></div></div>'
        + '<div class="row pb-actions"><button class="btn primary" data-act="publish.copy"' + (list.length ? '' : ' disabled') + '>' + icon('upload') + '复制' + (list.length > 1 ? '第一章' : '') + '</button><button class="btn" data-act="publish.download"' + (list.length ? '' : ' disabled') + '>' + icon('download') + '导出 txt</button>'
        + '<button class="btn ghost" data-act="publish.mark"' + (o.range === 'stock' && list.length ? '' : ' disabled') + ' title="把存稿里的第一章标记为已发布">' + icon('check') + '第一章标为已发布</button></div></section>';
    },
    mount: function (app) {
      const save = patch => { localStorage.setItem(PREF, JSON.stringify(Object.assign(pref(), patch))); app.renderPage(); };
      document.querySelectorAll('[name=pb-plat]').forEach(r => r.addEventListener('change', () => save({ platform:r.value })));
      const rg = document.getElementById('pb-range'); if (rg) rg.addEventListener('change', () => save({ range:rg.value }));
    },
    actions: {
      copy: app => { const o = pref(), c = pick(app.project, o.range)[0]; if (!c) return; const t = root.QZCraft.publishText(app.project, [c], o.platform);
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => UI.toast('已复制「' + c.title + '」，可直接粘到作家后台')).catch(() => UI.download(c.title + '.txt', t, 'text/plain;charset=utf-8')); },
      download: app => { const o = pref(), list = pick(app.project, o.range); if (!list.length) return;
        UI.download(app.project.title + '-' + root.QZCraft.PLATFORMS[o.platform].name + '-' + list.length + '章.txt', root.QZCraft.publishText(app.project, list, o.platform), 'text/plain;charset=utf-8'); UI.toast('已导出 ' + list.length + ' 章'); },
      mark: app => { const c = pick(app.project, 'stock')[0]; if (!c) return; app.project.updateChapter(c.id, { status:'published' }); app.renderPage(); UI.toast('「' + c.title + '」已标为已发布'); },
    },
  };
}(typeof self !== 'undefined' ? self : globalThis));
