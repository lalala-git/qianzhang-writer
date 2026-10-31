/*! 千章 · ui/page-settings.js · 设置：码字与检查、模型连接、外观、备份 */
(function (root) {
  'use strict';
  const UI = root.QZUI, { esc, icon } = UI;
  const Pages = root.QZPages = root.QZPages || {};
  const AI = () => root.QZAI;
  const updateOff = () => { try { return localStorage.getItem('qianzhang:update-check') === 'off'; } catch (e) { return false; } };

  function readForm() {
    const v = id => document.getElementById(id).value.trim();
    /* 密钥输入框不回显已保存的密钥：留空 = 保持原样 */
    return { preset:v('m-preset'), baseUrl:v('m-url'), model:v('m-model'), apiKey:v('m-key') || AI().loadSettings().apiKey || '', temperature:+v('m-temp') || 0.8 };
  }
  function keyNote() {
    const s = AI().loadSettings(), k = AI().keyInfo(), how = k.protection === 'dpapi' ? 'Windows DPAPI' : k.protection ? 'AES-256-GCM' : '';
    if (!s.apiKey) return k.persistent ? '密钥会由本地服务加密保存在 data/app，不写进浏览器存储、作品或备份。' : '未连接本地服务：密钥只在本页内存里，关页后需要重新填写。';
    return k.persistent ? '已加密保存在本机（' + how + '）。输入框留空表示不修改。' : '密钥只在本页内存里（未连接本地服务），关页后需要重新填写。';
  }

  Pages.settings = {
    label:'设置', icon:'settings',
    render: function (app) {
      const s = AI().loadSettings();
      return '<header class="page-head"><div><h1>设置</h1><p class="muted">模型连接、外观与数据备份</p></div></header>'
        + '<section class="panel"><div class="panel-head"><div><h2>' + icon('sparkle') + ' AI 模型连接</h2><p class="muted">角色聊天、AI 责编和卡文助手需要一个 OpenAI 兼容接口；不连也能用其余全部功能。密钥由本地服务加密保存，不写进浏览器存储、作品文件或备份。</p></div>'
        + '<span class="pill ' + (AI().ready(s) ? 'ok' : '') + '">' + (AI().ready(s) ? '已配置' : '未配置') + '</span></div>'
        + '<div class="form-grid"><label class="field"><span>服务商</span><select class="select" id="m-preset">' + AI().PRESETS.map(p => '<option value="' + p.id + '"' + (p.id === s.preset ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label>'
        + '<label class="field"><span>模型</span><input class="input" id="m-model" value="' + esc(s.model) + '" placeholder="如 deepseek-chat"></label>'
        + '<label class="field wide"><span>接口地址</span><input class="input" id="m-url" value="' + esc(s.baseUrl) + '" placeholder="https://api.example.com/v1"></label>'
        + '<label class="field wide"><span>API 密钥</span><input class="input" id="m-key" type="password" value="" placeholder="' + (s.apiKey ? '••••••••（已保存）' : 'sk-…') + '" autocomplete="off"><small class="muted" id="m-key-note">' + esc(keyNote()) + '</small></label>'
        + '<label class="field"><span>创造性（0–1.5）</span><input class="input" id="m-temp" type="number" min="0" max="1.5" step="0.1" value="' + esc(s.temperature == null ? 0.8 : s.temperature) + '"></label></div>'
        + '<div class="row"><button class="btn primary" data-act="settings.save">保存</button><button class="btn" data-act="settings.test">测试连接</button>' + (s.apiKey ? '<button class="btn ghost" data-act="settings.clearKey">清除密钥</button>' : '') + '<span class="muted" id="m-result"></span></div></section>'
        + '<section class="panel"><div class="panel-head"><div><h2>' + icon('fire') + ' 码字与检查（本作品）</h2><p class="muted">每日目标用于首页进度环与连更日历；自定义敏感词会加入写作页「体检」。</p></div></div>'
        + '<div class="form-grid"><label class="field"><span>每日码字目标（字）</span><input class="input" id="w-goal" type="number" min="100" step="500" value="' + app.project.data.writing.goal + '"></label>'
        + '<label class="field"><span>每天更新章数（算存稿天数）</span><input class="input" id="w-perday" type="number" min="1" value="' + app.project.data.writing.perDay + '"></label>'
        + '<label class="field wide"><span>自定义敏感词 / 禁用词（用逗号或空格分隔）</span><textarea class="input" id="w-sens" rows="2" placeholder="例如：平台不让写的词、你想戒掉的口头禅">' + esc(app.project.data.writing.sensitive || '') + '</textarea></label></div>'
        + '<div class="row"><button class="btn primary" data-act="settings.writing">保存</button></div></section>'
        + (() => { const P = root.QZPages.write.prefs(), opt = (id, list, v) => '<select class="select" id="' + id + '">' + list.map(([k, l]) => '<option value="' + k + '"' + (String(k) === String(v) ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
          return '<section class="panel" id="nudge-prefs"><div class="panel-head"><div><h2>' + icon('clock') + ' 提醒与打扰（本机）</h2><p class="muted">写作时的提示都可以调慢或关掉。陪写默认关闭；打开后，连了模型会在停笔时把最近约 800 字发给模型。</p></div></div>'
            + '<div class="form-grid"><label class="field"><span>停笔多久提示卡文</span>' + opt('n-stuck', [[3, '3 分钟'], [5, '5 分钟'], [10, '10 分钟（默认）'], [20, '20 分钟'], [0, '不提示']], P.stuckOff === 'never' ? 0 : P.stuckMin) + '</label>'
            + '<label class="field"><span>陪写停笔多久回一句</span>' + opt('n-cp', [[6, '6 秒'], [30, '30 秒（默认）'], [120, '2 分钟']], P.cpSec) + '</label>'
            + '<label class="field"><span>半小时没动笔时提示「撕掉废稿」</span>' + opt('n-tear', [['', '提示（每天最多一次）'], ['never', '不再提示']], P.tearOff) + '</label></div>'
            + '<div class="row"><button class="btn primary" data-act="settings.nudges">保存</button></div></section>'; })()
        + (() => { const off = updateOff(), v = app.storage && app.storage.version;
          return '<section class="panel" id="update-prefs"><div class="panel-head"><div><h2>版本与更新</h2><p class="muted">千章启动后会向 GitHub 查一次有没有更新的版本；只发出这一个请求，不上传作品或个人信息。有新版本时侧栏里会出现一条小提示，点一下用浏览器打开下载页面。不会自动下载或替换程序。</p></div></div>'
            + (v ? '<p class="muted" style="margin:0 0 10px"><span>当前版本</span> <b>v' + esc(v) + '</b></p>' : '')
            + '<div class="row"><button class="btn" data-act="settings.updateNow">立即检查</button><button class="btn" data-act="settings.updateToggle">' + (off ? '开启新版本提醒' : '关闭新版本提醒') + '</button><span class="muted" id="u-result">' + (off ? '新版本提醒已关闭' : '') + '</span></div></section>'; })()
        + '<section class="panel"><div class="panel-head"><div><h2>外观</h2><p class="muted">选择浅色或深色界面，会记住你的选择。</p></div></div>'
        + '<div class="theme-pick"><button class="theme-opt' + (app.theme() === 'light' ? ' on' : '') + '" data-act="settings.theme" data-t="light"><span class="swatch light"></span>浅色</button>'
        + '<button class="theme-opt' + (app.theme() === 'dark' ? ' on' : '') + '" data-act="settings.theme" data-t="dark"><span class="swatch dark"></span>深色</button></div>' + '<p class="muted" style="margin:14px 0 6px">界面语言 · Language</p><div class="theme-pick" data-no-i18n><button class="theme-opt' + ((root.QZI18N && root.QZI18N.lang()) === 'en' ? '' : ' on') + '" data-act="settings.lang" data-l="zh">中文</button><button class="theme-opt' + ((root.QZI18N && root.QZI18N.lang()) === 'en' ? ' on' : '') + '" data-act="settings.lang" data-l="en">English</button></div>' + (function () { let seen = []; try { seen = JSON.parse(localStorage.getItem('qianzhang:rite:' + app.project.id) || '[]'); } catch (e) {} const R = root.QZCraft.RITES.filter(r => seen.includes(r.n)), cur = localStorage.getItem('qianzhang:skin') || ''; return '<div class="theme-pick skins"><button class="theme-opt' + (!cur ? ' on' : '') + '" data-act="settings.skin" data-s="">默认皮肤</button>' + root.QZCraft.RITES.map(r => R.includes(r) ? '<button class="theme-opt' + (cur === r.skin ? ' on' : '') + '" data-act="settings.skin" data-s="' + r.skin + '">' + esc(r.name) + '</button>' : '<button class="theme-opt" disabled title="写到第 ' + r.n + ' 章解锁">' + esc(r.name) + '<small>（' + r.n + ' 章）</small></button>').join('') + '</div>'; })() + '</section>'
        + '<section class="panel"><div class="panel-head"><div><h2>备份与导入</h2><p class="muted">把整部作品（章节、设定、关系、对话）导出成一个 JSON 文件，或从备份恢复。' + (app.storage.server ? '本地服务还会自动备份到 data/projects/.backup：最近 10 次保存，加上最近 14 天每天一份。不过它们和作品在同一块硬盘上，重要的稿子请定期导出一份放到网盘或 U 盘。' : '') + '</p></div></div>'
        + '<div class="row"><button class="btn" data-act="settings.export">' + icon('download') + '导出备份</button><button class="btn" data-act="settings.import">' + icon('upload') + '导入备份为新作品</button></div></section>'
        + '<section class="panel" id="book-manage"><div class="panel-head"><div><h2>' + icon('trash') + ' 作品管理</h2><p class="muted">删除的作品先放进回收站，随时能恢复。' + (app.storage.server ? '文件位置：data/projects（回收站在 data/projects/.trash）。' : '') + '</p></div></div>'
        + '<div class="row"><button class="btn" data-act="settings.trash">' + icon('trash') + '打开回收站</button><button class="btn danger" data-act="settings.del">删除当前作品《' + esc(app.project.title) + '》</button></div></section>'
        + '<section class="panel"><div class="panel-head"><div><h2>' + icon('sparkle') + ' 新手引导</h2><p class="muted">' + (root.QZPages.onboard && root.QZPages.onboard.minimal(app) ? '正在用极简模式：只显示写作和更多，写到第 3 章自动解锁其余功能。' : '第一次写小说？引导会问三个小问题，然后直接带你写第一章。') + '</p></div></div>'
        + '<div class="row"><button class="btn" data-act="onboard.reopen">重新打开新手引导</button>' + (root.QZPages.onboard && root.QZPages.onboard.minimal(app) ? '<button class="btn ghost" data-act="settings.unminimal">现在就打开全部功能</button>' : '') + '</div></section>';
    },
    mount: function () {
      const pre = document.getElementById('m-preset');
      pre.addEventListener('change', () => { const p = AI().PRESETS.find(x => x.id === pre.value); if (p && p.id !== 'custom') { document.getElementById('m-url').value = p.baseUrl; document.getElementById('m-model').value = p.model; } });
    },
    actions: {
      updateNow: app => {
        const out = document.getElementById('u-result'); if (out) out.textContent = '检查中…';
        app.checkUpdate(true).then(r => { if (out) out.textContent = !r || r.failed ? '没能完成检查（可能没有联网），可以稍后再试' : r.newer ? '有新版本，点侧栏里的提示可打开下载页面' : '已经是最新版本'; });
      },
      updateToggle: app => {
        const was = updateOff();
        try { was ? localStorage.removeItem('qianzhang:update-check') : localStorage.setItem('qianzhang:update-check', 'off'); } catch (e) {}
        app.renderPage(); app.renderUpdate(); if (was) app.checkUpdate();
      },
      unminimal: app => { try { const o = JSON.parse(localStorage.getItem('qianzhang:onboard') || '{}'); o.minimal = false; localStorage.setItem('qianzhang:onboard', JSON.stringify(o)); } catch (e) {} app.renderPage(); UI.toast('全部功能已打开'); },
      save: app => AI().saveSettings(readForm()).then(r => { UI.toast(r && r.memoryOnly ? '模型设置已保存（密钥只在本页内存里）' : '模型设置已保存'); app.renderPage(); }).catch(e => UI.toast('密钥没能保存：' + e.message, 'err')),
      clearKey: app => UI.confirm('清除密钥', '从本机删除已保存的 API 密钥？之后需要重新填写才能使用 AI 功能。', '清除').then(ok => { if (!ok) return; const s = AI().loadSettings(); s.apiKey = ''; return AI().saveSettings(s).then(() => { UI.toast('密钥已清除'); app.renderPage(); }); }),
      test: () => {
        const out = document.getElementById('m-result'), s = readForm(); out.textContent = '连接中…';
        AI().complete(s, [{ role:'user', content:'请只回复“连接成功”四个字。' }]).then(t => { out.textContent = '✓ ' + t.slice(0, 40); AI().saveSettings(s); })
          .catch(e => { out.textContent = '✗ ' + e.message; });
      },
      nudges: () => { const v = id => document.getElementById(id).value, st = +v('n-stuck'); root.QZPages.write.setPrefs({ stuckMin:st || 10, stuckOff:st ? '' : 'never', cpSec:+v('n-cp') || 30, tearOff:v('n-tear') }); UI.toast('提醒设置已保存'); },
      writing: app => { const w = app.project.data.writing; w.sensitive = document.getElementById('w-sens').value.trim(); w.perDay = Math.max(1, parseInt(document.getElementById('w-perday').value, 10) || 1); app.project.setGoal(document.getElementById('w-goal').value); UI.toast('已保存'); app.renderPage(); },
      skin: (app, el) => { const v = el.dataset.s; try { v ? localStorage.setItem('qianzhang:skin', v) : localStorage.removeItem('qianzhang:skin'); } catch (e) {} if (v) document.documentElement.dataset.skin = v; else delete document.documentElement.dataset.skin; app.renderPage(); },
      lang: (app, el) => { if (root.QZI18N && root.QZI18N.lang() !== el.dataset.l) root.QZI18N.set(el.dataset.l); },
      del: app => app.deleteProject(),
      trash: app => app.trashDialog(),
      theme: (app, el) => { if (app.theme() !== el.dataset.t) app.toggleTheme(); app.renderPage(); },
      /* 导出备份：默认去掉一切密钥字段；只有勾选时才附上模型连接（含密钥） */
      export: app => {
        const s = AI().loadSettings();
        return UI.modal({ title:'导出备份', body:'<p>备份包含整部作品：章节、设定、关系与对话。分享前请自己检查内容。</p>'
          + '<label class="check-row"><input type="checkbox" id="bk-key"' + (s.apiKey ? '' : ' disabled') + '> 同时导出模型连接和 API 密钥（明文，不建议）</label>'
          + '<p class="muted small">默认不包含密钥。' + (s.apiKey ? '' : '当前没有保存密钥。') + '</p>',
          buttons:[{ label:'取消', value:null }, { label:'导出', primary:true, value:w => ({ key:!!(w.querySelector('#bk-key') || {}).checked }) }] }).then(o => {
          if (!o) return;
          const data = AI().backupData(app.project.toJSON(), o.key ? s : null);
          localStorage.setItem('qianzhang:last-export', String(Date.now())); app.renderPage();
          UI.download(app.project.title + '-备份-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 2));
          if (o.key) UI.toast('备份里含明文 API 密钥，请妥善保管');
        });
      },
      import: app => UI.pickFile('.json,application/json').then(f => {
        if (!f) return; let d;
        try { d = JSON.parse(f.text); } catch (e) { return UI.toast('不是有效的 JSON 备份', 'err'); }
        if (!d || typeof d !== 'object' || (!Array.isArray(d.nodes) && !Array.isArray(d.chapters) && !d.manuscript)) return UI.toast('文件里没有找到作品数据', 'err');
        const model = d.qianzhang_model; delete d.qianzhang_model; d = AI().backupData(d, null);
        app.createProject((d.meta && d.meta.title) || f.name.replace(/\.json$/i, ''), d).then(() => {
          UI.toast('已导入为新作品');
          if (model && typeof model === 'object' && model.baseUrl) UI.confirm('恢复模型连接', '这份备份里带有模型连接（' + String(model.baseUrl).slice(0, 60) + (model.apiKey ? '，含 API 密钥' : '') + '）。要用它替换现在的设置吗？', '替换').then(ok => { if (ok) AI().saveSettings(Object.assign(AI().loadSettings(), model)).then(() => UI.toast('模型连接已恢复')); });
        });
      }),
    },
  };
}(typeof self !== 'undefined' ? self : globalThis));
