/* 千章 · 节奏分析页：黄金三章自查、全书节奏图、人物出场分布。只读，不改任何数据。 */
(function (root) {
  'use strict';
  const UI = root.QZUI, { esc, icon } = UI;
  const Pages = root.QZPages = root.QZPages || {};
  const pct = x => Math.round(x * 100) + '%';

  function golden(r) {
    const done = r.golden.filter(x => x.ok).length;
    return '<section class="panel gold"><div class="panel-head"><div><h2>' + icon('sparkle') + ' 黄金三章自查</h2><p class="muted small">编辑和读者最看重开篇。这里按常见的开篇要求检查前三章，只是参考。</p></div><span class="gold-score"><b>' + done + '</b>/' + r.golden.length + '</span></div>'
      + '<ul class="gold-list">' + r.golden.map(x => '<li class="' + (x.ok ? 'ok' : 'no') + '"><span class="gold-mark">' + icon(x.ok ? 'check' : 'x') + '</span><div><b>' + esc(x.label) + '</b><p class="muted small">' + esc(x.tip) + '</p></div></li>').join('') + '</ul></section>';
  }
  function pacing(r) {
    const cs = r.chapters, max = Math.max(1, ...cs.map(c => c.words)), avg = Math.round(cs.reduce((s, c) => s + c.words, 0) / Math.max(1, cs.length));
    const bars = cs.map(c => { const lvl = c.hypeDensity >= 2 ? 3 : c.hypeDensity >= 1 ? 2 : c.hypeDensity >= 0.5 ? 1 : 0;
      return '<a class="pc-bar lv' + lvl + '" href="#/write/' + encodeURIComponent(c.id) + '" style="--h:' + Math.max(4, Math.round(c.words / max * 100)) + '%" title="第 ' + c.no + ' 章 ' + esc(c.title) + '\n' + c.words.toLocaleString() + ' 字 · 爆点词 ' + c.hype + ' 个 · 对话 ' + pct(c.dialogue) + (c.hook ? ' · 章末有钩子' : '') + '">' + (c.hook ? '<i></i>' : '') + '</a>'; }).join('');
    return '<section class="panel"><div class="panel-head"><div><h2>' + icon('chart') + ' 全书节奏</h2><p class="muted small">柱子高低是字数，颜色越深爆点越密（按「打脸、突破、竟然、怒喝」这类词计算），柱顶小点表示章末有钩子。点柱子可跳到那一章。</p></div><span class="muted small">平均每章 ' + avg.toLocaleString() + ' 字</span></div>'
      + '<div class="pc-chart">' + bars + '</div><div class="pc-legend"><span><i class="lv0"></i>平</span><span><i class="lv1"></i>有起伏</span><span><i class="lv2"></i>爽</span><span><i class="lv3"></i>高潮</span></div>'
      + (r.flat.length ? '<p class="warn-line">' + icon('fire') + ' 从第 ' + r.flat.join('、') + ' 章起连续 4 章以上偏平淡，读者可能在这里流失，可以考虑加一个小爆点。</p>' : '') + '</section>';
  }
  function bystand(app) {
    const b = root.QZCraft.bystanders(app.project, 10); if (!b.length) return '';
    return '<div class="by-line" role="note">' + icon('users') + '<div><b>最近 10 章可能在当背景板</b><ul>' + b.map(x => '<li><a href="#/library/' + encodeURIComponent(x.id) + '">' + esc(x.name) + '</a> 被提到 ' + x.mentions + ' 次（' + x.chapters + ' 章），自己开口或动手只有 ' + x.acts + ' 次</li>').join('') + '</ul><p class="muted small">给 TA 一个自己想要的东西，让 TA 说一句、做一件推动剧情的事。</p></div></div>';
  }
  function cast(r, n, app) {
    if (!r.cast.length) return '<section class="panel"><div class="panel-head"><h2>' + icon('users') + ' 人物出场</h2></div><div class="empty-mini">' + icon('users') + '<p>还没有人物设定。去<a href="#/library">设定库</a>建几个人物，这里就会显示他们在每章的出场次数。</p></div></section>';
    const B = Math.max(1, Math.ceil(n / 60)), cols = Math.ceil(n / B);
    const row = x => { const cells = []; for (let i = 0; i < cols; i++) { const v = x.counts.slice(i * B, i * B + B).reduce((a, b) => a + b, 0); cells.push('<i class="' + (v ? v >= 10 * B ? 'h3' : v >= 3 * B ? 'h2' : 'h1' : '') + '" title="' + (B > 1 ? '第 ' + (i * B + 1) + '–' + Math.min(n, i * B + B) + ' 章' : '第 ' + (i + 1) + ' 章') + '：' + v + ' 次"></i>'); }
      return '<div class="cs-row' + (r.missing.includes(x) ? ' lost' : '') + '"><a class="cs-name" href="#/library/' + encodeURIComponent(x.id) + '">' + esc(x.name) + '</a><span class="cs-cells" style="--cols:' + cols + '">' + cells.join('') + '</span><span class="cs-meta">' + x.chapters + ' 章' + (x.chapters ? ' · 最近第 ' + x.last + ' 章' : ' · 未出场') + '</span></div>'; };
    return '<section class="panel"><div class="panel-head"><div><h2>' + icon('users') + ' 人物出场</h2><p class="muted small">每格一章' + (B > 1 ? '（章节多时每格合并 ' + B + ' 章）' : '') + '，颜色越深出场越多。名字和别名都算。</p></div></div>'
      + (r.missing.length ? '<p class="warn-line">' + icon('flag') + ' ' + r.missing.map(x => '「' + esc(x.name) + '」').join('') + ' 已经 ' + Math.min(...r.missing.map(x => x.gap)) + ' 章以上没出场了，是不是忘了交代？</p>' : '')
      + bystand(app)
      + '<div class="cs-grid">' + r.cast.slice(0, 30).map(row).join('') + '</div>' + (r.cast.length > 30 ? '<p class="muted small">只显示出场最多的 30 位。</p>' : '') + '</section>';
  }

  function blurb(app, r) {
    const p = app.project, b = p.data.meta.blurb || '', list = root.QZCraft.blurbCheck(p.data.meta.title, b, r.lead && r.lead.name), done = list.filter(x => x.ok).length;
    return '<section class="panel"><div class="panel-head"><div><h2>' + icon('book') + ' 书名与简介</h2><p class="muted small">书名和简介决定读者点不点进来。改完点保存，自查会立即更新。</p></div><span class="gold-score"><b>' + done + '</b>/' + list.length + '</span></div>'
      + '<div class="bl-form"><label class="field"><span>书名</span><input class="input" id="bl-title" value="' + esc(p.data.meta.title || '') + '"></label><label class="field"><span>简介 <em class="muted small" id="bl-n">' + Array.from(b.replace(/\s/g, '')).length + ' 字</em></span><textarea class="input" id="bl-text" rows="5" placeholder="三五句话：主角是谁、遇到了什么、想要什么、最大的阻碍或悬念。">' + esc(b) + '</textarea></label>'
      + '<div class="row"><button class="btn primary sm" data-act="insight.saveBlurb">' + icon('check') + '保存</button><button class="btn sm" data-act="insight.draftBlurb" title="按主角和开篇给一份可改的骨架，本机完成">' + icon('pen') + '给我一个骨架</button><button class="btn sm" data-act="insight.aiBlurb">' + icon('sparkle') + 'AI 写 3 版</button></div><div id="bl-vers" class="bl-vers"></div></div>'
      + '<ul class="gold-list compact">' + list.map(x => '<li class="' + (x.ok ? 'ok' : 'no') + '"><span class="gold-mark">' + icon(x.ok ? 'check' : 'x') + '</span><div><b>' + esc(x.label) + '</b><p class="muted small">' + esc(x.tip) + '</p></div></li>').join('') + '</ul></section>';
  }
  /** 读者数据看板：导入作家后台的章节数据，找掉读点，并对照本书的节奏数据。数据只存在本书里，不上传。 */
  let rdCol = '';
  function readerPanel(app, r) {
    const p = app.project, d = p.data.reader, C = root.QZCraft;
    const head = '<div class="panel-head"><div><h2>' + icon('users') + ' 读者数据</h2><p class="muted small">把作家后台「作品数据 → 章节数据」整张表复制粘贴进来（或导入 csv），自动找出掉读点，并和本章的字数、爆点、钩子对照。数据只存在这本书里。</p></div>'
      + (d ? '<div class="row"><button class="btn sm ghost" data-act="insight.readerAgain">重新导入</button><button class="btn sm ghost danger" data-act="insight.readerClear">清除</button></div>' : '') + '</div>';
    const form = '<div class="rd-import"><textarea class="input mono" id="rd-in" rows="5" placeholder="章节\t标题\t阅读\t均订\t本章说\n1\t第1章 下山\t12000\t800\t35\n2\t第2章 雨夜\t9800\t760\t20"></textarea>'
      + '<div class="row"><button class="btn primary sm" data-act="insight.readerImport">' + icon('upload') + '导入</button><label class="btn sm ghost">' + icon('folder') + '选 csv / txt 文件<input type="file" id="rd-file" accept=".csv,.txt,.tsv" hidden></label><span class="muted small" id="rd-msg">认得：阅读、订阅/均订、追读、完读、收藏、评论/本章说、打赏</span></div></div>';
    if (!d || app.readerAgain) return '<section class="panel rd">' + head + form + '</section>';
    const col = d.cols.includes(rdCol) ? rdCol : d.cols[0], x = C.readerDrops(d, col), chs = p.chapters(), byNo = new Map((r.chapters || []).map(c => [c.no, c]));
    const bars = d.rows.filter(w => w.v[col] != null).map(w => { const drop = x.drops.find(k => k.no === w.no), c = chs[w.no - 1];
      return '<a class="rd-bar' + (drop ? ' drop' : '') + '"' + (c ? ' href="#/write/' + encodeURIComponent(c.id) + '"' : '') + ' style="--h:' + Math.max(2, Math.round(w.v[col] / Math.max(1, x.max) * 100)) + '%" title="第 ' + w.no + ' 章 ' + esc(w.title || (c ? c.title : '')) + '\n' + col + '：' + w.v[col].toLocaleString() + (drop ? '\n比上一章掉 ' + drop.pct + '%' : '') + '"></a>'; }).join('');
    const why = k => { const c = byNo.get(k.no); if (!c) return '<span class="muted small">书里没有第 ' + k.no + ' 章</span>'; const t = [];
      if (!c.hook) t.push('章末没有钩子'); if (c.hypeDensity < 0.5) t.push('爆点偏少'); if (c.dialogue < 0.1) t.push('几乎没有对话'); if (c.words < 2000) t.push('只有 ' + c.words + ' 字');
      return '<span class="rd-why">' + (t.length ? t.map(esc).join(' · ') : '节奏数据看不出问题，去看看情节') + '</span>'; };
    return '<section class="panel rd">' + head
      + '<div class="rd-top"><div class="aw-seg">' + d.cols.map(k => '<label class="seg-opt"><input type="radio" name="rd-col" value="' + esc(k) + '"' + (k === col ? ' checked' : '') + '><span>' + esc(k) + '</span></label>').join('') + '</div>'
      + '<div class="pb-stats sm"><div class="pb-stat"><b>' + d.rows.length + '</b><span>章有数据</span></div>' + (x.keep != null ? '<div class="pb-stat' + (x.keep < 30 ? ' low' : '') + '"><b>' + x.keep + '%</b><span>首章到最新章留下</span></div>' : '') + '<div class="pb-stat' + (x.drops.length ? ' low' : '') + '"><b>' + x.drops.length + '</b><span>处掉读超 30%</span></div></div></div>'
      + '<div class="rd-chart">' + bars + '</div>'
      + (x.drops.length ? '<h3 class="rd-h">掉得最多的章节</h3><ul class="rd-drops">' + x.drops.slice(0, 5).map(k => { const c = chs[k.no - 1]; return '<li><a href="' + (c ? '#/write/' + encodeURIComponent(c.id) : '#/insight') + '"><b>第 ' + k.no + ' 章</b> ' + esc(String(k.title || (c ? c.title : '')).replace(/^第\s*\d+\s*章\s*/, '')) + '</a><em>' + k.from.toLocaleString() + ' → ' + k.to.toLocaleString() + '（-' + k.pct + '%）</em>' + why(k) + '</li>'; }).join('') + '</ul>'
        : '<p class="pb-ok">' + icon('check') + ' 没有哪一章比上一章掉 30% 以上。</p>')
      + '<p class="muted small">导入于 ' + esc(String(d.at || '').slice(0, 10)) + '。第 1–3 章掉读很常见，重点看中段突然的断崖。</p></section>';
  }
  const WK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function timePanel(app) {
    const C = root.QZCraft, t = C.timeStats(app.project.data.writing, 30), hm = m => m >= 60 ? Math.floor(m / 60) + ' 小时 ' + (m % 60 ? (m % 60) + ' 分' : '') : m + ' 分钟';
    const head = '<div class="panel-head"><div><h2>' + icon('clock') + ' 写作时间与效率</h2><p class="muted small">近 30 天。打字时自动计时（停下超过 2 分钟不算），只记在这本书里。</p></div></div>';
    if (!t.min && !t.words) return '<section class="panel tm">' + head + '<p class="muted">还没有记录。写一会儿再回来看：每天写了多久、每小时多少字、哪个时段最顺手。</p></section>';
    const hmax = Math.max(1, ...t.hours), tmax = Math.max(1, ...t.trend.map(x => x.words)), wmax = Math.max(1, ...t.week);
    const hours = t.hours.map((v, h) => '<i class="tm-h' + (t.bestWin != null && (h === t.bestWin || h === (t.bestWin + 1) % 24) ? ' best' : '') + '" style="--h:' + Math.max(v ? 4 : 0, Math.round(v / hmax * 100)) + '%" title="' + h + ':00 · ' + v.toLocaleString() + ' 字"></i>').join('');
    const trend = t.trend.map(x => '<i class="tm-d" style="--h:' + Math.max(x.words ? 4 : 0, Math.round(x.words / tmax * 100)) + '%" title="' + x.day + '\n' + x.words.toLocaleString() + ' 字' + (x.min ? ' · ' + x.min + ' 分钟' : '') + (x.speed ? ' · ' + x.speed + ' 字/小时' : '') + '"></i>').join('');
    const week = t.week.map((v, i) => '<div class="tm-wk' + (i === t.bestDay ? ' best' : '') + '"><span>' + WK[i] + '</span><i style="--w:' + Math.round(v / wmax * 100) + '%"></i><em>' + (v ? v.toLocaleString() : '—') + '</em></div>').join('');
    return '<section class="panel tm">' + head
      + '<div class="pb-stats sm"><div class="pb-stat"><b>' + esc(hm(t.min)) + '</b><span>累计在写</span></div><div class="pb-stat"><b>' + (t.speed != null ? t.speed.toLocaleString() : '—') + '</b><span>字 / 小时</span></div><div class="pb-stat"><b>' + t.activeDays + '</b><span>天动过笔</span></div>'
      + (t.change != null ? '<div class="pb-stat' + (t.change <= -20 ? ' low' : '') + '"><b>' + (t.change > 0 ? '+' : '') + t.change + '%</b><span>速度变化</span></div>' : '') + '</div>'
      + '<div class="tm-grid"><div><h3 class="rd-h">每天字数</h3><div class="tm-chart">' + trend + '</div><div class="tm-axis"><span>' + esc(t.trend[0].day.slice(5)) + '</span><span>今天</span></div></div>'
      + '<div><h3 class="rd-h">一天里哪个时段写得多</h3><div class="tm-chart hours">' + hours + '</div><div class="tm-axis"><span>0 点</span><span>6</span><span>12</span><span>18</span><span>23</span></div></div>'
      + '<div><h3 class="rd-h">一周平均</h3><div class="tm-week">' + week + '</div></div></div>'
      + (t.tips.length ? '<ul class="tm-tips">' + t.tips.map(x => '<li>' + icon('sparkle') + esc(x) + '</li>').join('') + '</ul>' : '') + '</section>';
  }
  const GR_TIP = { stall:'停滞', fast:'太快', skip:'越级', down:'倒退', neg:'透支' };
  function growthPanel(app) {
    const p = app.project, g = root.QZCraft.growth(p), n = g.total, w = p.data.writing;
    const head = '<div class="panel-head"><div><h2>' + icon('fire') + ' 战力与资源成长</h2><p class="muted small">在设定详情的「状态变化」里把突破标成<b>境界</b>、把收支标成<b>资源</b>（如「灵石 -30」），这里画出成长线，并提醒升太快、越级、长期停滞和资源透支。</p></div></div>';
    const ladder = '<div class="gr-ladder"><label class="field"><span>境界阶梯（从低到高，空格分开）</span><input class="input sm" id="gr-ladder" value="' + esc(w.ladder != null ? w.ladder : root.QZCraft.LADDER_DEFAULT) + '"></label><button class="btn sm" data-act="insight.saveLadder">保存阶梯</button></div>';
    if (!g.people.length && !g.res.length) return '<section class="panel gr">' + head + '<div class="empty-mini">' + icon('fire') + '<p>还没有标记过境界或资源。打开一个人物 → 状态变化 → 把类型选成「境界」或「资源」。</p></div>' + ladder + '</section>';
    const L = Math.max(1, ...g.people.map(x => Math.max(...x.steps.map(t => t.rank)))); // 纵轴只到书里用到的最高境界，点不会挤在底部
    const track = x => '<div class="gr-row"><a class="gr-name" href="#/library/' + encodeURIComponent(x.id) + '">' + esc(x.name) + '</a><div class="gr-track">'
      + x.steps.map(s => '<a class="gr-dot' + (s.rank < 0 ? ' unk' : '') + '" href="#/write/' + encodeURIComponent(s.chapterId) + '" style="--x:' + (Math.min(1, (s.no - 1) / Math.max(1, n - 1)) * 100).toFixed(1) + '%;--y:' + (s.rank < 0 ? 0 : s.rank / L * 100).toFixed(1) + '%" title="第 ' + s.no + ' 章：' + esc(s.text) + '"></a>').join('')
      + '</div><span class="gr-now"><b>' + esc(x.level) + '</b><small>' + (x.since ? x.since + ' 章未变' : '本章刚变') + '</small></span></div>';
    const res = g.res.length ? '<table class="gr-res"><tr><th>谁的</th><th>资源</th><th>现在</th><th>记账</th></tr>' + g.res.map(r => '<tr' + (r.balance < 0 ? ' class="neg"' : '') + '><td>' + esc(r.owner) + '</td><td>' + esc(r.name) + '</td><td><b>' + r.balance.toLocaleString() + '</b></td><td class="muted small">' + r.log.slice(-4).map(l => '第' + l.no + '章 ' + (l.d > 0 ? '+' : '') + l.d).join(' · ') + '</td></tr>').join('') + '</table>' : '';
    return '<section class="panel gr">' + head
      + (g.alerts.length ? '<ul class="gr-alerts">' + g.alerts.slice(0, 12).map(a => '<li class="' + a.kind + '"><em>' + GR_TIP[a.kind] + '</em><span>' + esc(a.text) + '</span></li>').join('') + '</ul>' : '<p class="pb-ok">' + icon('check') + ' 成长节奏正常，没有发现升太快、停滞或透支。</p>')
      + (g.people.length ? '<div class="gr-chart"><div class="gr-axis"><span>第 1 章</span><span>第 ' + n + ' 章</span></div>' + g.people.map(track).join('') + '</div>' : '') + res + ladder + '</section>';
  }
  function commentBox() {
    return '<section class="panel cm"><div class="panel-head"><div><h2>' + icon('chat') + ' 读者评论整理</h2><p class="muted small">把作家后台的评论或本章说整段粘进来（每行一条），自动分成指错、催更、建议、夸奖。指错里引号括起来的原文会去全书找位置。评论不会保存。</p></div></div>'
      + '<textarea class="input" id="cm-in" rows="4" placeholder="例：第三章「沈星河」写成了「沈星和」\n大大求加更！\n建议女主早点出场"></textarea><div id="cm-out" class="cm-out"></div></section>';
  }
  function commentHtml(app, text) {
    const r = root.QZCraft.comments(text, app.project), names = { fix:'指错', urge:'催更', idea:'建议', praise:'夸奖', other:'其他' };
    const total = Object.values(r).reduce((s, x) => s + x.length, 0); if (!total) return '';
    return '<div class="cm-sum">' + Object.keys(names).map(k => '<span class="cm-tag k-' + k + '">' + names[k] + ' <b>' + r[k].length + '</b></span>').join('') + '</div>'
      + Object.keys(names).filter(k => r[k].length).map(k => '<div class="cm-group"><h4 class="k-' + k + '">' + names[k] + '</h4>' + r[k].map(x => '<div class="cm-item"><p>' + esc(x.text) + '</p>'
        + (x.quote ? (x.hits.length ? '<div class="cm-hits">' + x.hits.slice(0, 5).map(h => '<a href="#/write/' + encodeURIComponent(h.chapterId) + '" data-act="insight.jump" data-id="' + esc(h.chapterId) + '" data-i="' + h.index + '" data-len="' + Array.from(x.quote).length + '">第 ' + h.no + ' 章：…' + esc(h.before.slice(-8)) + '<mark>' + esc(x.quote) + '</mark>' + esc(h.after.slice(0, 8)) + '…</a>').join('') + '</div>' : '<p class="muted small">全书没找到「' + esc(x.quote) + '」，可能已经改过了。</p>') : '') + '</div>').join('') + '</div>').join('');
  }

  Pages.insight = {
    label:'节奏分析', icon:'chart',
    render: function (app) {
      const p = app.project, n = p.chapters().length;
      if (!n || !p.chapters().some(c => c.text.trim())) return '<div class="page page-insight"><header class="page-head"><div><h1>节奏分析</h1><p class="muted">写上几章，就能看到全书的节奏起伏、人物出场和开篇自查。</p></div></header>'
        + '<section class="empty-state"><span class="empty-icon">' + icon('chart') + '</span><h2>还没有正文</h2><p>写上几章，这里会画出全书的节奏起伏、人物出场，并自查开篇三章。</p><div class="row center"><a class="btn primary lg" href="#/write">' + icon('pen') + '去写作</a></div></section></div>';
      const r = root.QZCraft.insight(p);
      return '<div class="page page-insight"><header class="page-head"><div><h1>节奏分析</h1><p class="muted">' + n + ' 章 · 从开篇、节奏、人物三个角度看全书。只做统计，不改正文。</p></div></header>'
        + '<div class="insight-grid">' + golden(r) + pacing(r) + '</div>' + cast(r, n, app) + '<details class="more-an" id="more-an"' + (localStorage.getItem('qianzhang:insight-more') === 'on' ? ' open' : '') + '><summary>' + icon('chevron') + '<b>更多分析</b><span class="muted small">写作时间 · 读者数据 · 人物成长</span></summary>' + timePanel(app) + readerPanel(app, r) + growthPanel(app) + '</details>' + '<div class="insight-grid two">' + blurb(app, r) + commentBox() + '</div></div>';
    },
    mount: function (app) {
      try { localStorage.setItem('qianzhang:seen-insight', '1'); } catch (e) {}
      const ma = document.getElementById('more-an'); if (ma) ma.addEventListener('toggle', () => { try { localStorage.setItem('qianzhang:insight-more', ma.open ? 'on' : 'off'); } catch (e) {} });
      const inp = document.getElementById('cm-in'), out = document.getElementById('cm-out'); let t;
      if (inp) { if (app.commentDraft) { inp.value = app.commentDraft; out.innerHTML = commentHtml(app, inp.value); }
        inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { app.commentDraft = inp.value; out.innerHTML = commentHtml(app, inp.value); }, 200); }); }
      document.querySelectorAll('[name=rd-col]').forEach(x => x.addEventListener('change', () => { rdCol = x.value; app.renderPage(); }));
      const rf = document.getElementById('rd-file'); if (rf) rf.addEventListener('change', () => { const f = rf.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { document.getElementById('rd-in').value = String(fr.result).replace(/^\uFEFF/, ''); Pages.insight.actions.readerImport(app); }; fr.readAsText(f); });
      const bt = document.getElementById('bl-text'), bn = document.getElementById('bl-n');
      if (bt) bt.addEventListener('input', () => { bn.textContent = Array.from(bt.value.replace(/\s/g, '')).length + ' 字'; });
    },
    actions: {
      draftBlurb: app => { const el = document.getElementById('bl-text'), put = () => { el.value = root.QZCraft.blurbDraft(app.project); el.focus(); el.dispatchEvent(new Event('input')); };
        el.value.trim() ? UI.confirm('替换简介', '用骨架替换输入框里的简介？已保存的简介不受影响，点保存才会覆盖。', '替换').then(ok => ok && put()) : put(); },
      aiBlurb: app => {
        const AI = root.QZAI, s = AI.loadSettings(), box = document.getElementById('bl-vers');
        if (!AI.ready(s)) return UI.toast('还没连接模型，不会发送任何内容。可以先用「给我一个骨架」', 'err');
        box.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
        AI.complete(s, root.QZCraft.blurbMessages(app.project), { onDelta:(d, full) => { box.innerHTML = '<pre class="bl-raw">' + esc(full) + '</pre>'; } })
          .then(full => { box._vers = root.QZCraft.splitVersions(full); box.innerHTML = box._vers.map((v, i) => '<div class="bl-ver"><p>' + esc(v) + '</p><button class="btn sm" data-act="insight.useBlurb" data-i="' + i + '">用这版</button></div>').join(''); })
          .catch(e => { box.innerHTML = '<p class="error small">' + esc(e.message) + '</p>'; });
      },
      useBlurb: (app, el) => { const box = document.getElementById('bl-vers'), t = document.getElementById('bl-text'); t.value = box._vers[+el.dataset.i]; t.dispatchEvent(new Event('input')); UI.toast('已填入，改好后点保存'); },
      readerImport: app => { const t = document.getElementById('rd-in'), d = root.QZCraft.parseReader(t && t.value);
        if (!d) { const m = document.getElementById('rd-msg'); if (m) { m.textContent = '没读出数据：第一行放表头（如「章节 阅读 均订」），每行一章，用 Tab 或逗号分开。'; m.classList.add('err'); } return; }
        app.project.setReader(d); app.readerAgain = false; rdCol = ''; app.renderPage(); UI.toast('已导入 ' + d.rows.length + ' 章数据：' + d.cols.join('、')); },
      readerAgain: app => { app.readerAgain = true; app.renderPage(); },
      readerClear: (app, el) => { if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = '再点一次清除'; return; } app.project.setReader(null); app.renderPage(); UI.toast('读者数据已清除'); },
      saveLadder: app => { app.project.setLadder(document.getElementById('gr-ladder').value); app.renderPage(); UI.toast('境界阶梯已保存'); },
      saveBlurb: app => { app.project.setTitle(document.getElementById('bl-title').value); app.project.setBlurb(document.getElementById('bl-text').value); app.renderPage(); UI.toast('书名和简介已保存'); },
      jump: (app, el, e) => { if (e) e.preventDefault(); const d = Object.assign({}, el.dataset); app.navigate('write', false, [d.id]); setTimeout(() => Pages.write.actions.locate(app, { dataset:d }), 80); }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
