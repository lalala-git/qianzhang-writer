/*! 千章 · ui/components.js · 通用小组件：图标、头像、弹窗、提示 */
(function (root) {
  'use strict';
  /* 设置迁移：旧版本的本机设置键复制为 qianzhang:*（只在新键不存在时复制，旧键保留不删）。 */
  try {
    const ls = root.localStorage;
    if (ls && !ls.getItem('qianzhang:migrated')) {
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.indexOf('canongraph:') === 0) { const nk = 'qianzhang:' + k.slice(11); if (ls.getItem(nk) == null) ls.setItem(nk, ls.getItem(k)); } }
      ls.setItem('qianzhang:migrated', '1');
    }
  } catch (e) { /* 隐私模式等情况下忽略 */ }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  const PATHS = {
    note:'<path d="M5 3h14v12l-6 6H5Z"/><path d="M13 21v-6h6M8.5 8h7M8.5 11.5h4"/>',
    pin:'<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3Z"/><path d="M12 14v7"/>',
    home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    book:'<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5Z"/><path d="M8 7h7M8 11h5"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .8 3.1 2.5 3.5 5.2"/>',
    chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', volume:'<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>', share:'<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8"/>', chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:'<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
    chevron:'<path d="m7 10 5 5 5-5"/>',
    more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', x:'<path d="M6 6l12 12M18 6 6 18"/>',
    download:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', upload:'<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    send:'<path d="M4 12 20 4l-5 16-3-7-8-1Z"/>', grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list:'<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>', link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    arrowUp:'<path d="M12 19V5M6 11l6-6 6 6"/>', arrowDown:'<path d="M12 5v14M6 13l6 6 6-6"/>', pen:'<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    map:'<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
    flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', fire:'<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9Z"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>', check:'<path d="m5 12 5 5 9-10"/>',
  };
  const icon = (name, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (PATHS[name] || '') + '</svg>';

  function hue(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) % 360; return h; }
  const initial = name => { const s = String(name || '?').replace(/[《》「」\s]/g, ''); return esc(Array.from(s)[0] || '?'); };
  const avatar = (name, size) => '<span class="avatar ' + (size || '') + '" style="--h:' + hue(name) + '">' + initial(name) + '</span>';

  /* ---------- 以下仅浏览器 ---------- */
  function toast(msg, kind) {
    const host = document.getElementById('toasts'); if (!host) return;
    [...host.children].forEach(x => { if (x.textContent === String(msg)) x.remove(); }); while (host.children.length > 2) host.firstChild.remove();
    const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; t.setAttribute('role', kind === 'err' ? 'alert' : 'status'); t.title = '点击关闭';
    const life = kind === 'err' ? 5000 : 2600; t.onclick = () => t.remove();
    host.appendChild(t); setTimeout(() => t.classList.add('out'), life); setTimeout(() => t.remove(), life + 400);
  }
  /** 带撤销的提示：默认 8 秒，点「撤销」执行 undo。删除类操作统一用它代替确认弹窗。 */
  function undoToast(msg, undo, ms) {
    const host = document.getElementById('toasts'); if (!host) return;
    const t = document.createElement('div'); t.className = 'toast undo'; t.setAttribute('role', 'status');
    t.innerHTML = '<span>' + esc(msg) + '</span><button class="toast-undo" type="button">撤销</button>';
    let done = false; const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 400); };
    t.querySelector('button').onclick = e => { e.stopPropagation(); if (done) return; done = true; kill(); try { undo && undo(); } catch (err) { toast(err.message, 'err'); } };
    host.appendChild(t); setTimeout(() => { done = true; kill(); }, ms || 8000); return t;
  }
  /** 状态栏闪一下（写作页的轻提示，不弹 toast） */
  function flash(msg) { const s = document.querySelector('.save-state,#save-state'); if (!s) return toast(msg); s.dataset.flash = msg; s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); setTimeout(() => { s.classList.remove('flash'); delete s.dataset.flash; }, 1600); }
  /** 弹窗。buttons: [{label, value, primary, danger}]，返回 Promise<value|null>；表单值可由 collect(el) 取。 */
  function modal(opts) {
    return new Promise(resolve => {
      document.querySelectorAll('details.menu[open]').forEach(d => d.removeAttribute('open')); // 弹窗不和菜单叠在一起
      const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
      wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>' + esc(opts.title) + '</h3><button class="icon-btn" data-v="__x" aria-label="关闭">' + icon('x') + '</button></div>'
        + '<div class="modal-body">' + (opts.body || '') + '</div><div class="modal-foot">'
        + (opts.buttons || [{ label:'确定', value:true, primary:true }]).map((b, i) => '<button class="btn ' + (b.primary ? 'primary' : b.danger ? 'danger' : '') + '" data-i="' + i + '">' + esc(b.label) + '</button>').join('') + '</div></div>';
      const btns = opts.buttons || [{ label:'确定', value:true, primary:true }];
      const prev = document.activeElement, caret = prev && prev.selectionStart != null ? [prev.selectionStart, prev.selectionEnd] : null; /* 关闭后焦点和光标回到原处 */
      const done = v => { wrap.classList.add('out'); if (prev && prev.focus && document.contains(prev)) setTimeout(() => { try { prev.focus({ preventScroll:true }); if (caret) prev.setSelectionRange(caret[0], caret[1]); } catch (e) {} }, 0); setTimeout(() => wrap.remove(), 150); document.removeEventListener('keydown', key); resolve(v); };
      const key = e => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && e.target.tagName === 'INPUT') { const p = btns.findIndex(b => b.primary); if (p >= 0) wrap.querySelector('[data-i="' + p + '"]').click(); } };
      wrap.addEventListener('click', e => {
        if (e.target === wrap || e.target.closest('[data-v="__x"]')) return done(null);
        const b = e.target.closest('[data-i]'); if (!b) return;
        const def = btns[+b.dataset.i];
        done(def.value === undefined ? true : (typeof def.value === 'function' ? def.value(wrap) : def.value));
      });
      document.addEventListener('keydown', key);
      document.body.appendChild(wrap);
      const f = wrap.querySelector('input,textarea,select'); if (!opts.passive) (f || wrap.querySelector('.btn.primary') || wrap).focus && setTimeout(() => { const x = f || wrap.querySelector('.btn.primary') || wrap.querySelector('.modal-foot .btn'); if (x) x.focus(); }, 30);
      if (opts.onOpen) opts.onOpen(wrap);
    });
  }
  const confirm = (title, text, okLabel) => modal({ title, body:'<p>' + esc(text) + '</p>',
    buttons:[{ label:'取消', value:false }, { label:okLabel || '确定', value:true, danger:true }] }).then(Boolean);
  const prompt = (title, label, value) => modal({ title,
    body:'<label class="field"><span>' + esc(label) + '</span><input class="input" id="m-prompt" value="' + esc(value || '') + '"></label>',
    buttons:[{ label:'取消', value:null }, { label:'确定', primary:true, value:w => w.querySelector('#m-prompt').value }] });
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type:type || 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function pickFile(accept) {
    return new Promise(resolve => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = accept || '';
      i.onchange = () => { const f = i.files && i.files[0]; if (!f) return resolve(null); const r = new FileReader();
        r.onload = () => resolve({ name:f.name, text:String(r.result) }); r.readAsText(f, 'utf-8'); };
      i.click();
    });
  }
  function relTime(iso) {
    if (!iso) return ''; const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return '刚刚'; if (d < 3600) return Math.floor(d / 60) + ' 分钟前'; if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
    if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前'; return new Date(iso).toLocaleDateString('zh-CN');
  }

  const UI = { esc, icon, avatar, hue, toast, undoToast, flash, modal, confirm, prompt, download, pickFile, relTime };
  root.QZUI = UI;
  if (typeof module === 'object' && module.exports) module.exports = UI;
}(typeof self !== 'undefined' ? self : globalThis));
