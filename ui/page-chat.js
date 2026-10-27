/*! 千章 · ui/page-chat.js · 角色聊天：角色列表 + 气泡对话 */
(function (root) {
  'use strict';
  const UI = root.QZUI, { esc, icon } = UI;
  const Pages = root.QZPages = root.QZPages || {};
  let pending = null; // 正在生成的请求 { controller, characterId }

  function candidates(app) {
    const nodes = app.project.data.nodes.filter(n => n.type === 'PERSON');
    return nodes.length ? nodes : app.project.data.nodes.filter(n => n.type !== 'RULE');
  }
  /** 极简排版：段落、换行，括号里的动作变斜体。 */
  function format(text) {
    return esc(text).split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>').replace(/（([^）]{1,80})）|\(([^)]{1,80})\)/g, (m) => '<em>' + m + '</em>') + '</p>').join('');
  }
  function bubble(m, who) {
    const mine = m.role === 'user';
    return '<div class="msg ' + (mine ? 'me' : 'them') + (m.error ? ' error' : '') + '">' + (mine ? '' : UI.avatar(who, 'sm'))
      + '<div class="bubble">' + (m.pending && !m.text ? '<span class="typing"><i></i><i></i><i></i></span>' : format(m.text)) + '</div></div>';
  }

  Pages.chat = {
    label:'角色聊天', icon:'chat', format,
    render: function (app, params) {
      const p = app.project, list = candidates(app), cur = p.entity(params[0]) || null;
      const ready = root.QZAI.ready(root.QZAI.loadSettings());
      const side = '<aside class="chat-list"><div class="side-head"><h2>角色</h2></div>' + (list.length ? list.map(n => {
        const c = p.chat(n.id), last = c && c.messages[c.messages.length - 1];
        return '<a class="chat-item' + (cur && cur.id === n.id ? ' on' : '') + '" href="#/chat/' + encodeURIComponent(n.id) + '">' + UI.avatar(n.name) + '<span class="grow"><b>' + esc(n.name) + '</b><small>' + esc(last ? last.text.slice(0, 28) : (n.summary || '').slice(0, 28)) + '</small></span></a>';
      }).join('') : '<p class="muted pad">还没有人物。先到「角色与设定」建一个吧。</p>') + '</aside>';
      if (!cur) return '<div class="chat-layout">' + side + '<section class="empty-state"><span class="empty-icon">' + icon('chat') + '</span><h2>选一个角色开始聊天</h2><p>角色会依据 TA 的档案、人物关系和最近一章的剧情回应你。聊天记录不会改动正文。</p>'
        + (list.length ? '<a class="btn primary lg" href="#/chat/' + encodeURIComponent(list[0].id) + '">和「' + esc(list[0].name) + '」聊聊</a>' : '<a class="btn primary lg" href="#/library">去新建角色</a>') + '</section></div>';
      const msgs = (p.chat(cur.id) || { messages:[] }).messages;
      return '<div class="chat-layout">' + side + '<section class="conversation">'
        + '<header class="conv-head">' + UI.avatar(cur.name) + '<div class="grow"><b>' + esc(cur.name) + '</b><small>' + esc((cur.summary || '').slice(0, 60)) + '</small></div>'
        + '<a class="btn ghost sm" href="#/library/' + encodeURIComponent(cur.id) + '">查看档案</a><button class="btn ghost sm" data-act="chat.clear"' + (msgs.length ? '' : ' disabled') + '>清空</button></header>'
        + (ready ? '' : '<div class="banner">' + icon('sparkle') + '<span class="grow">还没有连接 AI 模型。连接后角色才能回复你。</span><a class="btn primary sm" href="#/settings">去连接</a></div>')
        + '<div class="messages" id="messages">' + (msgs.length ? msgs.map(m => bubble(m, cur.name)).join('') : '<div class="conv-hint">' + UI.avatar(cur.name, 'xl') + '<h3>' + esc(cur.name) + '</h3><p>' + esc(cur.summary || '向 TA 打个招呼吧') + '</p></div>') + '</div>'
        + '<form class="composer" id="composer"><textarea title="Enter 发送，Shift+Enter 换行" id="chat-input" rows="1" placeholder="对' + esc(cur.name) + '说点什么…"></textarea>'
        + '<button class="btn primary icon-only" id="send-btn" type="submit" title="发送">' + icon('send') + '</button></form></section></div>';
    },
    mount: function (app, params) {
      const box = document.getElementById('messages'), input = document.getElementById('chat-input'), form = document.getElementById('composer');
      if (!box) return;
      box.scrollTop = box.scrollHeight;
      const fit = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; };
      input.addEventListener('input', fit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', e => { e.preventDefault(); Pages.chat.send(app, params[0], input.value); });
      input.focus();
    },
    send: function (app, characterId, text) {
      text = String(text || '').trim(); if (!text || pending) return Promise.resolve();
      const p = app.project, who = p.entity(characterId).name;
      p.addMessage(characterId, 'user', text);
      const history = p.chat(characterId).messages.slice();
      app.renderPage();
      const box = document.getElementById('messages');
      const holder = document.createElement('div'); holder.innerHTML = bubble({ role:'assistant', text:'', pending:true }, who);
      const node = holder.firstChild; box.appendChild(node); box.scrollTop = box.scrollHeight;
      const target = node.querySelector('.bubble');
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      pending = { controller, characterId };
      document.getElementById('send-btn').disabled = true;
      let messages;
      try { messages = root.QZAI.buildMessages(p, characterId, history); } catch (e) { pending = null; return Promise.resolve(); }
      return root.QZAI.complete(root.QZAI.loadSettings(), messages, { signal:controller && controller.signal,
        onDelta: (d, full) => { target.innerHTML = format(full); box.scrollTop = box.scrollHeight; } })
        .then(full => { pending = null; p.addMessage(characterId, 'assistant', full || '……'); })
        .catch(e => { pending = null; node.classList.add('error'); target.textContent = e.message; UI.toast(e.message, 'err'); })
        .then(() => { if (app.route.page === 'chat' && app.route.params[0] === characterId && !node.classList.contains('error')) app.renderPage();
          const b = document.getElementById('send-btn'); if (b) b.disabled = false; });
    },
    actions: {
      clear: app => { const snap = app.project.checkpoint(); app.project.clearChat(app.route.params[0]); app.renderPage(); UI.undoToast('已清空对话', () => { app.project.rollback(snap); app.renderPage(); }); },
    },
  };
}(typeof self !== 'undefined' ? self : globalThis));
