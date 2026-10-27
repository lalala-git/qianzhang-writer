/*! 千章 · ui/page-onboard.js · 新手引导：欢迎页 → 三个可跳过的问题 → 直接写第一章；极简模式写到第 3 章逐步解锁。 */
(function (root) {
  'use strict';
  const UI = root.QZUI, { esc, icon } = UI;
  const Pages = root.QZPages = root.QZPages || {};
  const KEY = 'qianzhang:onboard', UNLOCK = 3, UNLOCK_WORDS = 300, NUDGE = 200;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} return s; };
  const patch = x => save(Object.assign(load() || {}, x));
  const words = t => root.QZStore.countWords(t || '');
  const GENRES = ['玄幻', '仙侠', '都市', '言情', '悬疑', '科幻', '历史', '游戏', '其他'];
  const LENGTHS = [['short', '短篇（几万字）'], ['mid', '中篇（二三十万）'], ['long', '长篇连载']];
  const GOALS = [500, 1000, 2000, 3000];
  /** 不同类型的开篇提示：写进第一章细纲，正文仍然是空的。 */
  const OPENERS = {
    玄幻:'主角出场就遇到麻烦（被退婚 / 被欺压 / 天赋被废）\n给一个让读者想看下去的秘密或金手指线索\n章末：危机逼近，或金手指第一次显灵',
    仙侠:'主角在凡俗中的处境，以及一次和修行世界的意外接触\n写出他想要什么（活下去 / 报仇 / 求长生）\n章末：踏入修行门槛前的一道难关',
    都市:'主角最狼狈的一刻（失业 / 被看不起 / 欠债）\n让他手里出现一个改变命运的机会\n章末：第一次「打脸」的前夜',
    言情:'女主（或男主）在最真实的处境里出场\n两人第一次相遇，最好是不愉快的\n章末：一个让两人不得不再见面的理由',
    悬疑:'第一句就抛出异常：尸体、失踪、一封不该存在的信\n主角为什么必须查下去\n章末：发现第一条线索，同时出现更大的疑问',
    科幻:'用一个具体的日常场景带出世界的不同\n主角遇到打破日常的事件\n章末：意识到世界的真相比想象的危险',
    历史:'用一个具体的时间、地点和人物开场\n主角的身份与困境\n章末：卷入大事件的第一步',
    游戏:'主角进入游戏 / 世界规则第一次展现\n他与众不同的地方（隐藏职业 / 前世记忆 / 漏洞）\n章末：第一次在规则里占到便宜',
    其他:'主角是谁，此刻在哪里\n他想要什么，什么挡住了他\n章末：留一个让人想翻下一章的问题' };
  const FIRST_LINE = '在这里写下你的第一句话。不用管后面怎么写，先让主角出现。';

  function textChapters(p) { return p.chapters().filter(c => words(c.text) >= UNLOCK_WORDS).length; }
  const minimal = app => { const s = load(); return !!(s && s.minimal && app.project && textChapters(app.project) < UNLOCK); };

  Pages.onboard = {
    label:'欢迎', icon:'home',
    minimal,
    FIRST_LINE, OPENERS,
    /** 第一次打开、而且当前作品还一个字都没有，才进引导。 */
    shouldShow: app => !load() && app.project && !app.project.chapters().some(c => words(c.text)),
    render: function (app) {
      const s = load() || {}, step = app.onboardStep || 'welcome';
      if (step === 'ask') return '<section class="ob ob-ask"><p class="ob-kicker">三个小问题，都可以跳过</p>'
        + '<div class="ob-q"><h3>你想写什么类型？</h3><div class="ob-chips" data-q="genre">' + GENRES.map(g => '<button class="chip' + (s.genre === g ? ' on' : '') + '" data-v="' + g + '">' + g + '</button>').join('') + '</div></div>'
        + '<div class="ob-q"><h3>大概想写多长？</h3><div class="ob-chips" data-q="length">' + LENGTHS.map(g => '<button class="chip' + (s.length === g[0] ? ' on' : '') + '" data-v="' + g[0] + '">' + g[1] + '</button>').join('') + '</div></div>'
        + '<div class="ob-q"><h3>今天先写多少字？</h3><div class="ob-chips" data-q="goal">' + GOALS.map(g => '<button class="chip' + ((s.goal || 2000) === g ? ' on' : '') + '" data-v="' + g + '">' + g + ' 字</button>').join('') + '</div></div>'
        + '<div class="ob-actions"><button class="btn primary lg" data-act="onboard.start">' + icon('pen') + '开始写第一章</button><button class="btn ghost" data-act="onboard.start" data-skip="1">跳过，直接开始</button></div></section>';
      return '<section class="ob ob-welcome"><b class="wordmark obw-mark">千章</b><h1>陪你写到第一千章</h1><p class="muted">先写出第一段，再慢慢认识工具。</p>'
        + '<div class="ob-choices"><button class="ob-choice primary" data-act="onboard.newbie">' + icon('sparkle') + '<b>我是第一次写小说</b><span>三个小问题，然后直接开写；其他功能写到第 3 章再出现</span></button>'
        + '<button class="ob-choice" data-act="onboard.pro">' + icon('book') + '<b>我已经有作品了</b><span>直接进入，全部功能都打开</span></button></div>'
        + '<button class="btn ghost sm" data-act="onboard.pro" data-skip="1">跳过引导</button><p class="muted small">之后可以在「更多 → 设置」里重新打开引导。</p></section>';
    },
    mount: function (app) {
      document.querySelectorAll('.ob-chips').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return;
        const k = g.dataset.q; patch({ [k]:k === 'goal' ? +b.dataset.v : b.dataset.v }); g.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b)); }));
    },
    actions: {
      newbie: app => { patch({ mode:'new' }); app.onboardStep = 'ask'; app.renderPage(); },
      pro: app => { save({ mode:'pro', minimal:false, at:new Date().toISOString() }); app.onboardStep = ''; app.navigate('home', true); },
      /** 把回答落到当前作品上：今日目标、第一章（细纲里放开篇提示），然后直接进写作页。 */
      start: (app, el) => {
        const s = patch({ mode:'new', minimal:true, at:new Date().toISOString() }), p = app.project;
        if (!el.dataset.skip) { if (s.goal) p.setGoal ? p.setGoal(s.goal) : (p.data.writing.goal = s.goal); if (s.genre && p.data.meta.title === '我的作品') p.setTitle('我的' + s.genre + '小说'); }
        let c = p.chapters()[0]; if (!c) c = p.addChapter('第一章', '');
        if (!c.outline) p.updateChapter(c.id, { outline:'开篇提示（写完可以删）：\n' + (OPENERS[s.genre] || OPENERS['其他']) });
        try { localStorage.setItem('qianzhang:write-panel', 'off'); } catch (e) {}
        app.onboardStep = ''; app.navigate('write', true, [c.id]); UI.toast('写下第一句吧，其他都不用管');
      },
      reopen: app => { localStorage.removeItem(KEY); app.onboardStep = 'welcome'; app.navigate('onboard'); },
      nudgeGo: app => { document.querySelectorAll('.ob-nudge').forEach(x => x.remove()); Pages.write.actions.aiCheck(app); },
      nudgeNo: () => document.querySelectorAll('.ob-nudge').forEach(x => x.remove()),
      next: app => { document.querySelectorAll('.modal-wrap [data-v="__x"]').forEach(b => b.click()); Pages.write.actions.add(app); },
    },
    /** 写作页顶部的淡进度条（只在极简模式）。 */
    banner: function (app, c) {
      if (!minimal(app)) return '';
      const p = app.project, done = textChapters(p), first = p.chapters()[0], fw = first ? words(first.text) : 0, goal = p.data.writing.goal || 2000;
      const msg = !done && fw < goal ? '完成第一章（' + fw.toLocaleString() + ' / ' + goal.toLocaleString() + ' 字）就是最难的一步' : '写到第 ' + UNLOCK + ' 章解锁规划、分析和发布（已写 ' + done + ' 章）';
      const pct = Math.min(100, Math.round((!done && fw < goal ? fw / goal : done / UNLOCK) * 100));
      return '<div class="obw-bar" title="新手极简模式：可在「更多 → 设置」里关掉"><span>' + esc(msg) + '</span><i style="--p:' + pct + '%"></i></div>';
    },
    /** 写作时调用：200 字时轻轻问一句 AI；第一章写够目标字数时庆祝一次。 */
    onType: function (app, c) {
      const bar = document.querySelector('.obw-bar'); if (bar) { const h = Pages.onboard.banner(app, c); if (h) bar.outerHTML = h; else bar.remove(); }
      const s = load(); if (!s || s.mode !== 'new') return;
      const p = app.project, n = words(c.text), first = p.chapters()[0], key = p.id;
      if (first && c.id === first.id && n >= NUDGE && !(s.nudged || {})[key] && !document.querySelector('.ob-nudge')) {
        patch({ nudged:Object.assign({}, s.nudged, { [key]:1 }) });
        const d = document.createElement('div'); d.className = 'ob-nudge';
        d.innerHTML = '<b>' + icon('sparkle') + ' 开头有 ' + NUDGE + ' 字了</b><p>要不要让 AI 帮你看看这段开篇？只给一两条具体建议，不改你的字。</p><div class="row"><button class="btn sm primary" data-act="onboard.nudgeGo">看看</button><button class="btn sm ghost" data-act="onboard.nudgeNo">先不用</button></div>';
        const side = document.getElementById('check-panel'); if (side) { d.classList.add('in-side'); side.prepend(d); } else document.body.appendChild(d); setTimeout(() => d.remove(), 30000); /* 贴在侧栏，不盖稿纸 */
      }
      const goal = Math.min(p.data.writing.goal || 2000, 3000);
      if (first && c.id === first.id && n >= goal && !(s.celebrated || {})[key]) {
        clearTimeout(Pages.onboard._ct); Pages.onboard._ct = setTimeout(() => { const st = load() || {}; if ((st.celebrated || {})[key]) return; patch({ celebrated:Object.assign({}, st.celebrated, { [key]:1 }) }); Pages.onboard.celeBanner(app); }, +(document.body.dataset.celeMs || 3000)); /* 停笔一会儿才出，且只是条幅，不抢焦点 */
      }
    },
    celeBanner: function (app) {
      const paper = document.querySelector('.paper, .editor-wrap, #ch-text'); if (!paper || document.querySelector('.ob-cele')) return;
      const b = document.createElement('div'); b.className = 'ob-cele ob-cele-bar'; b.setAttribute('role', 'status');
      b.innerHTML = '<span class="ob-medal">1</span><span><b>第一章完成 🎉</b> 这是最难的一步，你已经做到了。</span><button type="button" class="btn sm ghost" data-c="card">给主角建卡</button><button type="button" class="btn sm ghost" data-c="next">写第二章</button><button type="button" class="icon-btn" data-c="x" aria-label="关闭">×</button>';
      b.addEventListener('click', e => { const k = e.target.closest('[data-c]'); if (!k) return; b.remove(); if (k.dataset.c === 'next') Pages.write.actions.add(app); if (k.dataset.c === 'card') Pages.library && Pages.library.actions.add(app); });
      const host = document.getElementById('ch-text'); (host ? host.parentNode : document.body).insertBefore(b, host || null);
    },
    celebrate: function (app) {
      return UI.modal({ title:'第一章完成！', body:'<div class="ob-cele"><span class="ob-medal">1</span><p><b>这是最难的一步。</b>很多人想写小说，但从没写完过第一章，你已经做到了。</p><p class="muted">下一步只做一件事就好：</p></div>',
        buttons:[{ label:'给主角起名字并建卡', value:'card' }, { label:'继续写第二章', primary:true, value:'next' }] })
        .then(v => { if (v === 'next') Pages.write.actions.add(app); if (v === 'card') Pages.library && Pages.library.actions.add(app); });
    },
  };
}(typeof self !== 'undefined' ? self : globalThis));
