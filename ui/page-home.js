/*! 千章 · ui/page-home.js · 首页：今日码字、连更日历、伏笔提醒、入口、作品库 */
(function (root) {
  'use strict';
  const UI = root.QZUI, { esc, icon } = UI;
  const Pages = root.QZPages = root.QZPages || {};

  /** 今日进度环 + 连更 + 热力图 + 伏笔提醒。 */
  function dashboard(app) {
    const C = root.QZCraft, p = app.project, w = p.data.writing, s = C.streak(w.daily, w.goal), n = p.chapters().length;
    const pct = Math.min(1, s.today / s.goal), R = 34, L = 2 * Math.PI * R;
    const ring = '<svg class="ring" viewBox="0 0 80 80"><circle cx="40" cy="40" r="' + R + '" class="ring-bg"/><circle cx="40" cy="40" r="' + R + '" class="ring-fg" stroke-dasharray="' + (L * pct).toFixed(1) + ' ' + L.toFixed(1) + '"/></svg>';
    const hs = app.heatSpan || 18, cells = C.heatmap(w.daily, w.goal, hs).map(col => '<div class="hm-col">' + col.map(c => '<i class="hm l' + c.level + (c.future ? ' fut' : '') + '" title="' + c.key + '：' + c.words.toLocaleString() + ' 字" data-tip="' + c.key.slice(5) + ' · ' + c.words.toLocaleString() + ' 字"></i>').join('') + '</div>').join('');
    const due = p.foreshadows().map(f => ({ f, st:C.foreshadowStatus(f, n) })).filter(x => x.st === 'overdue' || x.st === 'soon');
    const remind = due.length ? '<div class="remind"><h3>' + icon('flag') + '伏笔提醒</h3>' + due.slice(0, 4).map(x => '<a href="#/plan" class="remind-item ' + x.st + '"><span class="tag ' + x.st + '">' + C.STATUS_LABEL[x.st] + '</span>' + esc(x.f.title) + '<small>计划第 ' + x.f.dueChapter + ' 章回收 · 现写到第 ' + n + ' 章</small></a>').join('') + (due.length > 4 ? '<a class="muted small" href="#/plan">还有 ' + (due.length - 4) + ' 个…</a>' : '') + '</div>' : '';
    return '<section class="dash"><div class="goal-card"><div class="ring-wrap">' + ring + '<div class="ring-text"><b>' + Math.round(pct * 100) + '%</b><small>今日</small></div></div>'
      + '<div class="goal-info"><p class="muted small">今日码字</p><p class="big"><b>' + s.today.toLocaleString() + '</b> / <button class="link" data-act="home.goal" title="修改每日目标">' + s.goal.toLocaleString() + '</button></p>'
      + '<p class="streak">' + icon('fire') + (s.current ? '已连更 <b>' + s.current + '</b> 天' : '今天开始连更') + '</p><p class="muted small">最长连更 ' + s.best + ' 天</p>'
      + '<p class="muted small">' + (s.done ? '今日已达标，存稿 +1 🎉' : '还差 ' + (s.goal - s.today).toLocaleString() + ' 字达标') + '</p></div></div>'
      + stockCard(app)
      + '<div class="heat-card"><div class="panel-head"><h3>连更日历</h3><div class="seg-pill"><button class="' + (hs === 5 ? 'on' : '') + '" data-act="home.heat" data-n="5">近30天</button><button class="' + (hs === 18 ? 'on' : '') + '" data-act="home.heat" data-n="18">18 周</button></div></div><div class="heatmap' + (hs === 5 ? ' d30' : '') + '">' + cells + '</div></div>'
      + remind + backupHint(app) + '</section>' + msStrip(app) + reportCard(app);
  }
  function reportCard(app) {
    const C = root.QZCraft, w = app.project.data.writing, span = app.reportSpan || 7, r = C.report(w.daily, w.goal, span), max = Math.max(w.goal, ...r.days.map(x => x.words), 1);
    const wd = ['日', '一', '二', '三', '四', '五', '六'], lab = k => { const [y, m, d] = k.split('-').map(Number); return span === 7 ? '周' + wd[new Date(y, m - 1, d).getDay()] : (d === 1 || d % 5 === 0 ? m + '/' + d : ''); };
    const bars = r.days.map(x => '<div class="rp-col" title="' + x.key + '：' + x.words.toLocaleString() + ' 字"><i class="' + (x.words >= w.goal ? 'hit' : x.words ? '' : 'zero') + '" style="height:' + Math.max(2, Math.round(x.words / max * 100)) + '%"></i><small>' + lab(x.key) + '</small></div>').join('');
    const chg = r.change == null ? '' : '<span class="rp-chg ' + (r.change >= 0 ? 'up' : 'down') + '">' + (r.change >= 0 ? '↑' : '↓') + Math.abs(Math.round(r.change * 100)) + '%</span>';
    return '<section class="panel report"><div class="panel-head"><div><h2>' + icon('chart') + ' 写作统计</h2><p class="muted small">按每天实际码字统计，导入的稿子不算。</p></div><div class="seg-pill"><button class="' + (span === 7 ? 'on' : '') + '" data-act="home.span" data-n="7">本周</button><button class="' + (span === 30 ? 'on' : '') + '" data-act="home.span" data-n="30">近 30 天</button></div></div>'
      + '<div class="rp-stats"><div><small>合计</small><b>' + r.sum.toLocaleString() + '</b>' + chg + '</div><div><small>写作天数</small><b>' + r.activeDays + '<em>/' + span + '</em></b></div><div><small>日均</small><b>' + r.avg.toLocaleString() + '</b></div><div><small>达标</small><b>' + r.hit + '<em> 天</em></b></div><div><small>最高</small><b>' + r.best.words.toLocaleString() + '</b>' + (r.best.key ? '<em>' + r.best.key.slice(5) + '</em>' : '') + '</div></div>'
      + '<div class="rp-chart' + (span === 30 ? ' dense' : '') + '" style="--goal:' + Math.round(w.goal / max * 100) + '%"><span class="rp-goal" title="每日目标 ' + w.goal + '"></span>' + bars + '</div></section>';
  }

  function msStrip(app) {
    const p = app.project, st = p.stats(), m = root.QZCraft.milestones(st.words, p.chapters().length, p.data.writing.daily);
    if (!st.words) return '';
    const bar = (x, label) => '<div class="ms-item"><div class="ms-top"><span class="muted small">' + label + '</span><b>' + (x.next ? '下一站 ' + x.next : '全部达成') + '</b></div><div class="ms-bar"><i style="width:' + x.pct + '%"></i></div>'
      + '<p class="muted small">' + (x.next ? '还差 ' + x.need.toLocaleString() + (label === '字数' ? ' 字' : ' 章') : '') + (x.reached ? (x.next ? ' · ' : '') + '已达成 ' + x.reached : '') + '</p></div>';
    const warn = m.gap != null && m.gap >= 2 ? '<p class="ms-warn">' + icon('flag') + ' 已经 ' + m.gap + ' 天没码字了。日更断一天，追读就掉一截；今天哪怕写 500 字也算。</p>' : '';
    return '<section class="panel ms"><div class="ms-row">' + bar(m.words, '字数') + bar(m.chapters, '章数') + '</div>' + warn + '</section>';
  }

  function stockCard(app) {
    const st = root.QZCraft.stock(app.project), n = app.project.chapters().length;
    const tip = !n ? '写下第一章后这里会显示存稿。' : !st.published ? '在写作页把已上传平台的章节标为「已发布」，就能算出存稿。'
      : st.level === 'danger' ? '存稿告急！建议先攒到 3 天以上再更新。' : st.level === 'warn' ? '存稿偏少，建议攒到 7 天。' : '存稿充足，可以安心日更。';
    return '<div class="stock-card ' + (st.published ? st.level : '') + '"><p class="muted small">存稿</p><p class="big"><b>' + st.stock + '</b> 章 <span class="muted">≈ ' + st.days + ' 天</span></p>'
      + '<p class="muted small">已发布 ' + st.published + ' 章 · 每天更 <button class="link" data-act="home.perDay">' + st.perDay + '</button> 章</p>'
      + (st.overdue.length ? '<p class="warn-text small">' + st.overdue.length + ' 章过了计划发布日还没标「已发布」</p>' : st.next ? '<p class="small">下一章定时：' + UI.esc(st.next.publishAt) + '《' + UI.esc(st.next.title) + '》</p>' : '')
      + (st.notCounted > 0 ? '<p class="muted small">另有 ' + st.notCounted + ' 章未发布但没算进存稿（不足 ' + st.minWords + ' 字，或排在已发布章之前）</p>' : '')
      + '<p class="small stock-tip">' + tip + '</p></div>';
  }

  /** 书写到一定字数后，超过 7 天没导出过备份就提醒一次（本地服务虽有自动备份，但都在同一块硬盘上）。 */
  function backupHint(app) {
    const w = app.project.stats().words; if (w < 10000) return '';
    const last = +(localStorage.getItem('qianzhang:last-export') || 0), days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    if (days !== null && days < 7) return '';
    return '<div class="remind backup-hint"><h3>' + icon('download') + '备份提醒</h3><p class="muted small">' + (days === null ? '这部 ' + w.toLocaleString() + ' 字的作品还没有导出过备份。' : '已经 ' + days + ' 天没导出备份了。') + '硬盘坏了或误删时，自动备份也会一起没。建议导出一份放到网盘或 U 盘。</p><button class="btn sm" data-act="settings.export">' + icon('download') + '现在导出</button></div>';
  }
  const ONBOARD = 'qianzhang:onboard-off';
  /** 新手上路：按作品里的真实数据打勾，全部完成或关掉后不再出现。 */
  function onboard(app) {
    if (localStorage.getItem(ONBOARD)) return '';
    const p = app.project, s = p.stats(), cs = p.chapters();
    const steps = [
      [cs.some(c => c.text.trim()), '写下第一章', '正文自动保存，还会记录今日字数。', '#/write', 'pen'],
      [s.characters > 0, '建一个主角', '人物卡写上外貌、性格、能力，写作时悬停名字就能看到。', '#/library', 'users'],
      [cs.some(c => c.outline) || p.foreshadows().length > 0, '写一段细纲或埋个伏笔', '伏笔本会在该回收时提醒你。', '#/plan', 'flag'],
      [cs.some(c => c.status === 'published'), '把发出去的章节标成「已发布」', '首页就能算出你还有几天存稿。', '#/write', 'check'],
      [!!localStorage.getItem('qianzhang:seen-insight'), '看一眼节奏分析', '自查黄金三章、爆点分布和配角出场。', '#/insight', 'chart']];
    const done = steps.filter(x => x[0]).length; if (done === steps.length) return '';
    return '<section class="panel onboard"><div class="panel-head"><div><h2>' + icon('sparkle') + ' 新手上路 <span class="muted small">' + done + '/' + steps.length + '</span></h2><p class="muted small">五步熟悉千章。做完会自动打勾。</p></div><button class="icon-btn sm" data-act="home.onboardOff" title="不再显示">' + icon('x') + '</button></div>'
      + '<div class="ob-bar"><i style="width:' + Math.round(done / steps.length * 100) + '%"></i></div><ol class="ob-steps">'
      + steps.map(x => '<li class="' + (x[0] ? 'done' : '') + '"><a href="' + x[3] + '"><span class="ob-mark">' + icon(x[0] ? 'check' : x[4]) + '</span><span><b>' + x[1] + '</b><em>' + x[2] + '</em></span></a></li>').join('') + '</ol></section>';
  }

  /** 断更保险卡：隔天没写时，首页第一眼告诉你停在哪、今天从哪继续。 */
  /** 里程碑：写到第 N 章后在首页放一张卡片，点开才看，不在写作中弹窗 */
  function riteCard(app) {
    let seen = []; try { seen = JSON.parse(localStorage.getItem('qianzhang:rite:' + app.project.id) || '[]'); } catch (e) {}
    const r = root.QZCraft.ritual && root.QZCraft.ritual(app.project, seen); if (!r) return '';
    return '<div class="rite-home"><em>' + r.n + '</em><span><b>写到第 ' + r.n + ' 章了</b><small>' + r.words.toLocaleString() + ' 字 · 解锁皮肤「' + esc(r.skinName) + '」</small></span><button class="btn sm primary" data-act="home.rite">看看里程碑卡</button></div>';
  }
  function insCard(app) {
    const r = root.QZCraft.insurance(app.project), last = app.project.chapters().slice(-1)[0];
    if (!last || r.missed < 1 || !r.tip.length) return '';
    return '<section class="ins-card"><div><b>' + icon('flag') + (r.missed === 1 ? '昨天没写' : '已经 ' + r.missed + ' 天没写') + '，从这里继续就好</b><ul>' + r.tip.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul></div><a class="btn primary" href="#/write/' + encodeURIComponent(last.id) + '">' + icon('pen') + '接着写</a></section>';
  }
  Pages.home = {
    insure: function (app) {
      const r = root.QZCraft.insurance(app.project); if (!r.need) return r;
      r.keep.forEach(id => app.project.snapshot(id, '保险稿'));
      app.project.data.writing.insured = root.QZCraft.dayKey(); app.project._changed && app.project._changed('writing');
      UI.toast('连更 ' + r.streak + ' 天，已把最近 ' + r.keep.length + ' 章存为保险稿（在「历史稿」里）'); return r;
    },
    label:'首页', icon:'home',
    render: function (app) {
      const p = app.project, s = p.stats(), last = p.chapters().slice().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
      const resumeLine = (app, last) => { const r = Pages.write && Pages.write.resumeInfo ? Pages.write.resumeInfo(app) : null; return r && r.id === last.id && r.snip ? '<small class="resume-line">第 ' + r.no + ' 章停在「' + esc(r.snip) + '」 · ' + esc(r.ago) + '</small>' : ''; };
      const hour = new Date().getHours(), hello = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
      const card = (page, ic, title, desc, meta, cta) => '<a class="entry-card" href="#/' + page + '"><span class="entry-icon">' + icon(ic) + '</span>'
        + '<h3>' + title + '</h3><p>' + desc + '</p><div class="entry-meta">' + meta + '</div><span class="entry-cta">' + cta + ' →</span></a>';
      if (app._implicit && app.draftOnly()) return '<section class="hero empty-shelf"><div><p class="eyebrow">' + hello + '，作者</p><h1>书架还是空的</h1><p class="hero-stats">新建一本作品就能开始写。写下第一章之前，这里不会保存任何文件。</p></div><div class="hero-actions"><button class="btn primary lg" data-act="home.create">' + icon('plus') + '新建作品</button></div></section>';
      return '<section class="hero"><div><p class="eyebrow">' + hello + '，作者</p><h1>' + esc(p.title) + '</h1>'
        + '<p class="hero-stats"><b>' + s.words.toLocaleString() + '</b> 字 · <b>' + s.chapters + '</b> 章 · <b>' + s.entities + '</b> 条设定 · <b>' + s.relations + '</b> 条关系</p></div>'
        + '<div class="hero-actions">' + (last ? '<a class="btn primary lg" href="#/write/' + encodeURIComponent(last.id) + '">' + icon('pen') + '<span class="hb-txt">继续写<small>' + esc(Array.from(last.title.replace(/\s+/g, ' ')).length > 14 ? Array.from(last.title.replace(/\s+/g, ' ')).slice(0, 14).join('') + '…' : last.title.replace(/\s+/g, ' ')) + '</small></span></a>' + resumeLine(app, last)
          : '<button class="btn primary lg" data-act="home.firstChapter">' + icon('pen') + '写第一章</button>')
        + '</div><button class="icon-btn hero-rename" data-act="home.rename" title="重命名作品" aria-label="重命名作品">' + icon('pen') + '</button><button class="icon-btn hero-del" data-act="home.del" title="删除作品（移进回收站）" aria-label="删除作品">' + icon('trash') + '</button></section>'
        + riteCard(app) + insCard(app) + onboard(app)
        + dashboard(app)
        + '<section class="entries">'
        + card('write', 'book', '正文与章节', '安静的写作区，自动保存。可以把整本 txt 导入并自动分章。', s.chapters + ' 章 · ' + s.words.toLocaleString() + ' 字', '去写作')
        + card('library', 'users', '角色与设定', '人物、地点、规则……用卡片整理世界观，并记录人物之间的关系。', s.entities + ' 条设定 · ' + s.characters + ' 位人物', '管理设定')
        + card('plan', 'map', '大纲伏笔', '分卷目录、每章细纲，以及会提醒你「该回收了」的伏笔本。', p.data.volumes.length + ' 卷 · ' + p.foreshadows().filter(f => !f.resolvedIn).length + ' 个伏笔待回收', '去规划')
        + card('chat', 'chat', '角色聊天', '挑一个角色直接对话：TA 会依据档案、关系与最近剧情来回应。', s.chats + ' 段对话', '开始聊天')
        + '</section>'
        + '<section class="panel"><div class="panel-head"><h2>我的作品</h2><div class="row"><button class="btn" data-act="home.create">' + icon('plus') + '新建作品</button></div></div>'
        + '<div class="project-list" id="project-list"><div class="skeleton"></div></div>'
        + '</section>'
        + (app.storage.server ? '' : '<p class="notice">未连接本地服务：作品只保存在这个浏览器里。运行 <code>node server/server.js .</code> 可保存为磁盘文件。</p>');
    },
    mount: function (app) {
      Pages.home.insure(app);
      app.storage.list().then(list => {
        const host = document.getElementById('project-list'); if (!host) return;
        list.forEach(x => { if (x.id === app.project.id) x.title = app.project.title; });
        if (!list.some(x => x.id === app.project.id)) list.unshift({ id:app.project.id, title:app.project.title, updated_at:app.project.data.meta.updated_at });
        host.innerHTML = list.map(x => '<button class="project-item' + (x.id === app.project.id ? ' on' : '') + '" data-act="home.open" data-id="' + esc(x.id) + '">'
          + UI.avatar(x.title, 'sq') + '<span><b>' + esc(x.title) + '</b><small>' + (x.id === app.project.id ? '正在编辑' : (UI.relTime(x.updated_at) || esc(x.id))) + '</small></span></button>').join('');
      });
    },
    switcher: (app) => switcher(app),
    actions: {
      span: (app, el) => { app.reportSpan = +el.dataset.n; app.renderPage(); },
      onboardOff: app => { localStorage.setItem(ONBOARD, '1'); app.renderPage(); UI.toast('已关闭新手上路'); },
      open: (app, el) => { if (el.dataset.id !== app.project.id) app.switchTo(el.dataset.id); },
      switch: app => switcher(app),
      create: app => UI.prompt('新建作品', '作品名称', '').then(t => { if (t != null) app.createProject(t.trim() || '未命名作品').then(() => UI.toast('已创建新作品')); }),
      heat: (app, el) => { app.heatSpan = +el.dataset.n || 18; app.renderPage(); },
      rite: app => { root.QZPages.write.ritual(app); app.renderPage(); },
      del: app => app.deleteProject(),
      trash: app => app.trashDialog(),
      rename: app => UI.prompt('重命名作品', '作品名称', app.project.title).then(t => { if (t != null) { app.project.setTitle(t); app.renderPage(); } }),
      goal: app => UI.prompt('每日码字目标', '每天写多少字算达标？（网文日更常见 4000）', String(app.project.data.writing.goal)).then(t => { if (t != null) { app.project.setGoal(t); app.renderPage(); } }),
      perDay: app => UI.prompt('每天更新几章', '用于计算存稿能撑几天', String(app.project.data.writing.perDay)).then(t => { if (t != null) { app.project.data.writing.perDay = Math.max(1, parseInt(t, 10) || 1); app.project._changed('writing'); app.renderPage(); } }),
      firstChapter: app => { const c = app.project.addChapter('第一章'); app.navigate('write', false, [c.id]); },
    },
  };

  /** 侧栏的切书弹层：搜索、方向键、回车；显示字数和上次修改时间。 */
  function switcher(app) {
    const old = document.querySelector('.book-pop'); if (old) { old.remove(); return; }
    const btn = document.getElementById('project-switch'), r = btn.getBoundingClientRect(), pop = document.createElement('div');
    pop.className = 'book-pop'; pop.setAttribute('role', 'listbox'); pop.style.top = (r.bottom + 6) + 'px'; pop.style.left = r.left + 'px'; pop.style.width = Math.max(260, r.width + 40) + 'px';
    pop.innerHTML = '<input class="input sm" placeholder="找作品…" aria-label="找作品"><div class="bp-list"><div class="skeleton"></div></div><div class="bp-foot"><button class="btn ghost sm" data-k="new">' + icon('plus') + '新建作品</button><button class="btn ghost sm" data-k="all">全部作品</button><button class="btn ghost sm" data-k="trash">' + icon('trash') + '回收站</button></div>';
    document.body.appendChild(pop); btn.classList.add('open');
    const q = pop.querySelector('input'), host = pop.querySelector('.bp-list'); let list = [], idx = 0;
    const close = () => { pop.remove(); btn.classList.remove('open'); document.removeEventListener('mousedown', outside, true); };
    const outside = e => { if (!pop.contains(e.target) && !btn.contains(e.target)) close(); };
    const pick = x => { close(); if (x && x.id !== app.project.id) app.switchTo(x.id); };
    const draw = () => {
      const k = q.value.trim().toLowerCase(), shown = list.filter(x => !k || String(x.title).toLowerCase().includes(k));
      idx = Math.min(idx, Math.max(0, shown.length - 1));
      host.innerHTML = shown.length ? shown.map((x, i) => '<button class="bp-item' + (i === idx ? ' on' : '') + (x.id === app.project.id ? ' cur' : '') + '" data-i="' + i + '" role="option">' + UI.avatar(x.title, 'sq')
        + '<span><b>' + esc(x.title) + '</b><small>' + (x.id === app.project.id ? '正在编辑' : [x.words != null ? x.words.toLocaleString() + ' 字' : '', UI.relTime(x.updated_at || x.updatedAt) || ''].filter(Boolean).join(' · ')) + '</small></span>' + (x.id === app.project.id ? icon('check') : '') + '<span class="bp-del" data-del="' + i + '" title="删除（移进回收站）" role="button" aria-label="删除">' + icon('trash') + '</span></button>').join('')
        : '<p class="muted small bp-empty">没有叫这个名字的作品</p>';
      host._shown = shown; const on = host.querySelector('.on'); on && on.scrollIntoView({ block:'nearest' });
    };
    app.storage.list().then(l => {
      list = l.map(x => Object.assign({}, x, x.id === app.project.id ? { title:app.project.title } : {}));
      if (!list.some(x => x.id === app.project.id)) list.unshift({ id:app.project.id, title:app.project.title });
      list.sort((a, b) => (b.id === app.project.id) - (a.id === app.project.id)); draw();
    });
    q.addEventListener('input', () => { idx = 0; draw(); });
    q.addEventListener('keydown', e => {
      const n = (host._shown || []).length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % Math.max(1, n); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick((host._shown || [])[idx]); }
      else if (e.key === 'Escape') { e.stopPropagation(); close(); btn.focus(); }
    });
    pop.addEventListener('click', e => {
      const del = e.target.closest('[data-del]'); if (del) { e.stopPropagation(); const x = host._shown[+del.dataset.del]; close(); return app.deleteProject(x.id, x.title); }
      const it = e.target.closest('.bp-item'); if (it) return pick(host._shown[+it.dataset.i]);
      const f = e.target.closest('[data-k]'); if (!f) return; close();
      if (f.dataset.k === 'new') Pages.home.actions.create(app); else if (f.dataset.k === 'trash') app.trashDialog(); else { app.navigate('home'); setTimeout(() => { const l = document.getElementById('project-list'); l && l.scrollIntoView({ behavior:'smooth', block:'center' }); }, 80); }
    });
    setTimeout(() => { document.addEventListener('mousedown', outside, true); q.focus(); }, 0);
  }
}(typeof self !== 'undefined' ? self : globalThis));
