/* 千章 · Ctrl+K 命令面板：一个输入框跳到任何章节、设定、页面或常用操作。 */
(function (root) {
  'use strict';
  const UI = root.QZUI, esc = s => UI.esc(s);
  const PAGES = [['write', '写作'], ['plan', '大纲与伏笔'], ['library', '设定库与关系图'], ['notes', '素材墙'], ['insight', '分析'], ['publish', '发布'], ['home', '概览'], ['chat', '角色聊天'], ['settings', '设置与备份']];
  const ACTS = [['add', '新建章节', 'Alt+N'], ['prepub', '发布前 30 秒自查', 'Alt+P'], ['companion', '开关 AI 陪写', 'Alt+C'], ['focus', '小黑屋专注模式', 'Ctrl+Shift+F'], ['panel', '本章体检', 'Ctrl+.'], ['search', '全书查找替换', 'Ctrl+Shift+H'], ['notes', '本章素材', 'Alt+M'], ['rules', '设定规则', ''], ['history', '本章历史版本', ''], ['branches', '情节分支', ''], ['aiCheck', 'AI 看看这一章', ''], ['outline', '本章细纲', ''], ['read', '朗读本章', ''], ['export', '导出本章', ''], ['exportAll', '导出全书', '']];
  const RECENT = 'qianzhang:palette-recent';

  /** 简单模糊匹配：按顺序包含全部字符；连续/开头命中分更高。返回 -1 表示不匹配。 */
  function score(text, q) {
    if (!q) return 0; text = String(text).toLowerCase(); q = q.toLowerCase();
    const at = text.indexOf(q); if (at >= 0) return 100 - Math.min(at, 50) + (at === 0 ? 50 : 0);
    let i = 0, s = 0, last = -2;
    for (const ch of q) { const j = text.indexOf(ch, i); if (j < 0) return -1; s += j === last + 1 ? 3 : 1; last = j; i = j + 1; }
    return s;
  }
  function items(app) {
    const p = app.project, P = app.pages(), mini = P.onboard && P.onboard.minimal(app), out = [];
    const cur = app.route.page === 'write' ? app.route.params[0] : '';
    ACTS.forEach(([k, label, key]) => out.push({ id:'a:' + k, kind:'操作', icon:'pen', label, key, run:() => {
      if (app.route.page !== 'write') { app.navigate('write', false, [cur || (p.chapters()[0] || {}).id || '']); setTimeout(() => Pages.write.actions[k](app), 60); } else Pages.write.actions[k](app); } }));
    PAGES.forEach(([k, label]) => { if (P[k] && (!mini || k === 'write' || k === 'home' || k === 'settings')) out.push({ id:'p:' + k, kind:'页面', icon:'map', label, run:() => app.navigate(k) }); });
    p.chapters().forEach((c, i) => out.push({ id:'c:' + c.id, kind:'章节', icon:'book', label:'第 ' + (i + 1) + ' 章 ' + (c.title || ''), sub:(c.outline || '').split('\n')[0].slice(0, 40), no:i + 1, cid:c.id, body:c.text || '', run:() => app.navigate('write', false, [c.id]) }));
    if (!mini) (p.data.nodes || []).forEach(n => out.push({ id:'e:' + n.id, kind:'设定', icon:'pin', label:n.name, sub:[].concat(n.aliases || []).join('、'), run:() => app.navigate('library', false, [n.id]) }));
    out.push({ id:'b:del', kind:'作品', icon:'trash', label:'删除当前作品（移进回收站）', run:() => app.deleteProject() }); out.push({ id:'b:trash', kind:'作品', icon:'trash', label:'回收站（恢复删除的作品）', run:() => app.trashDialog() });
    if (root.QZRelief) { out.push({ id:'r:paper', kind:'解压', icon:'trash', label:'撕烂废稿（解压）', run:() => root.QZRelief.open('paper') }); out.push({ id:'r:bubble', kind:'解压', icon:'sparkle', label:'卸压泡泡纸（解压）', run:() => root.QZRelief.open('bubble') }); }
    out.push({ id:'t:theme', kind:'操作', icon:'moon', label:'切换深浅色', run:() => app.toggleTheme() });
    return out;
  }
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT)) || []; } catch (e) { return []; } }
  function filter(all, q) {
    q = q.trim();
    if (!q) { const r = recent(), byId = new Map(all.map(x => [x.id, x])); const top = r.map(id => byId.get(id)).filter(Boolean); return top.concat(all.filter(x => !r.includes(x.id) && x.kind !== '设定')).slice(0, 12); }
    const hit = all.map(x => ({ x, s:Math.max(score(x.label, q), score(x.sub || '', q) - 20, score(x.kind, q) - 40) })).filter(o => o.s >= 0).sort((a, b) => b.s - a.s).slice(0, 30).map(o => o.x);
    return hit.concat(bodyHits(all, q)).slice(0, 40);
  }
  /** 正文全文搜：每章最多 2 处，共 10 处，点了跳到那一章并选中。 */
  function bodyHits(all, q) {
    if (Array.from(q).length < 2) return []; const out = [];
    all.forEach(x => { if (x.kind !== '章节' || out.length >= 10) return; let at = x.body.indexOf(q), k = 0;
      while (at >= 0 && k < 2 && out.length < 10) { const i = at; out.push({ id:'t:' + x.cid + ':' + i, kind:'正文', icon:'search', label:'…' + x.body.slice(Math.max(0, i - 12), i + q.length + 16).replace(/\s+/g, ' ') + '…', sub:'第 ' + x.no + ' 章',
        run:() => { const A = root.QZ || root.app; A && A.navigate('write', false, [x.cid]); setTimeout(() => { const t = document.getElementById('ch-text'); if (t) { t.focus(); t.setSelectionRange(i, i + q.length); const lh = parseFloat(getComputedStyle(t).lineHeight) || 28; t.scrollTop = Math.max(0, t.value.slice(0, i).split('\n').length * lh - t.clientHeight / 2); } }, 120); } });
        at = x.body.indexOf(q, at + q.length); k++; } });
    return out;
  }
  function open(app) {
    if (!app.project || document.querySelector('.pal-wrap')) return;
    const all = items(app), wrap = document.createElement('div'); let list = [], sel = 0;
    wrap.className = 'pal-wrap'; wrap.innerHTML = '<div class="pal" role="dialog" aria-label="命令面板"><div class="pal-in">' + UI.icon('search') + '<input id="pal-q" placeholder="跳到章节、设定、页面，或输入要做的事…" autocomplete="off"><kbd>Esc</kbd></div><div class="pal-list" id="pal-list" role="listbox"></div><div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>Ctrl</kbd><kbd>K</kbd> 随时呼出</span></div></div>';
    document.body.appendChild(wrap);
    const q = wrap.querySelector('#pal-q'), box = wrap.querySelector('#pal-list');
    const draw = () => {
      list = filter(all, q.value); sel = Math.min(sel, Math.max(0, list.length - 1));
      box.innerHTML = list.length ? list.map((x, i) => '<a class="pal-item' + (i === sel ? ' on' : '') + '" data-i="' + i + '" role="option"><span class="pal-ic">' + UI.icon(x.icon) + '</span><span class="pal-t"><b>' + esc(x.label) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span><em>' + esc(x.kind) + '</em>' + (x.key ? '<kbd>' + esc(x.key) + '</kbd>' : '') + '</a>').join('') : '<div class="pal-empty">没找到「' + esc(q.value) + '」</div>';
      const on = box.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block:'nearest' });
    };
    const close = () => wrap.remove();
    const run = i => { const x = list[i]; if (!x) return; close(); try { const r = recent().filter(id => id !== x.id); r.unshift(x.id); localStorage.setItem(RECENT, JSON.stringify(r.slice(0, 5))); } catch (e) {} x.run(); };
    q.addEventListener('input', () => { sel = 0; draw(); });
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { sel = (sel + 1) % Math.max(1, list.length); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = (sel - 1 + list.length) % Math.max(1, list.length); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { run(sel); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); e.preventDefault(); }
      e.stopPropagation();
    });
    box.addEventListener('mousemove', e => { const a = e.target.closest('.pal-item'); if (a && +a.dataset.i !== sel) { sel = +a.dataset.i; box.querySelectorAll('.pal-item').forEach((n, i) => n.classList.toggle('on', i === sel)); } });
    box.addEventListener('click', e => { const a = e.target.closest('.pal-item'); if (a) run(+a.dataset.i); });
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    draw(); q.focus();
  }
  root.QZPalette = { open, score, filter, items };
}(typeof self !== 'undefined' ? self : globalThis));
