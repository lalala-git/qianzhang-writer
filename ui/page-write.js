/*! 千章 · ui/page-write.js · 正文与章节：分卷目录 + 稿纸 + 细纲 + 本章体检 */
(function (root) {
  'use strict';
  const UI = root.QZUI, { esc, icon } = UI;
  const Pages = root.QZPages = root.QZPages || {};
  const words = t => root.QZStore.countWords(t);
  const PANEL = 'qianzhang:write-panel', OUTLINE = 'qianzhang:write-outline';

  function current(app, params) {
    const list = app.project.chapters();
    return app.project.chapter(params[0]) || list[list.length - 1] || null;
  }
  function sensitiveExtra(app) { return String(app.project.data.writing.sensitive || '').split(/[\s,，、]+/).filter(Boolean); }

  /** 边写边建：发现新名字时右下角轻轻问一句。 */
  const nnLater = new Set();
  const nnKey = app => 'qianzhang:nn-ignore:' + app.project.id;
  const nnIgnored = app => { try { return JSON.parse(localStorage.getItem(nnKey(app))) || []; } catch (e) { return []; } };
  /** 千章仪式感：到第 100/300/500/1000 章，生成一张可保存的里程碑卡，并解锁一个小皮肤。 */
  const RITE = id => 'qianzhang:rite:' + id;
  try { const sk = localStorage.getItem('qianzhang:skin'); if (sk) document.documentElement.dataset.skin = sk; } catch (e) {}
  function riteCanvas(r, title) {
    const cv = document.createElement('canvas'), W = 720, H = 960; cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1f2a44'); bg.addColorStop(1, '#3a2f2a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(232,200,140,.6)'; g.lineWidth = 2; g.strokeRect(36, 36, W - 72, H - 72);
    g.fillStyle = '#e8c88c'; g.textAlign = 'center'; g.font = '600 150px serif'; g.fillText(String(r.n), W / 2, 300);
    g.font = '36px serif'; g.fillText('第 ' + r.n + ' 章 · 里程碑', W / 2, 370);
    g.fillStyle = '#f4efe6'; g.font = '30px serif'; g.fillText('《' + title + '》', W / 2, 450);
    const rows = [['总字数', r.words.toLocaleString()], ['码字天数', r.days + ' 天'], ['最长连更', r.best + ' 天'], ['伏笔回收', r.resolved + ' / ' + r.planted], ['最常出场', r.top.join('、') || '—']];
    g.font = '26px sans-serif'; rows.forEach((x, i) => { g.textAlign = 'left'; g.fillStyle = 'rgba(244,239,230,.65)'; g.fillText(x[0], 120, 560 + i * 62); g.textAlign = 'right'; g.fillStyle = '#f4efe6'; g.fillText(x[1], W - 120, 560 + i * 62); });
    g.textAlign = 'center'; g.fillStyle = 'rgba(232,200,140,.8)'; g.font = '22px serif'; g.fillText('千章 · 陪你写到第一千章', W / 2, H - 80);
    return cv;
  }
  function ritual(app) {
    let seen = []; try { seen = JSON.parse(localStorage.getItem(RITE(app.project.id)) || '[]'); } catch (e) {}
    const r = root.QZCraft.ritual(app.project, seen); if (!r) return null;
    try { localStorage.setItem(RITE(app.project.id), JSON.stringify(seen.concat(r.n))); } catch (e) {}
    const body = '<div class="rite"><div class="rite-card"><em>' + r.n + '</em><span>第 ' + r.n + ' 章 · 里程碑</span><h3>《' + esc(app.project.title) + '》</h3><dl>'
      + [['总字数', r.words.toLocaleString()], ['码字天数', r.days + ' 天'], ['最长连更', r.best + ' 天'], ['伏笔回收', r.resolved + ' / ' + r.planted], ['最常出场', r.top.join('、') || '—']].map(x => '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>').join('')
      + '</dl></div><p class="muted small">解锁了皮肤「' + esc(r.skinName) + '」。以后随时可以在「设置」里换回来。</p></div>';
    UI.modal({ title:'写到第 ' + r.n + ' 章了', body, buttons:[{ label:'收下', value:null }, { label:'保存卡片', value:'save' }, { label:'换上「' + r.skinName + '」', value:'skin', primary:true }] }).then(v => {
      if (v === 'save') { const a = document.createElement('a'); a.download = '千章-第' + r.n + '章.png'; a.href = riteCanvas(r, app.project.title).toDataURL('image/png'); a.click(); }
      if (v === 'skin') { try { localStorage.setItem('qianzhang:skin', r.skin); } catch (e) {} document.documentElement.dataset.skin = r.skin; UI.toast('已换上「' + r.skinName + '」'); }
    });
    return r;
  }
  /** 活的设定回声：写到设定名时，右下角极轻地浮出它的最新状态和上次出场。 */
  let echoKey = '';
  function echo(app, id, t) {
    if (localStorage.getItem('qianzhang:echo') === 'off') return;
    const r = root.QZCraft.echoAt(app.project, id, t.value, t.selectionStart); let el = document.getElementById('echo');
    if (!r || (!r.state && !r.lastNo && !r.summary)) { if (el) el.classList.remove('show'); echoKey = ''; return; }
    const key = r.entity.id + ':' + r.lastNo + ':' + r.state; if (key === echoKey && el && el.classList.contains('show')) return; echoKey = key;
    if (!el) { el = document.createElement('div'); el.id = 'echo'; el.className = 'echo'; el.setAttribute('aria-live', 'polite'); (document.querySelector('.editor') || document.body).appendChild(el); }
    el.innerHTML = '<b>' + esc(r.name) + '</b>' + (r.state ? '<span class="' + (r.dead ? 'dead' : '') + '">' + esc(r.state) + '<small>第 ' + r.stateNo + ' 章</small></span>' : r.summary ? '<span>' + esc(r.summary) + '</span>' : '')
      + (r.lastId ? '<a href="#/write/' + encodeURIComponent(r.lastId) + '" title="跳到上次出场">上次 第 ' + r.lastNo + ' 章' + (r.gap > 30 ? '（' + r.gap + ' 章前）' : '') + '</a>' : '<a href="#/library/' + encodeURIComponent(r.entity.id) + '">设定</a>');
    el.classList.toggle('far', r.gap > 30); el.classList.add('show');
  }
  function nnCheck(app, c, t) {
    if (!c || app.focus || (Pages.onboard && Pages.onboard.minimal(app)) || document.querySelector('.ob-nudge, .ob-cele')) return;
    const old = document.querySelector('.nn-card');
    // 只在一段写完（光标前是句末/换行）时才记一次，写到一半不打扰
    if (t && !/[。！？!?…」”\n]\s*$/.test(t.value.slice(0, t.selectionStart == null ? t.value.length : t.selectionStart))) return;
    const list = root.QZCraft.newNames(c.text, app.project.data.nodes, nnIgnored(app).concat(Array.from(nnLater)));
    if (!list.length) { if (old) old.remove(); return; }
    const x = list[0], T = root.QZStore.TYPES, key = list.slice(0, 3).map(y => y.name).join('|'); if (old && old.dataset.key === key) return; if (old) old.remove();
    const el = document.createElement('div'); el.className = 'nn-card nn-strip'; el.dataset.name = x.name; el.dataset.key = key; el.setAttribute('role', 'status'); el.title = '…' + x.sample + '…';
    el.innerHTML = icon('pin') + '<span class="nn-lab">新名字</span><b>' + esc(x.name) + '</b>' + (list.length > 1 ? '<small>' + list.slice(1, 3).map(y => esc(y.name)).join('、') + (list.length > 3 ? ' 等 ' + list.length + ' 个' : '') + '</small>' : '')
      + '<span class="grow"></span><select class="select sm" id="nn-type" aria-label="类型">' + Object.keys(T).map(k => '<option value="' + k + '"' + (k === x.type ? ' selected' : '') + '>' + T[k] + '</option>').join('') + '</select>'
      + '<button class="btn ghost sm" data-act="write.nnAdd">收进设定</button><button class="icon-btn sm" data-act="write.nnLater" title="稍后" aria-label="稍后">' + icon('x') + '</button><button class="nn-no" data-act="write.nnIgnore" title="这个词不是名字，以后不再提示">不是名字</button>';
    const slot = document.getElementById('nn-slot'); if (slot) slot.appendChild(el); /* 并进右侧入正典队列上方，不再出现在正文上；没开右栏就只记在队列里 */
  }
  /** AI 陪写：停笔几秒后在正文下方给一句边注（连了模型用模型，没连用规则）。 */
  const CP = 'qianzhang:companion', cp = { on:false, timer:null, ctl:null, since:{}, seen:{}, notes:{} };
  /* 陪写每次打开都是关着的：不跨会话记住“开”，免得忘了关、一直往模型发正文（旧版本记下的“开”在这里清掉） */
  try { localStorage.removeItem(CP); } catch (e) {}
  const CP_OK = 'qianzhang:companion-notice';
  function cpHost() { try { return new URL(root.QZAI.loadSettings().baseUrl).host; } catch (e) { return '你配置的模型服务'; } }
  /** 第一次在已连模型的情况下打开陪写：说清楚会发什么、发给谁；不同意就不打开 */
  function cpConsent() {
    const AI = root.QZAI; if (!AI.ready(AI.loadSettings())) return Promise.resolve(true);
    try { if (localStorage.getItem(CP_OK) === '1') return Promise.resolve(true); } catch (e) {}
    return UI.modal({ title:'打开陪写前请确认', body:'<p>陪写开着时，你每次停笔，千章会把正文最近约 800 字和本书的人物设定发送给 <b>' + esc(cpHost()) + '</b>，换回一句边注。</p><p class="muted">它会一直开到你关掉或关闭页面。写作页顶部会一直显示「陪写开」，点一下就能关。</p>',
      buttons:[{ label:'不打开', value:false }, { label:'知道了，打开', primary:true, value:true }] }).then(ok => { if (ok) { try { localStorage.setItem(CP_OK, '1'); } catch (e) {} } return !!ok; });
  }
  /** 常驻开关指示：开着时顶栏显示「陪写开 · 关闭」，一点就关 */
  function cpBadge() {
    const b = document.getElementById('cp-badge'); if (!b) return;
    const sends = root.QZAI.ready(root.QZAI.loadSettings());
    b.hidden = !cp.on; b.classList.toggle('sending', sends);
    b.title = sends ? '陪写开着：停笔时会把最近约 800 字发给 ' + cpHost() + '。点一下关闭' : '陪写开着（未连接模型，不发送内容）。点一下关闭';
    const m = document.querySelector('[data-act="write.companion"]'); if (m) { m.classList.toggle('on', cp.on); m.setAttribute('aria-pressed', cp.on); }
  }
  function cpSet(on, id) {
    cp.on = on; if (!on) { clearTimeout(cp.timer); if (cp.ctl) cp.ctl.abort(); }
    cpBadge(); if (id) cpDraw(id);
  }
  function cpDraw(id) {
    const box = document.getElementById('cp-feed'); if (!box) return;
    const list = (cp.notes[id] || []).slice(-3);
    box.hidden = !cp.on; box.innerHTML = cp.on ? '<div class="cp-head">' + icon('chat') + '<b>陪写</b><span>' + (root.QZAI.ready(root.QZAI.loadSettings()) ? '停笔 6 秒后，把最近 800 字发给你连接的模型，回你一句' : '停笔 6 秒后给一句提醒（未连接模型，不发送任何内容）') + '</span></div>'
      + (list.length ? list.map((n, i) => '<p class="cp-note' + (i === list.length - 1 ? ' new' : '') + (n.ai ? ' ai' : '') + '"><span>' + esc(n.text) + '</span><small>' + esc(n.at) + '</small></p>').join('') : '<p class="cp-note muted">写吧，我在旁边看着。</p>') : '';
  }
  function cpTick(app, id, t) {
    if (!cp.on) return; clearTimeout(cp.timer);
    if (cp.since[id] == null) cp.since[id] = t.value.length;
    cp.timer = setTimeout(() => cpSpeak(app, id, t), +(document.body.dataset.cpDelay || prefs().cpSec * 1000));
  }
  function cpSpeak(app, id, t) {
    if (!cp.on || !document.body.contains(t)) return;
    const text = t.value, since = cp.since[id] || 0; if (Array.from(text.slice(since)).length < 120) return;
    const push = (txt, ai) => { const d = new Date(); (cp.notes[id] = cp.notes[id] || []).push({ text:txt, ai, at:String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }); cp.since[id] = text.length; cpDraw(id); };
    const AI = root.QZAI, st = AI.loadSettings();
    let agreed = false; try { agreed = localStorage.getItem(CP_OK) === '1'; } catch (e) {}
    if (AI.ready(st) && agreed) { // 打开后才连上模型的：没确认过就继续用本地规则，不发送
      if (cp.ctl) cp.ctl.abort(); cp.ctl = new AbortController();
      AI.complete(st, root.QZCraft.companionMessages(app.project, id, text), { signal:cp.ctl.signal }).then(r => { const x = String(r && r.text != null ? r.text : r || '').trim().split('\n')[0].slice(0, 80); if (x) push(x, true); }).catch(() => {});
      return;
    }
    const n = root.QZCraft.companion(app.project, id, text, since, cp.seen[id] = cp.seen[id] || []);
    if (n) { cp.seen[id].push(n.k); push(n.text, false); } else cp.since[id] = text.length;
  }
  /** 卡文 3 分钟：陪写默认关着，停笔太久才轻轻问一句要不要帮忙；也可随时 Alt+C 叫出来。 */
  /** 提醒偏好（本机）：卡文提示几分钟、今天/永远不提示；陪写间隔；撕稿提示 */
  const NUDGE = 'qianzhang:nudges', today = () => new Date().toISOString().slice(0, 10);
  function prefs() { let p = {}; try { p = JSON.parse(localStorage.getItem(NUDGE) || '{}') || {}; } catch (e) {} return Object.assign({ stuckMin:10, stuckOff:'', cpSec:30, tearOff:'', tearDay:'' }, p); }
  function setPrefs(o) { try { localStorage.setItem(NUDGE, JSON.stringify(Object.assign(prefs(), o))); } catch (e) {} }

  const stuck = { t:null, no:{} };
  function tearArm(app, t) { /* 半小时没动笔：空闲时、非小黑屋、每天最多一次、可不再提示 */
    clearTimeout(stuck.tt); const old = document.getElementById('tear-hint'); if (old) old.remove();
    stuck.tt = setTimeout(() => { const P = prefs(); if (app.focus || P.tearOff === 'never' || P.tearDay === today() || document.hidden || !document.body.contains(t) || document.getElementById('stuck')) return;
      setPrefs({ tearDay:today() }); const el = document.createElement('div'); el.id = 'tear-hint'; el.className = 'stuck'; el.setAttribute('role', 'status');
      el.innerHTML = '<span>半小时没动笔了，撕两张废纸放松一下？</span><button class="btn ghost sm" data-act="write.relief">撕一下</button><button class="btn ghost sm" data-act="write.tearNever">不再提示</button>';
      el.addEventListener('click', () => setTimeout(() => el.remove(), 0)); const feed = document.getElementById('cp-feed'); if (feed) feed.before(el); else (document.querySelector('.paper') || document.body).appendChild(el); }, +(document.body.dataset.tearMs || 1800000));
  }
  function stuckArm(app, id, t) {
    tearArm(app, t); clearTimeout(stuck.t); const el = document.getElementById('stuck'); if (el) el.remove();
    const P = prefs(); if (cp.on || stuck.no[id] || app.focus || P.stuckOff === 'never' || P.stuckOff === today() || !(P.stuckMin > 0)) return;
    stuck.t = setTimeout(() => stuckShow(app, id, t), +(document.body.dataset.stuckMs || P.stuckMin * 60000));
  }
  function stuckShow(app, id, t) {
    if (cp.on || !document.body.contains(t) || document.getElementById('stuck') || Array.from(t.value.trim()).length < 50) return;
    const el = document.createElement('div'); el.id = 'stuck'; el.className = 'stuck'; el.setAttribute('role', 'status');
    el.innerHTML = icon('chat') + '<span>停了 ' + prefs().stuckMin + ' 分钟，要不要陪写看一眼、给个方向？</span><button class="btn primary sm" data-act="write.summon">叫陪写</button><button class="btn ghost sm" data-act="write.stuckNo" title="本章不再提示">不用</button><button class="btn ghost sm" data-act="write.stuckToday">今天不再提示</button><a class="muted small" href="#/settings" title="在设置里改时长或关掉">设置</a>';
    const feed = document.getElementById('cp-feed'); if (feed) feed.before(el); else (document.querySelector('.paper') || document.body).appendChild(el);
  }
  /** 体检面板内容（输入时局部刷新）。 */
  function checkHtml(app, c) {
    const no = app.project.chapterNo(c.id);
    let qplat = 'qidian'; try { qplat = JSON.parse(localStorage.getItem('qianzhang:publish') || '{}').platform || qplat; } catch (e) {}
    const qk = root.QZCraft.quickCheck(app.project, c.id, qplat, sensitiveExtra(app)), qbad = qk ? qk.items.filter(x => !x.ok) : [];
    const qsum = '<div class="check-sum ' + (qk && qk.bad ? 'danger' : qbad.length ? 'warn' : 'ok') + '"><b>' + (qk && qk.bad ? qk.bad + ' 项必须改' : qbad.length ? qbad.length + ' 项建议看看' : '本章可以发了') + '</b>' + (qbad.length ? '<ul>' + qbad.slice(0, 4).map(x => '<li>' + esc(x.label) + '：' + esc(x.detail) + '</li>').join('') + '</ul>' : '') + '<div class="row"><button class="btn ghost sm" data-act="write.prepub">' + icon('share') + '发布前自查</button><button class="btn ghost sm" data-act="write.rules">' + icon('list') + '设定规则</button></div></div>';
    const r = root.QZCraft.scan(c.text, app.project.data.nodes, sensitiveExtra(app), { dead:app.project.deadBy(no - 1) });
    const stateOf = e => { const pg = app.project.progressOf(e.id, no); return pg.length ? pg[pg.length - 1] : null; };
    const loc = (x, cls, extra) => '<button class="hit ' + (cls || '') + '" data-act="write.locate" data-i="' + x.index + '" data-len="' + (x.len || x.word.length) + '" title="点击在正文中定位">' + esc(x.word) + '<small>' + (x.unit ? x.count + x.unit : '×' + x.count) + '</small>' + (extra || '') + '</button>';
    const clean = [], foldClean = () => clean.length ? '<details class="check-clean"><summary>' + UI.icon('check') + ' 其余 ' + clean.length + ' 项没问题<small>' + esc(clean.map(x => x[0]).join(' · ')) + '</small></summary>' + clean.map(x => '<div class="check-sec"><h4>' + x[0] + '</h4><p class="muted small">' + x[1] + '</p></div>').join('') + '</details>' : '';
    const sec = (title, tip, body, n) => !body && !n && !/设定规则/.test(title) ? (clean.push([title, tip]), '') : '<div class="check-sec"><h4>' + title + (n ? '<span class="badge' + (n > 0 && /错名|敏感|已故|错别|占位/.test(title) ? ' warn' : '') + '">' + n + '</span>' : '') + '</h4>' + (body || '<p class="muted small">' + tip + '</p>') + '</div>';
    const mentions = r.mentions.map(m => '<a class="mention" href="#/library/' + encodeURIComponent(m.entity.id) + '" title="' + esc(m.entity.summary || '') + '">' + UI.avatar(m.entity.name, 'xs') + '<span>' + esc(m.entity.name) + '</span><small>×' + m.count + '</small>'
      + '<span class="hover-card"><b>' + esc(m.entity.name) + '</b><em>' + esc((root.QZStore.TYPES[m.entity.type] || '')) + '</em>' + esc(m.entity.summary || '（没有简介）') + (stateOf(m.entity) ? '<i class="hc-state">当前：' + esc(stateOf(m.entity).text) + (stateOf(m.entity).dead ? '（已死亡）' : '') + '</i>' : '') + '</span></a>').join('');
    const rd = root.QZCraft.expectRadar(app.project, c.id), radar = '<div class="check-sec radar"><h4>读者预期' + (rd && rd.level !== 'wait' ? '<span class="badge' + (rd.level === 'ok' ? '' : ' warn') + '">' + rd.score + '</span>' : '') + '</h4><div class="mood-pick" role="group" aria-label="这章想让读者">' + ['爽', '虐', '悬', '甜'].map(x => '<button class="chip' + (c.expect === x ? ' on' : '') + '" data-act="write.expect" data-m="' + x + '" aria-pressed="' + (c.expect === x) + '">' + x + '</button>').join('') + '</div>' + (rd ? '<ul class="radar-tips ' + rd.level + '">' + rd.tips.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '<p class="muted small">标一下这章想让读者什么感觉，按你自己以往同类章节比给提示。</p>') + '</div>';
    const sd = root.QZCraft.styleDrift(app.project, c.id), isA = (app.project.data.meta.styleAnchors || []).includes(c.id);
    const style = '<div class="check-sec style"><h4>文风' + (sd ? '<span class="badge' + (sd.level === 'ok' ? '' : ' warn') + '">' + sd.score + '</span>' : '') + '</h4>' + (sd ? '<ul class="radar-tips ' + sd.level + '">' + sd.tips.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul><p class="muted small">对照' + (sd.picked ? '你指定的' : '前几章') + '：第 ' + sd.anchors.join('、') + ' 章</p>' : '<p class="muted small">本章写满 500 字后，和锚点章（默认前 3 章）比句长、对白、程度词，看文风有没有越写越飘。</p>')
      + '<button class="btn ghost sm" data-act="write.anchor" aria-pressed="' + isA + '">' + icon('pin') + (isA ? '取消锚点章' : '设为文风锚点章') + '</button></div>';
    const at = root.QZCraft.aiTone(c.text), aiSec = sec('AI 腔', at.level === 'wait' ? '写满 300 字后检查「眼中闪过一丝」「嘴角勾起一抹」这类套话。' : '没有明显的 AI 套话。', at.hits.length ? at.hits.slice(0, 12).map(x => loc(x, at.level === 'danger' ? 'warn' : '')).join('') + (at.level !== 'ok' ? '<p class="muted small">每千字 ' + at.per1k.toFixed(1) + ' 处。换成这个人物自己才会有的动作或说法。</p>' : '') : '', at.total);
    const ml = root.QZCraft.mobileLayout(c.text), mlSec = sec('手机排版', '段落长短合适，换人说话也换了行。', ml.total ? (ml.walls.length ? '<p class="muted small">超过 250 字、没有对白的大段（手机上约 10 行以上），拆成 2–3 段：</p>' + ml.walls.slice(0, 6).map(x => loc(x, 'warn', '')).join('') : '') + (ml.crowd.length ? '<p class="muted small">同一段里塞了 3 句以上对白，换人就换行：</p>' + ml.crowd.slice(0, 6).map(x => loc(x, '')).join('') : '') : '', ml.total);
    const pu = root.QZCraft.punct(c.text), puSec = sec('标点与占位符', '没有漏掉的占位符，标点也统一。', pu.total ? (pu.holes.length ? '<p class="muted small">占位符会直接被读者看到：</p>' + pu.holes.map(x => loc(x, 'warn')).join('') : '') + (pu.half.length ? '<p class="muted small">中文里混了半角标点：</p>' + pu.half.slice(0, 8).map(x => loc(x)).join('') : '') + (pu.pile.length ? '<p class="muted small">连串标点，一章别反复出现：</p>' + pu.pile.slice(0, 8).map(x => loc(x)).join('') : '') : '', pu.total);
    const op = root.QZCraft.opening(c.text), opSec = op.level === 'wait' ? '' : '<div class="check-sec open-sec ' + op.level + '"><h4>开头三行<span class="badge' + (op.level === 'ok' ? '' : ' warn') + '">' + ({ ok:'抓人', warn:'一般', danger:'偏慢' })[op.level] + '</span></h4><ol class="open-lines">' + op.sents.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol><p class="muted small">' + (op.level === 'ok' ? '开头有' + [op.pull.length ? '「' + op.pull.slice(0, 3).join('、') + '」' : '', op.talk ? '对白' : '', op.ask ? '疑问/惊叹' : ''].filter(Boolean).join('、') + '，读者会想往下看。' : (op.slow.length ? '以「' + op.slow.slice(0, 3).join('、') + '」开场，像在介绍背景。' : '前三句没有冲突、对白或疑问。') + '试着把本章最紧张的一句挪到最前面，背景之后再补。') + '</p></div>';
    const pv = root.QZCraft.povSlip(c.text), pvSec = pv.hits.length ? sec('人称跳跃', '', '<p class="muted small">本章是第三人称，下面这些「我」在引号外，可能漏了引号或视角跳了：</p>' + pv.hits.slice(0, 6).map(x => loc(x, 'warn')).join(''), pv.hits.length) : '';
    const idp = root.QZCraft.infodump(c.text), idSec = idp.hits.length ? sec('设定说明段', '', '<p class="muted small">没有对白、像百科一样介绍设定的长段，读者容易跳过。拆开，放进人物的行动或对话里，用到时再说：</p>' + idp.hits.slice(0, 6).map(x => loc(x, 'warn', '<em>' + esc(x.marks.slice(0, 2).join('/')) + '</em>')).join(''), idp.hits.length) : '';
    const dt = root.QZCraft.dialogTags(c.text), dtSec = dt.level === 'warn' ? sec('对话标签', '', '<p class="muted small">' + dt.quotes + ' 句对白里有 ' + dt.plain + ' 处用「说/道」。试着删掉一半标签，用动作或神态让读者认出是谁在说：</p>' + dt.hits.slice(0, 6).map(x => loc(x)).join('') + '<p class="dt-eg small">“走吧。”他说。 → “走吧。”他把剑插回鞘里。</p>', dt.plain) : '';
    const sb = root.QZCraft.sceneBreaks(c.text), sbSec = sb.hits.length ? sec('场景切换', '', '<p class="muted small">时间或地点跳了，但前面没有空行或「***」，读者会以为还在同一场：</p>' + sb.hits.slice(0, 6).map(x => loc(x)).join(''), sb.hits.length) : '';
    const tc = root.QZCraft.titleClash(app.project, c.id), tcSec = tc.length ? sec('标题撞车', '', '<p class="muted small">和这些章的标题' + (tc[0].sim === 1 ? '一模一样' : '很像') + '，目录里读者分不清：</p>' + tc.slice(0, 4).map(x => '<a class="hit" href="#/write/' + encodeURIComponent(x.id) + '">' + esc(root.QZCraft.chapterTitle({ title:x.title }, x.no)) + '<small>' + (x.sim === 1 ? '同名' : Math.round(x.sim * 100) + '%') + '</small></a>').join(''), tc.length) : '';
    const lsn = root.QZCraft.longSent(c.text), lsSec = lsn.hits.length ? sec('超长句', '', '<p class="muted small">70 字以上才断句，手机上要读两三行。在逗号处拆成两句，重要信息放句尾：</p>' + lsn.hits.slice(0, 6).map(x => loc(x, 'warn')).join(''), lsn.hits.length) : '';
    const te = root.QZCraft.tellEmotion(c.text), teSec = te.total >= 2 ? sec('情绪直给', '', '<p class="muted small">把情绪直接说出来，读者感受不到。换成身体反应、动作或一句对白，比如「很生气」→ 攥紧杯子、指节发白：</p>' + te.hits.slice(0, 8).map(x => loc(x)).join(''), te.total) : '';
    const rt = root.QZCraft.routine(c.text), rtSec = rt.level === 'warn' ? sec('流水账', '', '<p class="muted small">一段里连着写了 ' + rt.hits.length + ' 件日常小事。和主线无关的话，一句带过，直接从发生事情的那一刻写起：</p>' + rt.hits.slice(0, 8).map(x => loc(x)).join(''), rt.hits.length) : '';
    const ss = root.QZCraft.sameStart(c.text), ssSec = ss.hits.length ? sec('句首重复', '', '<p class="muted small">连着几句都用同一个字开头。把其中一两句改成动作、环境或对方的反应开头：</p>' + ss.hits.slice(0, 6).map(x => loc(x)).join(''), ss.hits.length) : '';
    const cq = root.QZCraft.canonQueue(app.project, c.id), cqHigh = cq.filter(x => x.conf === 'high' && (x.kind === 'new' || x.kind === 'state')), cqSec = cq.length ? '<div class="check-sec canon-q"><h4>入正典<span class="badge' + (cq.some(x => x.kind === 'conflict') ? ' warn' : '') + '">' + cq.length + '</span>' + (cqHigh.length ? '<button class="btn primary sm" data-act="write.canonAll">一键收下 ' + cqHigh.length + ' 条</button>' : '') + (cq.filter(x => x.kind === 'conflict').length > 1 ? '<button class="btn ghost sm" data-act="write.canonIntendAll" title="把本章所有冲突都记为故意这样写，可撤销">冲突全部是故意的</button>' : '') + '</h4><p class="muted small">本章新出现的名字和状态变化。比喻、假设、回忆和对白里的话不算。</p>'
      + cq.slice(0, 12).map(x => '<div class="cq-item ' + x.kind + ' ' + x.conf + (x.soft ? ' soft' : '') + '" data-k="' + esc(x.key) + '"><button class="cq-main" data-act="write.locate" data-i="' + x.index + '" data-len="' + x.len + '" title="定位到正文"><b>' + esc(x.text) + '</b><small>' + esc(x.sample) + '</small></button>' + (x.hits && x.hits.length > 1 ? '<span class="cq-hits">' + x.hits.map((h, k) => '<button class="hit" data-act="write.locate" data-i="' + h.index + '" data-len="' + h.len + '" title="' + esc(h.sample) + '">第 ' + (k + 1) + ' 处：' + esc(h.sample.slice(0, 14)) + '…</button>').join('') + '</span>' : '') + '<span class="cq-acts">'
        + (x.kind === 'conflict' ? (x.src ? '<button class="btn ghost sm" data-act="write.canonSrc" data-no="' + x.src + '">看第 ' + x.src + ' 章</button>' : '') + '<button class="btn ghost sm" data-act="write.canonIntend" data-k="' + esc(x.key) + '">故意这样写</button>'
          : '<button class="btn ghost sm" data-act="write.canonOk" data-k="' + esc(x.key) + '">' + (x.kind === 'typo' ? '改成「' + esc(x.name) + '」' : '收下') + '</button>' + (x.kind === 'state' ? '<button class="btn ghost sm" data-act="write.canonTemp" data-k="' + esc(x.key) + '" title="只在本章成立，不写进设定">本章临时</button>' : '') + '<button class="btn ghost sm" data-act="write.canonNo" data-k="' + esc(x.key) + '">忽略</button>') + '</span></div>').join('') + '</div>' : '';
    const core = qk ? '<div class="check-core">' + qk.items.filter(x => x.k === 'words' || x.k === 'hook').map(x => '<div class="' + (x.ok ? '' : 'bad') + '"><small>' + esc(x.label) + '</small><b>' + esc(x.k === 'words' ? root.QZStore.countWords(c.text).toLocaleString() + ' 字' : x.ok ? '有' : '待加强') + '</b></div>').join('') + '</div>' : '';
    const moreOpen = localStorage.getItem('qianzhang:check-more') === 'open';
    r.aliasList = root.QZCraft.aliasSuggest(aliasCtx(app), c.text).slice(0, 8); const alTypo = new Set(r.aliasList.filter(x => x.kind === 'typo').map(x => x.name)); /* 错名在「别名与外号」里给出全书统一按钮，「疑似错名」不再重复列 */
    return core + qsum + cqSec
      + (r.ghosts.length ? sec('已故角色开口', '', r.ghosts.map(x => loc(x, 'danger', '<em>已在前文死亡</em>')).join(''), r.ghosts.length) : '')
      + sec('错别字', '没有发现常见错别字。', r.typos.map(x => loc(x, 'warn', '<em>→ ' + esc(x.fix) + '</em>')).join(''), r.typos.length)
      + sec('疑似错名', '没有发现和已登记名字只差一个字的写法。', r.suspects.filter(x => !alTypo.has(x.word)).map(x => loc(x, 'warn', '<em>→ ' + esc(x.like) + '？</em>')).join(''), r.suspects.filter(x => !alTypo.has(x.word)).length)
      + aliasSec(app, c, r)
      + sec('敏感词', '未命中敏感词清单（可在「设置」里补充）。', r.sensitive.map(x => loc(x, 'danger')).join(''), r.sensitive.length)
      + '<details class="check-more"' + (moreOpen ? ' open' : '') + '><summary data-act="write.checkMore">更多检查（节奏、文风、AI 腔、排版…）</summary>' + radar + ssSec + rtSec + teSec + lsSec + tcSec + opSec + pvSec + idSec + dtSec + sbSec + style + aiSec + mlSec + puSec + sec('本章出场', '还没有出现已登记的人物或设定。', mentions, r.mentions.length)
      + sec('口头禅', '没有用得过多的套话。', r.crutch.map(x => loc(x)).join(''), r.crutch.length)
      + sec('高频重复', '没有明显重复的词。', r.repeats.map(x => loc(x)).join(''), r.repeats.length)
      + foldClean() + growthSec(app, r, no) + '</details>'
      + rulesSec(app, c, no)
      + '<div class="check-sec"><h4>AI 助手</h4><p class="muted small">续写、润色、对照设定查矛盾、卡文出思路都在这里（Ctrl+J）。未连接模型时不会发送任何内容。</p><button class="btn sm block" data-act="write.aiCheck">' + icon('sparkle') + 'AI 检查本章</button></div>';
  }

  /** 别名映射的上下文：已登记名字、别名（一名多人会合并）、标为故意的名字 */
  function aliasCtx(app) {
    const P = app.project, nodes = P.data.nodes || [], aliases = {}, marks = {}, D = (P.data.writing || {}).canonDismiss || {};
    nodes.forEach(n => String(n.aliases || '').split(/[,，、\s]+/).map(x => x.trim()).filter(x => x.length >= 1 && x !== n.name).forEach(a => { (aliases[a] = aliases[a] || []).push(n.name); }));
    Object.keys(D).forEach(k => { if (k.indexOf('al:') === 0) marks[k.slice(3)] = D[k].note || ''; });
    return { canon:nodes.map(n => n.name).filter(Boolean), aliases, marks };
  }
  /** 别名与外号：外号建议收进人物卡、错名全书统一（预览 + 撤销）、一名多人只提示 */
  function aliasSec(app, c, r) {
    const list = r.aliasList || [];
    if (!list.length) return '';
    const tip = { typo:'可能写错了名字', nickname:'像是外号', conflict:'同一个称呼对应好几个人', scope:'这个称呼通常只在特定场合用' };
    return '<div class="check-sec alias-sec"><h4>别名与外号<span class="badge">' + list.length + '</span></h4>' + list.map(x => {
      const tg = [].concat(x.target).join(' / ');
      const btn = x.kind === 'nickname' ? '<button class="btn ghost sm" data-act="write.alAdd" data-n="' + esc(x.name) + '" data-to="' + esc(tg) + '">记为「' + esc(tg) + '」的别名</button>'
        : x.kind === 'typo' ? '<button class="btn ghost sm" data-act="write.alFix" data-n="' + esc(x.name) + '" data-to="' + esc(tg) + '">全书改成「' + esc(tg) + '」</button>' : '';
      return '<div class="al-item ' + x.kind + ' ' + x.confidence + '"><button class="cq-main" data-act="write.locate" data-i="' + x.at[0] + '" data-len="' + x.name.length + '" title="定位到正文"><b>' + esc(x.name) + ' → ' + esc(tg) + '</b><small>' + tip[x.kind] + (x.confidence === 'low' ? '（把握不大）' : '') + ' · ' + x.at.length + ' 处</small></button><div class="cq-acts">' + btn + '<button class="btn ghost sm" data-act="write.alIntend" data-n="' + esc(x.name) + '">故意这样写</button></div></div>';
    }).join('') + '</div>';
  }

  /** 设定规则：作者自己写的「这时候不能出现的词」，命中可点击定位。 */
  function rulesSec(app, c, no) {
    const C = root.QZCraft, rules = C.parseRules(app.project.data.writing.rules), hits = C.ruleHits(rules, c.text, no);
    const body = hits.map(h => '<button class="hit danger" data-act="write.locate" data-i="' + h.index + '" data-len="' + h.word.length + '" title="' + esc(h.range + (h.note ? '：' + h.note : '')) + '">' + esc(h.word) + '<small>×' + h.count + '</small><em>' + esc(h.note || h.range) + '</em></button>').join('');
    return '<div class="check-sec"><h4>设定规则' + (hits.length ? '<span class="badge warn">' + hits.length + '</span>' : '') + '</h4>' + (body || '<p class="muted small">' + (rules.length ? '本章没有违反 ' + rules.length + ' 条规则。' : '把「这时候还不能出现」的词写成规则，写错了这里会提醒。') + '</p>')
      + '<button class="btn sm ghost block" data-act="write.rules">' + icon('list') + (rules.length ? '编辑规则（' + rules.length + '）' : '添加设定规则') + '</button></div>';
  }

  /** 成长线：出场人物此时的境界、本章触发的成长提醒。没记过境界 / 资源就不显示。 */
  function growthSec(app, r, no) {
    const p = app.project; if (!p.data.nodes.some(n => (n.progress || []).some(x => x.kind))) return '';
    const g = root.QZCraft.growth(p), here = g.alerts.filter(a => a.no === no && a.kind !== 'stall');
    const lv = r.mentions.map(m => { const st = (g.people.find(x => x.id === m.entity.id) || { steps:[] }).steps.filter(s => s.no <= no).pop(); return st ? '<span class="gr-lv"><b>' + esc(m.entity.name) + '</b>' + esc(st.rank >= 0 ? g.ladder[st.rank] : st.text) + '</span>' : ''; }).join('');
    if (!lv && !here.length) return '';
    return '<div class="check-sec"><h4>成长' + (here.length ? '<span class="badge warn">' + here.length + '</span>' : '') + '</h4>' + (lv ? '<div class="gr-lvs">' + lv + '</div>' : '')
      + here.map(a => '<p class="gr-alert ' + a.kind + '">' + esc(a.text) + '</p>').join('') + '<a class="muted small" href="#/insight">全书成长线 →</a></div>';
  }

  function chapterList(app, c) {
    const p = app.project, groups = p.outline(), all = p.chapters();
    const item = x => '<a class="chapter-item' + (c && x.id === c.id ? ' on' : '') + '" href="#/write/' + encodeURIComponent(x.id) + '"><span class="ch-no">' + (all.indexOf(x) + 1) + '</span><span class="ch-title">' + esc(x.title) + '</span><span class="ch-words">' + words(x.text).toLocaleString() + '</span></a>';
    return groups.map(g => (g.volume ? '<div class="vol-head"><span>' + esc(g.volume.title) + '</span><button class="icon-btn sm" data-act="write.add" data-vol="' + esc(g.volume.id) + '" title="在本卷新建章节">' + icon('plus') + '</button></div>' : '')
      + g.chapters.map(item).join('')).join('');
  }

  Pages.write = {
    label:'写作', icon:'pen',
    render: function (app, params) {
      const p = app.project, list = p.chapters(), c = current(app, params);
      const side = '<aside class="chapter-list"><div class="side-head"><h2>目录</h2><button class="icon-btn" data-act="write.add" title="新建章节">' + icon('plus') + '</button></div>'
        + (list.length || p.data.volumes.length ? chapterList(app, c) : '<p class="muted pad">还没有章节</p>')
        + '<button class="btn ghost block" data-act="write.import">' + icon('upload') + '导入 txt / md</button><a class="btn ghost block ob-hide" href="#/plan">' + icon('map') + '分卷与伏笔</a></aside>';
      if (!c) return '<div class="write-layout">' + side + '<section class="empty-state"><span class="empty-icon">' + icon('book') + '</span><h2>开始你的第一章</h2><p>写作区会自动保存并记录今日字数。也可以导入已有的稿子，按「第X章」自动拆分。</p><div class="row center"><button class="btn primary lg" data-act="write.add">' + icon('plus') + '新建章节</button><button class="btn lg" data-act="write.import">' + icon('upload') + '导入稿件</button></div></section></div>';
      const idx = list.indexOf(c), panel = localStorage.getItem(PANEL) === 'on', showOutline = localStorage.getItem(OUTLINE) === 'on' || !!c.outline || !!c.storyTime;
      const s = root.QZCraft.streak(p.data.writing.daily, p.data.writing.goal);
      const vols = p.volumes();
      return '<div class="write-layout' + (panel ? ' with-panel' : '') + '">' + side + '<section class="editor">'
        + '<div class="editor-bar"><span class="muted">第 ' + (idx + 1) + ' / ' + list.length + ' 章</span>'
        + (vols.length ? '<select class="select sm" id="ch-vol" title="所属分卷"><option value="">未分卷</option>' + vols.map(v => '<option value="' + esc(v.id) + '"' + (c.volumeId === v.id ? ' selected' : '') + '>' + esc(v.title) + '</option>').join('') + '</select>' : '')
        + '<span class="grow"></span>'
        + '<button class="pill cp-badge" id="cp-badge" data-act="write.companionOff"' + (cp.on ? '' : ' hidden') + '><i></i>陪写开 · 关闭</button>'
        + '<span class="pill goal-pill' + (s.done ? ' ok' : '') + '" id="today-pill" title="今日码字 / 目标">今日 <b id="today-words">' + s.today.toLocaleString() + '</b> / ' + s.goal.toLocaleString() + '</span>'
        + '<span class="pill" id="wc">' + words(c.text).toLocaleString() + ' 字</span>'
        + '<button class="btn ghost sm' + (c.status === 'published' ? ' on ok' : '') + '" data-act="write.publish" title="' + (c.status === 'published' ? '本章已标为已发布，点一下改回未发布' : '本章还没发布（算在存稿里）。点一下先做发布前自查，再标为已发布') + '">' + icon('check') + (c.status === 'published' ? '已发布' : '标为已发布') + '</button>'
        + (reader.on ? '<button class="btn ghost sm on" data-act="write.read" title="停止朗读（Esc）">' + icon('volume') + '停止朗读</button>' : '')
        + '<button class="btn ghost sm icon-only" data-act="write.relief" title="解压：撕烂废稿（正文不受影响）" aria-label="解压">' + icon('trash') + '</button>'
        + '<button class="btn ghost sm" data-act="write.focus" title="小黑屋专注模式（Ctrl+Shift+F）">' + icon('fire') + '小黑屋</button>'
        + '<button class="btn ghost sm' + (showOutline ? ' on' : '') + '" data-act="write.outline" title="本章细纲与书中时间">' + icon('list') + '细纲</button>'
        + '<button class="btn ghost sm' + (panel ? ' on' : '') + '" data-act="write.panel" title="检查：错名、敏感词、设定规则、发布前自查，一处看完（Ctrl+.）">' + icon('check') + '检查</button>'
        + '<button class="btn ghost sm" data-act="write.aiWrite" title="AI：责编（检查/润色）· 陪写（续写/卡文）· 查询（Ctrl+J）">' + icon('sparkle') + 'AI</button>'
        + '<details class="menu"><summary class="icon-btn" title="更多">' + icon('more') + '</summary><div class="menu-pop">'
        + '<button data-act="write.companion" class="' + (cp.on ? 'on' : '') + '" aria-pressed="' + cp.on + '">' + icon('chat') + 'AI 陪写：停笔时给一句边注<kbd>Alt+C</kbd></button><button data-act="write.prepub">' + icon('share') + '发布前自查<kbd>Alt+P</kbd></button><button data-act="write.foreshadow">' + icon('flag') + '在本章埋一个伏笔</button><button data-act="write.notes">' + icon('note') + '本章素材' + ((app.project.notes({ link:c.id }).length) ? '（' + app.project.notes({ link:c.id }).length + '）' : '') + '…<kbd>Alt+M</kbd></button><hr>'
        + '<button data-act="write.template">' + icon('plus') + '用模板新建章节…</button><button data-act="write.saveTpl">' + icon('list') + '把本章细纲存为模板</button><button data-act="write.paper">' + icon('pen') + '字体与纸张…</button><hr>'
        + '<button data-act="write.read">' + icon('volume') + '朗读校对（从光标处读）</button><button data-act="write.rules">' + icon('list') + '设定规则（一致性）…</button><button data-act="write.history">' + icon('clock') + '历史稿 / 版本对比</button><button data-act="write.snap">' + icon('clock') + '手动存一个版本</button><button data-act="write.search">' + icon('search') + '全书搜索替换<kbd>Ctrl+Shift+H</kbd></button><hr>'
        + '<button data-act="write.up"' + (idx === 0 ? ' disabled' : '') + '>' + icon('arrowUp') + '上移</button><button data-act="write.down"' + (idx === list.length - 1 ? ' disabled' : '') + '>' + icon('arrowDown') + '下移</button>'
        + '<button data-act="write.copy">' + icon('upload') + '复制本章（平台排版）</button><button data-act="write.publishExport">' + icon('download') + '按平台格式导出…</button><hr><button class="danger" data-act="write.remove">' + icon('trash') + '删除本章</button></div></details></div>'
        + (app.focus ? '<div class="focus-hud" id="focus-hud"></div>' : '')
        + '<div class="paper">' + (showOutline ? '<details class="outline-box"' + (localStorage.getItem(OUTLINE) === 'on' || !String(c.outline || '').trim() && localStorage.getItem(OUTLINE) !== 'off' ? ' open' : '') + '><summary>' + icon('list') + '<b>本章细纲</b><span class="ob-peek">' + esc(String(c.outline || '').split('\n').filter(l => l.trim() && !/^[^：]{2,6}：\s*$/.test(l))[0] || '点开写这一章要发生什么') + '</span></summary><div class="ob-head"><label>本章细纲</label><input id="ch-time" class="st-input" placeholder="书中时间，如：第三天夜 / 民国二十三年秋" value="' + esc(c.storyTime || '') + '"></div><textarea id="ch-outline" rows="' + Math.min(8, Math.max(3, String(c.outline || '').split('\n').length)) + '" placeholder="这一章要发生什么？冲突、爽点、章末钩子……">' + esc(c.outline || '') + '</textarea></details>' : '') + (Pages.onboard ? Pages.onboard.banner(app, c) : '')
        + '<input class="chapter-title' + (Array.from(c.title).length > 14 ? ' long' : '') + '" id="ch-title" value="' + esc(c.title) + '" placeholder="章节标题" data-id="' + esc(c.id) + '">'
        + '<textarea class="chapter-text" id="ch-text" placeholder="' + (Pages.onboard && Pages.onboard.minimal(app) ? Pages.onboard.FIRST_LINE : '从这里开始写……') + '" data-id="' + esc(c.id) + '">' + esc(c.text) + '</textarea><div class="cp-feed" id="cp-feed" aria-live="polite"' + (cp.on ? '' : ' hidden') + '></div></div></section>'
        + (panel ? '<aside class="check-panel"><div id="nn-slot"></div><div id="check-panel">' + checkHtml(app, c) + '</div></aside>' : '') + '</div>';
    },
    checkHtml, ritual, riteCanvas, prefs, setPrefs,
    /** 断点续写：记下每本书最后停在哪章哪个字。 */
    resumeInfo: function (app) {
      let r = null; try { r = JSON.parse(localStorage.getItem('qianzhang:caret:' + app.project.id)); } catch (e) {}
      const c = r && app.project.chapter(r.id); if (!c) return null;
      const pos = Math.max(0, Math.min(r.pos | 0, c.text.length)), before = c.text.slice(0, pos).replace(/\s+$/, '');
      const snip = Array.from(before.split(/[。！？!?\n]/).filter(x => x.trim()).pop() || '').slice(-14).join('');
      const min = Math.round((Date.now() - (r.at || 0)) / 60000), ago = min < 1 ? '刚刚' : min < 60 ? min + ' 分钟前' : min < 1440 ? Math.round(min / 60) + ' 小时前' : Math.round(min / 1440) + ' 天前';
      return { id:c.id, no:app.project.chapterNo(c.id), title:c.title, pos, snip, ago, min, atEnd:pos >= c.text.replace(/\s+$/, '').length };
    },
    mount: function (app, params) {
      if (reader.on) stopRead();
      applyPaper();
      const t = document.getElementById('ch-text'), title = document.getElementById('ch-title'); if (!t) return;
      mention(app, t);
      const id = t.dataset.id, grow = () => { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight, 420) + 'px'; };
      grow();
      cpDraw(id);
      const CK = 'qianzhang:caret:' + app.project.id; let ct = null;
      const saveCaret = () => { clearTimeout(ct); ct = setTimeout(() => { try { localStorage.setItem(CK, JSON.stringify({ id, pos:t.selectionStart, at:Date.now() })); } catch (e) {} }, 300); };
      ['keyup', 'click', 'input'].forEach(ev => t.addEventListener(ev, saveCaret));
      const ri = Pages.write.resumeInfo(app);
      if (ri && ri.id === id && ri.pos > 0 && !app.focus) {
        t.setSelectionRange(ri.pos, ri.pos); const main = document.getElementById('main');
        if (!ri.atEnd && main) { const y = t.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop + t.scrollHeight * (ri.pos / Math.max(1, t.value.length)); main.scrollTop = Math.max(0, y - main.clientHeight / 3); }
        try { t.focus({ preventScroll:true }); } catch (e) {}
        if (ri.min >= 5 && ri.snip) { const chip = document.createElement('div'); chip.className = 'resume-chip'; chip.innerHTML = UI.icon('pen') + '<span>上次停在「' + esc(ri.snip) + '」 · ' + esc(ri.ago) + '</span>'; const pp = t.closest('.paper'); if (pp) { pp.appendChild(chip); setTimeout(() => chip.classList.add('out'), 4500); setTimeout(() => chip.remove(), 5200); } }
      }
      let timer = null;
      t.addEventListener('input', () => {
        app.project.updateChapter(id, { text:t.value });
        document.getElementById('wc').textContent = words(t.value).toLocaleString() + ' 字'; grow(); const cw = document.querySelector('.chapter-item.on .ch-words'); if (cw) cw.textContent = words(t.value).toLocaleString();
        const s = root.QZCraft.streak(app.project.data.writing.daily, app.project.data.writing.goal);
        document.getElementById('today-words').textContent = s.today.toLocaleString();
        document.getElementById('today-pill').classList.toggle('ok', s.done);
        if (app.focus) hud(app);
        if (Pages.onboard) Pages.onboard.onType(app, app.project.chapter(id));
        cpTick(app, id, t); stuckArm(app, id, t);
        clearTimeout(echo.t); echo.t = setTimeout(() => echo(app, id, t), 250);
        clearTimeout(timer); timer = setTimeout(() => { const panel = document.getElementById('check-panel'); if (panel) panel.innerHTML = checkHtml(app, app.project.chapter(id)); nnCheck(app, app.project.chapter(id), t); }, 600);
      });
      title.addEventListener('input', () => app.project.updateChapter(id, { title:title.value }));
      title.addEventListener('change', () => app.renderPage());
      title.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }); /* 标题里回车直接去写正文 */
      const tm = document.getElementById('ch-time'); if (tm) tm.addEventListener('input', () => app.project.updateChapter(id, { storyTime:tm.value }));
      const o = document.getElementById('ch-outline'); if (o) o.addEventListener('input', () => app.project.updateChapter(id, { outline:o.value }));
      const v = document.getElementById('ch-vol'); if (v) v.addEventListener('change', () => { app.project.updateChapter(id, { volumeId:v.value }); app.renderPage(); });
      if (app.focus) { document.body.classList.add('focus-mode'); hud(app); t.focus(); } else document.body.classList.remove('focus-mode');
      if (!params[0]) history.replaceState(null, '', '#/write/' + encodeURIComponent(id));
    },
    onKey: function (app, e) {
      const k = e.key, mod = e.ctrlKey || e.metaKey;
      if (k === 'Escape' && reader.on) { stopRead(); return true; }
      if (k === 'Escape' && app.focus) { exitFocus(app); return true; }
      if (mod && e.shiftKey && k.toLowerCase() === 'f') { app.focus ? exitFocus(app) : Pages.write.actions.focus(app); return true; }
      if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
        const list = app.project.chapters(), c = current(app, app.route.params), i = list.indexOf(c) + (k === 'ArrowUp' ? -1 : 1);
        if (list[i]) app.navigate('write', false, [list[i].id]); return true;
      }
      if (e.altKey && k.toLowerCase() === 'n') { Pages.write.actions.add(app); return true; }
      if (e.altKey && k.toLowerCase() === 'c') { Pages.write.actions.companion(app); return true; }
      if (e.altKey && k.toLowerCase() === 'p') { Pages.write.actions.prepub(app); return true; }
      if (e.altKey && k.toLowerCase() === 'm') { Pages.write.actions.notes(app); return true; }
      if (mod && e.shiftKey && k.toLowerCase() === 'h') { Pages.write.actions.search(app); return true; }
      if (mod && !e.shiftKey && k.toLowerCase() === 'j') { aiWrite(app); return true; }
      if (mod && k === '.') { Pages.write.actions.panel(app); return true; }
      return false;
    },
    actions: {
      nnAdd: app => { const el = document.querySelector('.nn-card'); if (!el) return; const name = el.dataset.name, type = (el.querySelector('#nn-type') || {}).value || 'PERSON';
        const c = current(app, app.route.params); app.project.addEntity({ name, type, summary:c ? '第 ' + app.project.chapterNo(c.id) + ' 章初次出场' : '' }); el.remove();
        const panel = document.getElementById('check-panel'); if (panel && c) panel.innerHTML = checkHtml(app, app.project.chapter(c.id));
        UI.toast('已把「' + name + '」加入设定库，之后会自动统计出场'); },
      nnLater: () => { const el = document.querySelector('.nn-card'); if (el) { nnLater.add(el.dataset.name); el.remove(); } },
      nnIgnore: app => { const el = document.querySelector('.nn-card'); if (!el) return; const l = nnIgnored(app); l.push(el.dataset.name); try { localStorage.setItem(nnKey(app), JSON.stringify(l.slice(-300))); } catch (e) {} el.remove(); UI.toast('「' + el.dataset.name + '」以后不再提示'); },
      companion: app => {
        const t = document.getElementById('ch-text'), id = t && t.dataset.id;
        if (cp.on) { cpSet(false, id); return UI.toast('陪写已关闭'); }
        return cpConsent().then(ok => { if (!ok) return; if (t) cp.since[id] = t.value.length; cpSet(true, id); UI.toast('陪写已打开：停笔 6 秒后给你一句'); });
      },
      companionOff: () => { const t = document.getElementById('ch-text'); cpSet(false, t && t.dataset.id); UI.toast('陪写已关闭'); },
      expect: (app, el) => { const c = current(app, app.route.params); if (!c) return; app.project.updateChapter(c.id, { expect:c.expect === el.dataset.m ? '' : el.dataset.m }); const panel = document.getElementById('check-panel'); if (panel) panel.innerHTML = checkHtml(app, app.project.chapter(c.id)); },
      canonOk: (app, el, all) => { const P = app.project, c = current(app, app.route.params); if (!c) return; const q = root.QZCraft.canonQueue(P, c.id), list = all ? q.filter(x => x.conf === 'high' && (x.kind === 'new' || x.kind === 'state')) : q.filter(x => x.key === el.dataset.k); let n = 0;
        list.forEach(x => { if (x.kind === 'new') { const e = P.addEntity({ name:x.name, type:x.type, summary:'第 ' + P.chapterNo(c.id) + ' 章首次出现：' + x.sample }); n++; }
          else if (x.kind === 'typo') { P.snapshot(c.id, '修正名字空格前'); P.updateChapter(c.id, { text:P.chapter(c.id).text.split(x.bad).join(x.name), silent:true }); n++; }
          else if (x.kind === 'state') { P.addProgress(x.id, { chapterId:c.id, text:x.sample, dead:x.sub === 'dead', kind:x.sub === 'power' || x.sub === 'res' ? x.sub : undefined }); n++; } P.canonMark(x.key, 'accept'); });
        app.renderPage(); UI.toast('已处理 ' + n + ' 条'); },
      canonAll: app => Pages.write.actions.canonOk(app, null, true),
      alAdd: (app, el) => { const P = app.project, n = (P.data.nodes || []).find(x => x.name === el.dataset.to); if (!n) return; const snap = P.checkpoint(); P.updateEntity(n.id, { aliases:(n.aliases ? n.aliases + '、' : '') + el.dataset.n }); app.renderPage(); UI.undoToast('已把「' + el.dataset.n + '」记为「' + n.name + '」的别名', () => { P.rollback(snap); app.renderPage(); }); },
      alFix: (app, el) => {
        const P = app.project, op = { from:el.dataset.n, to:el.dataset.to }, ctx = aliasCtx(app), chs = P.chapters().map((x, i) => ({ id:x.id, no:i + 1, title:x.title, text:x.text }));
        const pv = root.QZCraft.aliasPreview(chs, op, ctx); if (pv.refused) return UI.toast(pv.refused); if (!pv.count) return UI.toast('没有可替换的地方');
        const snap = P.checkpoint(); pv.groups.forEach(g => { const ch = chs.find(x => x.id === g.id); P.updateChapter(g.id, { text:root.QZCraft.aliasReplace(ch.text, op, ctx).text }); });
        app.renderPage(); UI.undoToast('已把 ' + pv.groups.length + ' 章里的 ' + pv.count + ' 处「' + op.from + '」改成「' + op.to + '」', () => { P.rollback(snap); app.renderPage(); }, 10000);
      },
      alIntend: (app, el) => { const P = app.project, k = 'al:' + el.dataset.n, snap = P.checkpoint(); P.canonMark(k, 'intended', ''); app.renderPage(); UI.undoToast('已记为故意这样写，不再提醒', () => { P.rollback(snap); app.renderPage(); }); },
      canonNo: (app, el) => { app.project.canonMark(el.dataset.k, 'ignore'); app.renderPage(); },
      canonTemp: (app, el) => { app.project.canonMark(el.dataset.k, 'temp', '本章临时'); app.renderPage(); UI.toast('记为本章临时事实，不写进设定'); },
      canonIntend: (app, el, all) => { /* 一键生效，不弹窗；备注在提示条里可选填；可批量；可撤销 */
        const c = current(app, app.route.params), keys = all && c ? root.QZCraft.canonQueue(app.project, c.id).filter(x => x.kind === 'conflict').map(x => x.key) : [el.dataset.k];
        keys.forEach(k => app.project.canonMark(k, 'intended', '')); app.renderPage();
        const t = UI.undoToast(keys.length > 1 ? '已把 ' + keys.length + ' 条冲突记为故意这样写' : '已记为故意这样写，不再提醒', () => { keys.forEach(k => app.project.canonUnmark(k)); app.renderPage(); });
        if (t && keys.length === 1) { const i = document.createElement('input'); i.className = 'input sm toast-note'; i.placeholder = '备注（可不填，回车保存）'; i.onkeydown = e => { if (e.key === 'Enter') { app.project.canonNote(keys[0], i.value); i.replaceWith(document.createTextNode('· 已记备注')); } }; t.insertBefore(i, t.lastChild); } },
      canonIntendAll: app => Pages.write.actions.canonIntend(app, null, true),
      canonSrc: (app, el) => { const c = app.project.chapters()[+el.dataset.no - 1]; if (c) app.navigate('write', false, [c.id]); },
      snap: app => { const c = current(app, app.route.params); if (!c) return; app.project.snapshot(c.id, '手动保存的版本'); UI.toast('已存一个版本，可在「历史稿」里找回'); },
      relief: () => root.QZRelief && root.QZRelief.open('paper'),
      summon: app => { const c = current(app, app.route.params), t = document.getElementById('ch-text'); const el = document.getElementById('stuck'); if (el) el.remove(); if (!c || !t) return;
        (cp.on ? Promise.resolve(true) : cpConsent()).then(ok => { if (!ok) return; cpSet(true); cp.since[c.id] = Math.max(0, t.value.length - 800); cpSpeak(app, c.id, t); if (!(cp.notes[c.id] || []).length) { (cp.notes[c.id] = []).push({ text:'先别管写得好不好——这一段谁最想要什么？让他马上去要。', ai:false, at:'' }); cpDraw(c.id); }  });},
      tearNever: () => { setPrefs({ tearOff:'never' }); UI.flash('不再提示撕废稿'); },
      stuckToday: () => { setPrefs({ stuckOff:today() }); const el = document.getElementById('stuck'); if (el) el.remove(); UI.flash('今天不再提示卡文'); },
      stuckNo: app => { const c = current(app, app.route.params); if (c) stuck.no[c.id] = 1; const el = document.getElementById('stuck'); if (el) el.remove(); },
      anchor: app => { const c = current(app, app.route.params); if (!c) return; const l = (app.project.data.meta.styleAnchors || []).slice(), i = l.indexOf(c.id); if (i >= 0) l.splice(i, 1); else l.push(c.id); app.project.setStyleAnchors(l); UI.toast(i >= 0 ? '已取消锚点章' : '已把本章设为文风锚点（最多 5 章）'); const panel = document.getElementById('check-panel'); if (panel) panel.innerHTML = checkHtml(app, app.project.chapter(c.id)); },
      prepub: app => {
        const c = current(app, app.route.params); if (!c) return; const C = root.QZCraft;
        let plat = 'qidian'; try { plat = JSON.parse(localStorage.getItem('qianzhang:publish') || '{}').platform || plat; } catch (e) {}
        const q = C.quickCheck(app.project, c.id, plat, sensitiveExtra(app)), ic = { ok:'check', warn:'flag', danger:'x' };
        const body = '<div class="pp"><div class="pp-head ' + (q.bad ? 'danger' : q.warn ? 'warn' : 'ok') + '"><b>' + (q.bad ? q.bad + ' 项必须改' : q.warn ? '可以发，' + q.warn + ' 项建议看看' : '全部通过，可以发了') + '</b><span>' + esc(q.title) + ' · ' + q.words.toLocaleString() + ' 字 · 按' + esc(q.platform) + '排版</span></div>'
          + '<ul class="pp-list">' + q.items.map(x => '<li class="' + x.level + '" data-k="' + x.k + '"><i>' + icon(ic[x.level] || 'check') + '</i><b>' + esc(x.label) + '</b><span>' + esc(x.detail) + '</span></li>').join('') + '</ul>'
          + '<label class="pp-text"><span>可直接粘到作家后台的正文</span><textarea id="pp-text" readonly rows="6">' + esc(q.text) + '</textarea></label></div>';
        const copy = () => { const t = q.text; return (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => true, () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return ok; }); };
        UI.modal({ title:'发布前 30 秒自查', body, buttons:[{ label:'关闭', value:null }].concat(c.status === 'published' ? [] : [{ label:'只标为已发布', value:'force' }]).concat([{ label:'复制正文', value:'copy' }, { label:c.status === 'published' ? '复制（已发布）' : '复制并标为已发布', value:'mark', primary:!q.bad }]) }).then(v => {
          if (v === 'force') return Pages.write.actions.publish(app, null, true);
          if (!v) return;
          copy().then(ok => { if (v === 'mark' && c.status !== 'published') { app.project.updateChapter(c.id, { status:'published', publishAt:'' }); app.renderPage(); }
            UI.toast((ok ? '已复制「' + q.title + '」' : '浏览器不让访问剪贴板，可到「发布」页导出 txt') + (v === 'mark' && c.status === 'published' ? '，已标为已发布' : ''), ok ? '' : 'err'); });
        });
      },
      publish: (app, el, force) => { const c = current(app, app.route.params), on = c.status !== 'published';
        if (on && force !== true) { let plat = 'qidian'; try { plat = JSON.parse(localStorage.getItem('qianzhang:publish') || '{}').platform || plat; } catch (e) {} const q = root.QZCraft.quickCheck(app.project, c.id, plat, sensitiveExtra(app)); if (q && (q.bad || q.warn)) return Pages.write.actions.prepub(app); } app.project.updateChapter(c.id, { status:on ? 'published' : '' }); if (on && c.publishAt) app.project.updateChapter(c.id, { publishAt:'' }); app.renderPage(); },
      schedule: app => { const c = current(app, app.route.params);
        UI.prompt('计划发布日期', '格式 YYYY-MM-DD，留空表示取消', c.publishAt || root.QZCraft.addDays(root.QZCraft.dayKey(), 1)).then(v => { if (v == null) return;
          v = v.trim(); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return UI.toast('日期格式应为 2026-10-24', 'err');
          app.project.updateChapter(c.id, { publishAt:v }); app.renderPage(); }); },
      keys: () => UI.modal({ title:'快捷键', body:'<table class="keys">' + [['Ctrl + S', '立即保存'], ['Alt + ↑ / ↓', '上一章 / 下一章'], ['Alt + N', '新建章节'], ['Alt + M', '本章素材'], ['Ctrl + .', '打开 / 关闭体检'], ['Ctrl + Shift + F', '进入 / 退出小黑屋'], ['Esc', '退出小黑屋']].map(([a, b]) => '<tr><td><kbd>' + a + '</kbd></td><td>' + b + '</td></tr>').join('') + '</table>' }),
      focus: app => {
        if (app.focus) return exitFocus(app);
        UI.modal({ title:'进入小黑屋', body:'<p class="muted">全屏只留稿纸。设定时间或字数，开启「锁定」后没完成就很难离开。</p>'
          + '<div class="form-grid"><label class="field"><span>时长（分钟，0 表示不限）</span><input class="input" id="fx-min" type="number" min="0" value="' + (localStorage.getItem('qianzhang:focus-min') || 45) + '"></label>'
          + '<label class="field"><span>本次字数目标（0 表示不限）</span><input class="input" id="fx-goal" type="number" min="0" step="100" value="' + (localStorage.getItem('qianzhang:focus-goal') || 1000) + '"></label></div>'
          + '<label class="check"><input type="checkbox" id="fx-lock"> 锁定：没写够字数（或没到时间）就不能切换到其它页面</label>',
          buttons:[{ label:'取消', value:false }, { label:'关门开写', primary:true, value:w => ({ minutes:+w.querySelector('#fx-min').value || 0, goal:+w.querySelector('#fx-goal').value || 0, lock:w.querySelector('#fx-lock').checked }) }] })
          .then(o => { if (!o) return;
            localStorage.setItem('qianzhang:focus-min', o.minutes); localStorage.setItem('qianzhang:focus-goal', o.goal);
            const c = current(app, app.route.params);
            app.focus = Object.assign(o, { start:Date.now(), startWords:totalWords(app), chapterId:c && c.id });
            app.focus.timer = setInterval(() => hud(app), 1000);
            app.renderPage(); });
      },
      exitFocus: app => exitFocus(app),
      add: (app, el) => { const vol = el && el.dataset.vol || (current(app, app.route.params) || {}).volumeId, last = app.project.chapters().slice(-1)[0], pf = last && localStorage.getItem('qianzhang:prefill') !== 'off' ? root.QZCraft.nextPrefill(app.project, last.id) : null; const c = app.project.addChapter('', '', vol);
        if (pf && pf.lines.length > 2) { app.project.updateChapter(c.id, { outline:pf.outline }); setTimeout(() => UI.undoToast('已按你的规划预填本章细纲（' + (pf.lines.length - 2) + ' 条）', () => { app.project.updateChapter(c.id, { outline:'' }); app.renderPage(); }), 80); } app.navigate('write', true, [c.id]); { const t = document.getElementById('ch-text'); t && t.focus(); } /* 标题已预填（第 N 章），直接把光标放进正文；要改标题点一下即可，回车回到正文 */ },
      import: app => UI.pickFile('.txt,.md,text/plain').then(f => {
        if (!f) return; const made = app.project.importText(f.text, f.name.replace(/\.(txt|md)$/i, ''));
        UI.toast('已导入 ' + made.length + ' 章（导入不计入今日字数）'); if (made[0]) app.navigate('write', false, [made[0].id]);
      }),
      checkMore: (app, el) => { const d0 = el.closest('details'); if (d0) d0.open = !d0.open; setTimeout(() => { const d = el.closest('details'); try { localStorage.setItem('qianzhang:check-more', d && d.open ? 'open' : 'closed'); } catch (e) {} }, 0); },
      outline: app => { const d = document.querySelector('details.outline-box'); localStorage.setItem(OUTLINE, d && d.open ? 'off' : 'on'); app.renderPage(); const o = document.getElementById('ch-outline'); if (o && localStorage.getItem(OUTLINE) === 'on') o.focus(); }, /* 细纲默认收起，工具栏「细纲」展开/收起 */
      panel: app => { localStorage.setItem(PANEL, document.getElementById('check-panel') ? 'off' : 'on'); app.renderPage(); },
      locate: (app, el) => {
        const t = document.getElementById('ch-text'), i = +el.dataset.i, n = +el.dataset.len;
        t.focus(); t.setSelectionRange(i, i + n);
        // 稿纸会随内容长高，所以按字符位置比例估算滚动距离
        const main = document.querySelector('.editor'), frac = i / Math.max(1, t.value.length);
        const y = t.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop + t.scrollHeight * frac;
        main.scrollTo({ top:Math.max(0, y - main.clientHeight / 3), behavior:'smooth' });
      },
      foreshadow: app => { const c = current(app, app.route.params);
        UI.prompt('埋一个伏笔', '伏笔是什么？（例如：沈渡腕上的白铃）', '').then(t => { if (!t || !t.trim()) return;
          app.project.addForeshadow({ title:t, plantedIn:c.id }); UI.toast('已记入伏笔本，可在「大纲伏笔」里设定计划回收章'); }); },
      aiCheck: app => aiWrite(app, 'check'),
      aiWrite: app => aiWrite(app),
      unblock: app => aiWrite(app, 'idea'),
      up: app => { const c = current(app, app.route.params); app.project.moveChapter(c.id, -1); app.renderPage(); },
      down: app => { const c = current(app, app.route.params); app.project.moveChapter(c.id, 1); app.renderPage(); },
      template: app => {
        const p = app.project, mine = p.templates(), all = root.QZCraft.TEMPLATES.concat(mine.map(t => Object.assign({ mine:true, desc:'我的模板' }, t)));
        UI.modal({ title:'用模板新建章节', body:'<p class="muted small">模板会写进新章节的「细纲」，正文还是空的，照着细纲写就行。</p><div class="tpl-grid">' + all.map((t, i) => '<label class="tpl"><input type="radio" name="tpl" value="' + i + '"' + (i ? '' : ' checked') + '><span><b>' + esc(t.name) + (t.mine ? ' <button class="icon-btn sm tpl-del" data-del="' + esc(t.id) + '" title="删除这个模板">' + icon('trash') + '</button>' : '') + '</b><em>' + esc(t.desc || '') + '</em><pre>' + esc(t.outline) + '</pre></span></label>').join('') + '</div>',
          buttons:[{ label:'取消', value:false }, { label:'新建章节', primary:true, value:w => +((w.querySelector('input[name=tpl]:checked') || {}).value || 0) }],
          onOpen: w => w.addEventListener('click', e => { const d = e.target.closest('[data-del]'); if (!d) return; e.preventDefault(); p.removeTemplate(d.dataset.del); d.closest('.tpl').remove(); UI.toast('模板已删除'); }) })
          .then(i => { if (i === false || i == null) return; const t = all[i]; if (!t) return; const vol = (current(app, app.route.params) || {}).volumeId, c = p.addChapter('', '', vol);
            p.updateChapter(c.id, { outline:t.outline }); localStorage.setItem(OUTLINE, 'on'); app.navigate('write', false, [c.id]); setTimeout(() => { const x = document.getElementById('ch-title'); x && x.select(); }, 50); UI.toast('已按「' + t.name + '」新建章节'); });
      },
      saveTpl: app => { const c = current(app, app.route.params); if (!c || !String(c.outline || '').trim()) return UI.toast('本章细纲还是空的。先在「细纲」里写好结构，再存为模板', 'err');
        UI.prompt('存为模板', '给模板起个名字', c.title ? c.title + ' 的结构' : '我的模板').then(n => { if (n == null) return; app.project.addTemplate(n, c.outline); UI.toast('已存为模板，新建章节时可以选'); }); },
      paper: app => {
        const cur = paperPrefs(), opt = (k, list) => list.map(x => '<option value="' + x[0] + '"' + (String(cur[k]) === String(x[0]) ? ' selected' : '') + '>' + x[1] + '</option>').join('');
        UI.modal({ title:'字体与纸张', body:'<div class="form-grid"><label class="field"><span>字体</span><select class="select" id="pp-font">' + opt('font', [['serif', '宋体（默认）'], ['kai', '楷体'], ['sans', '黑体'], ['fangsong', '仿宋']]) + '</select></label>'
          + '<label class="field"><span>字号</span><select class="select" id="pp-size">' + opt('size', [[16, '16'], [17, '17'], [18, '18（默认）'], [20, '20'], [22, '22'], [24, '24']]) + '</select></label>'
          + '<label class="field"><span>行距</span><select class="select" id="pp-lh">' + opt('lh', [[1.7, '紧凑'], [2, '标准'], [2.3, '宽松']]) + '</select></label>'
          + '<label class="field"><span>纸张</span><select class="select" id="pp-paper">' + opt('paper', [['', '白纸'], ['green', '护眼绿'], ['parch', '羊皮纸'], ['ink', '墨夜']]) + '</select></label>'
          + '<label class="field"><span>版心宽度</span><select class="select" id="pp-w">' + opt('w', [[640, '窄'], [780, '标准'], [960, '宽']]) + '</select></label></div><p class="muted small">只影响这台电脑上的显示，不会改动正文。改动立即生效。</p>',
          buttons:[{ label:'恢复默认', value:'reset' }, { label:'完成', primary:true, value:true }],
          onOpen: w => w.addEventListener('change', () => { savePaper({ font:w.querySelector('#pp-font').value, size:+w.querySelector('#pp-size').value, lh:+w.querySelector('#pp-lh').value, paper:w.querySelector('#pp-paper').value, w:+w.querySelector('#pp-w').value }); }) })
          .then(v => { if (v === 'reset') { savePaper(null); UI.toast('已恢复默认排版'); } });
      },
      read: app => reader.on ? stopRead() : startRead(app),
      branches: app => branches(app),
      rules: app => { const p = app.project;
        UI.modal({ title:'设定规则', body:'<p class="muted small">每行一条：<b>词 范围：原因</b>。范围可写「第20章前」「第20章起」「第5-30章」，不写就是全书。多个词用 / 分开。体检和发布自查都会按规则检查。</p>'
          + '<textarea class="input mono" id="rl-text" rows="8" placeholder="长生诀 第20章前：这时还没人知道它的名字\n师兄/师弟：林舟只叫沈砚「沈兄」\n沈砚 第60章起：已经死了">' + esc(p.data.writing.rules || '') + '</textarea><p class="muted small" id="rl-n"></p>',
          buttons:[{ label:'取消', value:false }, { label:'保存', primary:true, value:w => w.querySelector('#rl-text').value }],
          onOpen: w => { const t = w.querySelector('#rl-text'), n = w.querySelector('#rl-n'), up = () => { const r = root.QZCraft.parseRules(t.value); n.textContent = r.length ? '识别出 ' + r.length + ' 条：' + r.slice(0, 4).map(x => '「' + x.words.join('/') + '」' + (x.to === Infinity ? (x.from > 1 ? x.from + '章起' : '全书') : x.from <= 1 ? (x.to + 1) + '章前' : x.from + '–' + x.to + '章')).join('，') + (r.length > 4 ? '……' : '') : ''; }; up(); t.addEventListener('input', up); } })
          .then(v => { if (typeof v === 'string') { p.setRules(v); app.renderPage(); UI.toast('设定规则已保存'); } }); },
      notes: app => { const c = current(app, app.route.params); if (!c || !Pages.notes) return;
        Pages.notes.chapterModal(app, c, t => { const ta = document.getElementById('ch-text'); if (!ta) return; const at = ta.selectionStart ?? ta.value.length; ta.setRangeText(t, at, ta.selectionEnd ?? at, 'end'); ta.dispatchEvent(new Event('input', { bubbles:true })); }).then(() => app.renderPage()); },
      history: app => {
        const p = app.project, c = current(app, app.route.params); if (!p.history(c.id).length) return UI.toast('本章还没有历史稿。写作时每隔 10 分钟会自动存一份');
        const list = () => p.history(c.id), fmt = at => new Date(at).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
        const diffHtml = h => { const d = root.QZCraft.diffParas(h.text, c.text), ch = d.filter(x => x.t !== '=');
          return ch.length ? '<p class="muted small">左边是这份历史稿，下面列出到现在为止的改动：<b class="add">绿色</b>是新增，<b class="del">红色</b>是删掉的。</p><div class="diff">' + d.map(x => x.t === '=' ? '' : '<p class="d' + (x.t === '+' ? 'add' : 'del') + '">' + esc(x.s) + '</p>').join('') + '</div>'
            : '<p class="muted small">这份和现在的正文一样。</p>'; };
        UI.modal({ title:'历史稿 · ' + c.title, body:'<div class="hist"><div class="hist-list">' + list().map((h, i) => '<button class="hist-item' + (i === 0 ? ' on' : '') + '" data-at="' + esc(h.at) + '"><b>' + fmt(h.at) + '</b><span class="muted small">' + esc(h.note || '') + ' · ' + words(h.text).toLocaleString() + ' 字</span></button>').join('')
            + '</div><div class="hist-view" id="hist-view"></div></div><p class="muted small">写作时每隔 10 分钟会自动存一份，替换、恢复前也会存。每章最多保留 15 份。</p>',
          buttons:[{ label:'关闭', value:false }, { label:'恢复到这一版', primary:true, value:w => (w.querySelector('.hist-item.on') || {}).dataset }],
          onOpen: w => { const show = at => { const h = list().find(x => x.at === at); w.querySelectorAll('.hist-item').forEach(b => b.classList.toggle('on', b.dataset.at === at)); w.querySelector('#hist-view').innerHTML = h ? diffHtml(h) : ''; };
            w.querySelector('.hist-list').addEventListener('click', e => { const b = e.target.closest('.hist-item'); if (b) show(b.dataset.at); });
            const first = list()[0]; if (first) show(first.at); } })
          .then(d => { if (!d || !d.at) return; p.restore(c.id, d.at); app.renderPage(); UI.toast('已恢复。恢复前的版本也存进了历史稿，可以随时换回来'); });
      },
      search: app => {
        const p = app.project;
        UI.modal({ title:'全书搜索替换', body:'<div class="sr-bar"><input class="input" id="sr-q" placeholder="要找的字词，如人名「林周」"><input class="input" id="sr-r" placeholder="替换成（可留空）"></div><div class="sr-list" id="sr-list"><p class="muted small pad">输入后会列出全书所有出现的位置，点一条可跳过去。</p></div>',
          buttons:[{ label:'关闭', value:false }, { label:'替换勾选的章', primary:true, value:w => ({ q:w.querySelector('#sr-q').value, r:w.querySelector('#sr-r').value, ids:[...w.querySelectorAll('.sr-ch:checked')].map(x => x.value), listed:!!w.querySelector('.sr-ch') }) }],
          onOpen: w => { const box = w.querySelector('#sr-list'), qi = w.querySelector('#sr-q'); let t;
            const ri = w.querySelector('#sr-r'); ri.addEventListener('input', () => qi.dispatchEvent(new Event('input')));
            qi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { const q = qi.value, rp = ri.value, hits = p.search(q, 300), seenCh = {};
              box.innerHTML = !q ? '<p class="muted small pad">输入后会列出全书所有出现的位置。</p>' : !hits.length ? '<p class="muted small pad">全书没有找到「' + esc(q) + '」。</p>'
                : (function () { const k = p.searchCount(q); return '<p class="muted small">共 ' + k.total.toLocaleString() + ' 处，分布在 ' + k.chapters + ' 章' + (k.total > hits.length ? '（下面列出前 ' + hits.length + ' 处）' : '') + '</p>'; })() + hits.map(h => (seenCh[h.chapterId] ? '' : (seenCh[h.chapterId] = 1, '<label class="sr-chh"><input type="checkbox" class="sr-ch" value="' + esc(h.chapterId) + '" checked> 第 ' + h.no + ' 章 ' + esc((p.chapter(h.chapterId) || {}).title || '') + '</label>')) + '<button class="sr-hit" data-id="' + esc(h.chapterId) + '" data-i="' + h.index + '" data-len="' + q.length + '"><span class="ch-no">' + h.no + '</span><span class="sr-ctx">…' + esc(h.before) + '<mark>' + esc(q) + '</mark>' + (rp ? '<ins>' + esc(rp) + '</ins>' : '') + esc(h.after) + '…</span></button>').join(''); }, 150); });
            box.addEventListener('click', e => { if (e.target.closest('.sr-chh')) return; const b = e.target.closest('.sr-hit'); if (!b) return; const d = Object.assign({}, b.dataset); w.querySelector('[data-v="__x"]').click();
              app.navigate('write', false, [d.id]); setTimeout(() => Pages.write.actions.locate(app, { dataset:d }), 80); }); } })
          .then(o => { if (!o || !o.q) return; const n = p.search(o.q, 1e6).length; if (!n) return UI.toast('全书没有找到「' + o.q + '」', 'err');
            const ids = o.listed ? o.ids : null; if (ids && !ids.length) return UI.toast('没有勾选章节'); /* 就在搜索框里看差异、勾章节，不再二次确认；完成后可撤销 */
            const old = {}; p.chapters().forEach(c => { if ((!ids || ids.includes(c.id)) && c.text.includes(o.q)) old[c.id] = c.text; });
            const k = p.replaceAll(o.q, o.r, ids); app.renderPage(); UI.undoToast('已替换 ' + k + ' 处（' + Object.keys(old).length + ' 章）', () => { Object.keys(old).forEach(id => p.updateChapter(id, { text:old[id] })); app.renderPage(); UI.toast('已撤销替换'); }); });
      },
      copy: app => { const c = current(app, app.route.params), txt = root.QZCraft.platformText([c], { title:false });
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject(new Error('浏览器不支持'))).then(() => UI.toast('已复制 ' + words(c.text).toLocaleString() + ' 字：段首缩进、段间空行，可直接粘贴到作家后台'))
          .catch(() => UI.download(c.title + '.txt', txt, 'text/plain;charset=utf-8')); },
      publishExport: app => {
        const p = app.project, vols = p.volumes();
        UI.modal({ title:'按平台格式导出', body:'<div class="form-grid"><label class="field wide"><span>范围</span><select class="select" id="ex-range"><option value="this">本章</option><option value="all">全书</option><option value="stock">只导出存稿（未发布章节）</option>'
          + vols.map(v => '<option value="v:' + esc(v.id) + '">' + esc(v.title) + '</option>').join('') + '</select></label></div>'
          + '<label class="check"><input type="checkbox" id="ex-indent" checked> 段首空两格（全角）</label><label class="check"><input type="checkbox" id="ex-blank" checked> 段与段之间空一行</label><label class="check"><input type="checkbox" id="ex-title" checked> 带章节标题</label>'
          + '<p class="muted small">起点、番茄、晋江等后台都接受这种排版。导出为一个 txt 文件。</p>',
          buttons:[{ label:'取消', value:false }, { label:'导出', primary:true, value:w => ({ range:w.querySelector('#ex-range').value, indent:w.querySelector('#ex-indent').checked, blank:w.querySelector('#ex-blank').checked, title:w.querySelector('#ex-title').checked }) }] })
          .then(o => { if (!o) return; const all = p.chapters(), c = current(app, app.route.params);
            let list = o.range === 'this' ? [c] : o.range === 'all' ? all : o.range === 'stock' ? all.filter(x => x.status !== 'published') : all.filter(x => x.volumeId === o.range.slice(2));
            list = list.filter(Boolean); if (!list.length) return UI.toast('这个范围里没有章节', 'err');
            UI.download((list.length === 1 ? list[0].title : p.title + (o.range === 'all' ? '' : '-' + list.length + '章')) + '.txt', root.QZCraft.platformText(list, o), 'text/plain;charset=utf-8');
            UI.toast('已导出 ' + list.length + ' 章'); }); },
      export: app => { const c = current(app, app.route.params); UI.download(c.title + '.txt', c.title + '\n\n' + c.text, 'text/plain;charset=utf-8'); },
      exportAll: app => UI.download(app.project.title + '.txt', app.project.chapters().map(c => c.title + '\n\n' + c.text).join('\n\n\n'), 'text/plain;charset=utf-8'),
      remove: app => { const c = current(app, app.route.params);
        { const no = app.project.chapterNo(c.id), id = c.id; app.project.removeChapter(id); app.navigate('write', true); UI.undoToast('已删除第 ' + no + ' 章「' + c.title + '」· 设置 → 回收站 也能找回', () => { if (app.project.restoreChapter(id)) app.navigate('write', true, [id]); }); } }, /* 不再确认弹窗：直接删进章节回收站，8 秒内可撤销 */
    },
  };

  /* 字体与纸张：存在本机 localStorage，通过 CSS 变量作用在稿纸上 */
  const PAPER = 'qianzhang:paper', PAPER_DEF = { font:'serif', size:18, lh:2, paper:'', w:780 };
  function paperPrefs() { try { return Object.assign({}, PAPER_DEF, JSON.parse(localStorage.getItem(PAPER) || '{}')); } catch (e) { return Object.assign({}, PAPER_DEF); } }
  function applyPaper() { if (typeof document === 'undefined') return; const p = paperPrefs(), b = document.body; if (!b) return;
    b.style.setProperty('--ed-size', p.size + 'px'); b.style.setProperty('--ed-lh', p.lh); b.style.setProperty('--ed-w', p.w + 'px'); b.dataset.edFont = p.font; b.dataset.paper = p.paper || ''; }
  function savePaper(p) { if (p) localStorage.setItem(PAPER, JSON.stringify(p)); else localStorage.removeItem(PAPER); applyPaper(); }
  Pages.write_applyPaper = applyPaper;

  /* 朗读校对：用浏览器自带的语音，从光标所在段落开始逐段朗读并选中当前段，耳朵比眼睛更容易听出别扭句子。 */
  const reader = { on:false, timer:null };
  function stopRead() { reader.on = false; try { root.speechSynthesis && root.speechSynthesis.cancel(); } catch (e) {} const b = document.querySelector('[data-act="write.read"]'); if (b) { b.classList.remove('on'); b.lastChild.textContent = '朗读'; } }
  function startRead(app) {
    const t = document.getElementById('ch-text'), S = root.speechSynthesis;
    if (!S || !root.SpeechSynthesisUtterance) return UI.toast('这个浏览器不支持朗读，换 Chrome 或 Edge 试试', 'err');
    if (!t || !t.value.trim()) return UI.toast('本章还没有内容');
    const paras = []; t.value.replace(/[^\n]+/g, (m, i) => { if (m.trim()) paras.push({ i, s:m }); });
    let k = paras.findIndex(x => x.i + x.s.length >= t.selectionStart); if (k < 0) k = 0;
    const voice = (S.getVoices() || []).find(v => /zh/i.test(v.lang));
    reader.on = true; const b = document.querySelector('[data-act="write.read"]'); if (b) { b.classList.add('on'); b.lastChild.textContent = '停止朗读'; }
    const next = () => { if (!reader.on || !document.body.contains(t)) return stopRead(); const x = paras[k++]; if (!x) { stopRead(); return UI.toast('本章读完了'); }
      t.setSelectionRange(x.i, x.i + x.s.length); Pages.write.actions.locate(app, { dataset:{ i:x.i, len:x.s.length } }); t.blur();
      const u = new root.SpeechSynthesisUtterance(x.s); u.lang = 'zh-CN'; if (voice) u.voice = voice; u.rate = +(localStorage.getItem('qianzhang:read-rate') || 1.1); u.onend = next; u.onerror = () => stopRead(); S.speak(u); };
    S.cancel(); next();
  }

  /* 输入 @ 快速插入设定名：@ 后面接名字的开头或拼音不行，就按包含匹配；↑↓ 选，回车或 Tab 插入，Esc 关闭。 */
  function mention(app, t) {
    let box = null, items = [], sel = 0, start = -1;
    const close = () => { if (box) box.remove(); box = null; start = -1; };
    const pick = i => { const n = items[i]; if (!n) return close(); const a = t.value.slice(0, start), b = t.value.slice(t.selectionStart);
      t.value = a + n.name + b; const pos = a.length + n.name.length; t.setSelectionRange(pos, pos); close(); t.dispatchEvent(new Event('input')); };
    const draw = () => { if (!box) { box = document.createElement('div'); box.className = 'mention-pop'; document.body.appendChild(box);
        box.addEventListener('mousedown', e => { const x = e.target.closest('[data-k]'); if (x) { e.preventDefault(); pick(+x.dataset.k); } }); }
      const r = t.getBoundingClientRect(); box.style.left = Math.round(r.left + r.width / 2 - 150) + 'px';
      box.innerHTML = '<div class="mp-head">插入设定 <span class="muted">↑↓ 选择 · 回车插入 · Esc 关闭</span></div>' + (items.length ? items.map((n, i) => '<button class="mp-item' + (i === sel ? ' on' : '') + '" data-k="' + i + '">' + UI.avatar(n.name, 'xs') + '<b>' + esc(n.name) + '</b><span class="muted small">' + esc((n.summary || '').slice(0, 24)) + '</span></button>').join('') : '<p class="muted small pad">没有匹配的设定</p>'); };
    t.addEventListener('input', () => {
      const pos = t.selectionStart, before = t.value.slice(Math.max(0, pos - 12), pos), m = before.match(/[@＠]([^\s@＠，。！？、“”]{0,8})$/);
      if (!m) return close();
      start = pos - m[0].length; const q = m[1];
      items = app.project.data.nodes.filter(n => !q || n.name.includes(q) || String(n.aliases || '').includes(q)).sort((a, b) => (b.name.startsWith(q) ? 1 : 0) - (a.name.startsWith(q) ? 1 : 0)).slice(0, 8);
      sel = 0; draw();
    });
    t.addEventListener('keydown', e => { if (!box) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length); draw(); }
      else if ((e.key === 'Enter' || e.key === 'Tab') && items.length) { e.preventDefault(); e.stopPropagation(); pick(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }, true);
    t.addEventListener('blur', () => setTimeout(close, 120));
  }

  function totalWords(app) { return app.project.chapters().reduce((s, c) => s + words(c.text), 0); }
  function hud(app) {
    const f = app.focus, el = document.getElementById('focus-hud'); if (!f) return;
    const t = document.getElementById('ch-text'), base = f.base || (f.base = { id:t && t.dataset.id, other:totalWords(app) - (t ? words(t.value) : 0) });
    const now = t && t.dataset.id === base.id ? base.other + words(t.value) : totalWords(app);
    const st = root.QZCraft.focusState(f, Date.now(), now);
    if (st.done && !f.doneShown) { f.doneShown = true; UI.toast('小黑屋任务完成！本次写了 ' + st.wrote.toLocaleString() + ' 字 🎉'); }
    if (!el) return;
    el.className = 'focus-hud' + (st.done ? ' done' : '');
    el.innerHTML = '<span>' + icon('fire') + '小黑屋</span>'
      + (f.minutes ? '<b>' + (st.timeDone ? '时间到' : root.QZCraft.mmss(st.left)) + '</b>' : '')
      + '<span>本次 <b>' + st.wrote.toLocaleString() + '</b>' + (f.goal ? ' / ' + f.goal.toLocaleString() : '') + ' 字</span>'
      + (f.goal ? '<span class="bar"><i style="width:' + Math.min(100, st.wrote / f.goal * 100).toFixed(1) + '%"></i></span>' : '')
      + '<button class="btn sm ' + (st.locked ? 'ghost' : 'primary') + '" data-act="write.exitFocus">' + (st.locked ? '🔒 离开' : '出关') + '</button>';
  }
  function focusLocked(app) {
    const f = app.focus; if (!f) return false;
    const t = document.getElementById('ch-text'), base = f.base;
    const now = base && t && t.dataset.id === base.id ? base.other + words(t.value) : totalWords(app);
    return root.QZCraft.focusState(f, Date.now(), now).locked;
  }
  function exitFocus(app) {
    if (!app.focus) return;
    const leave = () => { if (app.focus) clearInterval(app.focus.timer); app.focus = null; document.body.classList.remove('focus-mode'); app.renderPage(); };
    if (!focusLocked(app)) return leave();
    lockBar(app, leave);
  }
  /** 锁定中想离开：不弹窗、不报错，HUD 下方一行「还差 X 字 · 仍要离开」 */
  function lockBar(app, go) {
    const f = app.focus; if (!f) return go(); const t = document.getElementById('ch-text'), base = f.base;
    const now = base && t && t.dataset.id === base.id ? base.other + words(t.value) : totalWords(app), st = root.QZCraft.focusState(f, Date.now(), now);
    const need = f.goal ? '还差 ' + Math.max(0, f.goal - st.wrote).toLocaleString() + ' 字' : '还剩 ' + root.QZCraft.mmss(st.left);
    let el = document.getElementById('lock-bar'); if (!el) { el = document.createElement('div'); el.id = 'lock-bar'; el.className = 'lock-bar'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = '<span>' + need + '</span> · <button type="button" class="linkish">仍要离开</button>';
    el.querySelector('button').onclick = () => { el.remove(); if (app.focus) app.focus.lock = false; go(); };
    clearTimeout(lockBar.t); lockBar.t = setTimeout(() => el.remove(), 6000); if (t) t.focus({ preventScroll:true });
  }
  Pages.write.lockBar = lockBar;
  Pages.write.focusLocked = focusLocked;

  /** AI 续写/润色：作者选模式、长度、禁区；草稿可编辑，点「放进正文」才写入（写入前自动存历史稿）。 */
  const AI_EXTRA = { check:'检查本章', idea:'卡文思路' };
  function aiWrite(app, startMode) {
    if (!root.QZAI.ready(root.QZAI.loadSettings())) return aiRun(app, null, 'AI 助手'); // 没连模型：只提示，不发送
    const C = root.QZCraft, c = current(app, app.route.params), t = document.getElementById('ch-text'); if (!c || !t) return;
    const a = t.selectionStart, b = t.selectionEnd, sel = t.value.slice(a, b), AI = root.QZAI, s = AI.loadSettings(), ready = AI.ready(s);
    const pref = JSON.parse(localStorage.getItem('qianzhang:ai-write') || '{}'), mode0 = sel ? (pref.selMode || 'polish') : 'continue';
    const modes = Object.keys(C.WRITE_MODES).map(k => '<label class="seg-opt"><input type="radio" name="aw-mode" value="' + k + '"' + (k === mode0 ? ' checked' : '') + ((k !== 'continue' && !sel) ? ' disabled' : '') + '><span>' + C.WRITE_MODES[k] + '</span></label>').join('') + '<i class="aw-sep"></i>' + Object.keys(AI_EXTRA).map(k => '<label class="seg-opt"><input type="radio" name="aw-mode" value="' + k + '"' + (k === mode0 ? ' checked' : '') + '><span>' + AI_EXTRA[k] + '</span></label>').join('');
    const keeps = Object.keys(C.KEEPS).map(k => '<label class="chk"><input type="checkbox" value="' + k + '"' + ((pref.keep || ['voice', 'cast']).includes(k) ? ' checked' : '') + '> ' + C.KEEPS[k] + '</label>').join('');
    let ctl = null;
    UI.modal({ title:'AI 助手', body:'<div class="aw' + (AI_EXTRA[mode0] ? ' read' : '') + '">'
      + '<div class="aw-seg">' + modes + '</div><p class="muted small aw-hint">' + (sel ? '已选中 ' + Array.from(sel).length + ' 字，润色/扩写只处理选中部分。' : '续写从光标处往下接。想润色或扩写，先在正文里选中一段。') + '</p>'
      + '<label class="field aw-len"><span>长度 <em id="aw-n">' + (pref.len || 500) + '</em> 字</span><input type="range" id="aw-len" min="100" max="2000" step="100" value="' + (pref.len || 500) + '"></label>'
      + '<div class="aw-keeps">' + keeps + '</div><input class="input" id="aw-note" placeholder="这段想写什么？例：主角假装认输，暗中布局（可不填）">'
      + '<div class="row"><button class="btn primary sm" id="aw-go"' + (ready ? '' : ' disabled') + '>' + icon('sparkle') + '生成草稿</button>' + (ready ? '' : '<span class="muted small">未连接模型，不会发送任何内容。<a href="#/settings">去连接</a></span>') + '</div>'
      + '<textarea class="input aw-out" id="aw-out" rows="8" placeholder="草稿会出现在这里，可以先改再放进正文。"></textarea></div>',
      buttons:[{ label:'取消', value:null }, { label:'放进正文', primary:true, value:w => ({ text:w.querySelector('#aw-out').value, mode:(w.querySelector('[name=aw-mode]:checked') || {}).value }) }],
      onOpen: w => {
        const len = w.querySelector('#aw-len'); len.addEventListener('input', () => { w.querySelector('#aw-n').textContent = len.value; });
        const okBtn = [...w.querySelectorAll('.modal-foot .btn')].pop(), sync = () => { const m = w.querySelector('[name=aw-mode]:checked').value, r = !!AI_EXTRA[m]; w.querySelector('.aw').classList.toggle('read', r); okBtn.disabled = r; okBtn.title = r ? '检查和思路只供参考，不会写进正文' : ''; w.querySelector('#aw-out').readOnly = r; };
        w.querySelectorAll('[name=aw-mode]').forEach(x => x.addEventListener('change', sync)); sync();
        w.querySelector('#aw-go').addEventListener('click', () => {
          const mode = w.querySelector('[name=aw-mode]:checked').value, keep = [...w.querySelectorAll('.aw-keeps input:checked')].map(x => x.value), out = w.querySelector('#aw-out'), go = w.querySelector('#aw-go');
          localStorage.setItem('qianzhang:ai-write', JSON.stringify({ len:+len.value, keep, selMode:mode !== 'continue' ? mode : pref.selMode }));
          if (ctl) ctl.abort(); ctl = new AbortController(); out.value = ''; go.disabled = true; go.lastChild.textContent = '生成中…';
          const msgs = mode === 'check' ? C.checkMessages(app.project, c.id) : mode === 'idea' ? C.unblockMessages(app.project, c.id).map((m, i) => i === 1 && w.querySelector('#aw-note').value ? Object.assign({}, m, { content:m.content + '\n【作者的想法】' + w.querySelector('#aw-note').value }) : m) : null;
          AI.complete(s, msgs || C.writeMessages(app.project, c.id, { mode, len:+len.value, keep, note:w.querySelector('#aw-note').value, sel, before:t.value.slice(0, mode === 'continue' ? b : a) }), { signal:ctl.signal, onDelta:(d, full) => { out.value = full; out.scrollTop = out.scrollHeight; } })
            .catch(e => { if (e.name !== 'AbortError') UI.toast(e.message, 'err'); }).then(() => { go.disabled = false; go.lastChild.textContent = '重新生成'; });
        });
      } }).then(v => {
      if (ctl) ctl.abort();
      if (!v || !String(v.text || '').trim()) return;
      const txt = v.text.trim(), now = t.value;
      const next = v.mode === 'continue' ? now.slice(0, b) + (b && !/\n$/.test(now.slice(0, b)) ? '\n' : '') + txt + now.slice(b) : now.slice(0, a) + txt + now.slice(b);
      app.project.snapshot(c.id, 'AI 写入前'); app.project.updateChapter(c.id, { text:next }); app.renderPage(); UI.toast('已放进正文。不满意可在「历史稿」里找回原文');
    });
  }
  Pages.write.aiWrite = aiWrite;

  /** 情节分支：同一章并排存几种写法，随时把某一版换成正文（原正文自动变成一个分支，不丢）。 */
  function branches(app) {
    const p = app.project, c = current(app, app.route.params); if (!c) return;
    const draw = w => {
      const list = p.branches(c.id), on = (w.querySelector('.hist-item.on') || {}).dataset;
      const sel = list.find(b => on && b.id === on.id) || list[0];
      w.querySelector('.hist-list').innerHTML = '<div class="br-cur"><b>正文' + (c.activeBranch ? ' · ' + esc(c.activeBranch) : '') + '</b><span class="muted small">' + words(c.text).toLocaleString() + ' 字 · 当前使用</span></div>'
        + (list.length ? list.map(b => '<button class="hist-item' + (sel && b.id === sel.id ? ' on' : '') + '" data-id="' + esc(b.id) + '"><b>' + esc(b.name) + '</b><span class="muted small">' + words(b.text).toLocaleString() + ' 字</span></button>').join('') : '<p class="muted small br-none">还没有分支。</p>');
      const d = sel ? root.QZCraft.diffParas(c.text, sel.text).filter(x => x.t !== '=') : [];
      w.querySelector('#hist-view').innerHTML = sel ? '<div class="br-tools"><button class="btn sm primary" data-b="use">用这版当正文</button><button class="btn sm" data-b="rename">改名</button><button class="btn sm ghost danger" data-b="del">删除</button></div>'
        + (d.length ? '<p class="muted small">和正文相比：<b class="add">绿色</b>是这个分支多出来的，<b class="del">红色</b>是正文里有、分支里没有的。</p><div class="diff">' + d.map(x => '<p class="d' + (x.t === '+' ? 'add' : 'del') + '">' + esc(x.s) + '</p>').join('') + '</div>' : '<p class="muted small">和正文一样。可以回到正文改一改，再来对比。</p>')
        : '<div class="br-empty">' + icon('share') + '<p>想试另一种写法又舍不得现在这版？<br>先「另存为分支」，然后放心改正文；改坏了随时换回来。</p></div>';
    };
    UI.modal({ title:'情节分支 · ' + c.title, body:'<div class="br-add"><input class="input sm" id="br-name" placeholder="分支名，例：方案B · 主角没救她"><button class="btn sm primary" id="br-save">' + icon('plus') + '把当前正文另存为分支</button></div><div class="hist"><div class="hist-list"></div><div class="hist-view" id="hist-view"></div></div>',
      buttons:[{ label:'关闭', value:true }],
      onOpen: w => {
        draw(w);
        w.querySelector('#br-save').addEventListener('click', () => { const n = w.querySelector('#br-name'); p.addBranch(c.id, n.value); n.value = ''; draw(w); UI.toast('已另存为分支，现在可以放心改正文'); });
        w.querySelector('.hist-list').addEventListener('click', e => { const b = e.target.closest('.hist-item'); if (!b) return; w.querySelectorAll('.hist-item').forEach(x => x.classList.toggle('on', x === b)); draw(w); });
        w.querySelector('#hist-view').addEventListener('click', e => {
          const k = e.target.closest('[data-b]'), on = w.querySelector('.hist-item.on'); if (!k || !on) return; const id = on.dataset.id, b = p.branches(c.id).find(x => x.id === id);
          if (k.dataset.b === 'use') { p.switchBranch(c.id, id, c.activeBranch || '原稿'); draw(w); app.renderPage(); UI.toast('「' + c.activeBranch + '」已换成正文，原来的正文存成了分支'); }
          if (k.dataset.b === 'rename') { const inp = w.querySelector('#br-name'); if (!inp.value.trim()) { inp.focus(); return UI.toast('先在上面的输入框写新名字，再点改名'); } p.renameBranch(c.id, id, inp.value); inp.value = ''; draw(w); }
          if (k.dataset.b === 'del') { if (k.dataset.sure) { p.removeBranch(c.id, id); draw(w); UI.toast('已删除「' + b.name + '」'); } else { k.dataset.sure = '1'; k.textContent = '再点一次确认删除'; } }
        });
      } }).then(() => app.renderPage());
  }

  /** 有模型就流式显示在弹窗里；没有就友好提示，不发送任何内容。 */
  function aiRun(app, messages, title) {
    const AI = root.QZAI, s = AI.loadSettings();
    if (!AI.ready(s)) {
      return UI.modal({ title, body:'<p>这个功能需要连接 AI 模型（DeepSeek、OpenAI 或本机 Ollama 都可以）。</p><p class="muted">不连模型也能用：右侧「体检」里的出场人物、疑似错名、敏感词、口头禅检查都在本机完成。</p>',
        buttons:[{ label:'以后再说', value:false }, { label:'去连接模型', primary:true, value:'go' }] }).then(v => { if (v === 'go') app.navigate('settings'); });
    }
    let out;
    UI.modal({ title, body:'<div class="ai-out" id="ai-out"><span class="typing"><i></i><i></i><i></i></span></div>', buttons:[{ label:'关闭', value:true }] });
    out = document.getElementById('ai-out');
    return AI.complete(s, messages, { onDelta:(d, full) => { if (out) out.innerHTML = Pages.chat ? Pages.chat.format(full) : esc(full); } })
      .catch(e => { if (out) { out.classList.add('error'); out.textContent = e.message; } });
  }
}(typeof self !== 'undefined' ? self : globalThis));
