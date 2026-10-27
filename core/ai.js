/*! 千章 · core/ai.js · 角色对话与模型连接（OpenAI 兼容接口） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QZAI = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'qianzhang:model';
  const PRESETS = [
    { id:'deepseek', name:'DeepSeek', baseUrl:'https://api.deepseek.com', model:'deepseek-chat' },
    { id:'openai', name:'OpenAI', baseUrl:'https://api.openai.com/v1', model:'gpt-4o-mini' },
    { id:'ollama', name:'Ollama（本机）', baseUrl:'http://127.0.0.1:11434/v1', model:'qwen2.5' },
    { id:'custom', name:'自定义', baseUrl:'', model:'' },
  ];

  /* 密钥不写 localStorage：页面内存里一份，持久化交给本地服务加密保存（见 server/keystore.js）。
   * vault = { get():Promise<{key,protection}>, set(key):Promise<{key,protection}> }，由 app 在连上本地服务后接上。 */
  const secret = { key:'', vault:null, protection:null, loaded:false };
  function strip(s) { const o = Object.assign({}, s); delete o.apiKey; return o; }
  function loadSettings(storage) {
    let s = null;
    try { const x = JSON.parse((storage || localStorage).getItem(KEY) || 'null'); if (x && typeof x === 'object') s = x; } catch (e) {}
    if (!s) {
      s = { preset:'deepseek', baseUrl:PRESETS[0].baseUrl, model:PRESETS[0].model, temperature:0.8 };
      try { // 旧版本的模型连接：沿用地址和模型（密钥需重新填写）
        const old = JSON.parse((storage || localStorage).getItem('canongraph:ai:device') || 'null');
        const p = old && Array.isArray(old.providers) && (old.providers.find(x => x.id === old.activeId) || old.providers[0]);
        if (p && p.baseUrl) Object.assign(s, { preset:(PRESETS.find(x => x.baseUrl === p.baseUrl) || { id:'custom' }).id, baseUrl:p.baseUrl, model:p.model || s.model });
      } catch (e) {}
    }
    // 旧版本明文留在 localStorage 里的密钥：迁移完成前仍可用，迁移后删除
    return Object.assign(s, { apiKey:secret.key || s.apiKey || '' });
  }
  /** 保存：地址/模型等写 localStorage（不含密钥）；密钥交给本地服务加密保存。返回 Promise<{protection}>。 */
  function saveSettings(s, storage) {
    const st = storage || localStorage;
    st.setItem(KEY, JSON.stringify(strip(s)));
    secret.key = String(s.apiKey || '');
    if (!secret.vault) return Promise.resolve({ protection:null, memoryOnly:!!secret.key });
    return secret.vault.set(secret.key).then(r => { secret.protection = r && r.protection || null; return { protection:secret.protection }; });
  }
  /** 连上本地服务后调用：取回加密保存的密钥；把旧版明文密钥搬过去，成功后从 localStorage 删掉。 */
  function attachVault(vault, storage) {
    const st = storage || localStorage; secret.vault = vault;
    let legacy = ''; try { const x = JSON.parse(st.getItem(KEY) || 'null'); legacy = x && x.apiKey || ''; } catch (e) {}
    return vault.get().then(r => {
      secret.key = r && r.key || ''; secret.protection = r && r.protection || null; secret.loaded = true;
      if (!legacy) return r;
      return (secret.key ? Promise.resolve(r) : vault.set(legacy).then(x => { secret.key = legacy; secret.protection = x && x.protection; return x; }))
        .then(x => { try { const o = JSON.parse(st.getItem(KEY) || '{}'); delete o.apiKey; st.setItem(KEY, JSON.stringify(o)); } catch (e) {} return x; });
    }).catch(e => { secret.vault = null; throw e; });
  }
  /** 备份内容：深拷贝后去掉所有 apiKey / api_key / authorization / access_token 字段；model 不为空时才附上模型连接（含密钥） */
  function backupData(data, model) {
    const SECRET = /^(api[_-]?key|authorization|access[_-]?token)$/i;
    const clean = x => Array.isArray(x) ? x.map(clean) : x && typeof x === 'object' ? Object.keys(x).reduce((o, k) => { if (!SECRET.test(k)) o[k] = clean(x[k]); return o; }, {}) : x;
    const out = clean(data);
    if (model) out.qianzhang_model = { preset:model.preset, baseUrl:model.baseUrl, model:model.model, temperature:model.temperature, apiKey:model.apiKey || '' };
    return out;
  }
  function keyInfo() { return { protection:secret.protection, persistent:!!secret.vault, loaded:secret.loaded }; }
  function ready(s) { return !!(s && s.baseUrl && s.model && (s.apiKey || /127\.0\.0\.1|localhost/.test(s.baseUrl))); }
  function endpoint(base) {
    const b = String(base || '').trim().replace(/\/+$/, '');
    return /\/chat\/completions$/.test(b) ? b : b + '/chat/completions';
  }
  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

  /** 角色扮演的系统提示：角色档案 + 与他人的关系 + 世界规则 + 最近剧情。 */
  function characterPrompt(project, characterId, options) {
    const o = options || {}, c = project.entity(characterId);
    if (!c) throw new Error('角色不存在');
    const rel = project.relationsOf(c.id).filter(x => x.other)
      .map(x => '- ' + (x.outgoing ? '你 → ' + x.other.name : x.other.name + ' → 你') + '：' + x.label + (x.other.summary ? '（' + clip(x.other.summary, 60) + '）' : ''));
    const rules = project.entities({ type:'RULE' }).slice(0, 12).map(r => '- ' + r.name + '：' + clip(r.summary, 120));
    const chapters = project.chapters();
    const recent = o.chapterId ? project.chapter(o.chapterId) : chapters[chapters.length - 1];
    const parts = [
      '你正在扮演小说《' + project.title + '》中的角色「' + c.name + '」。始终以' + c.name + '的身份、口吻和认知用中文回答，不要跳出角色，不要提及自己是 AI。',
      '【角色档案】\n' + (c.summary || '（暂无简介）') + (c.detail ? '\n' + clip(c.detail, 1500) : ''),
    ];
    if (rel.length) parts.push('【人物关系】\n' + rel.join('\n'));
    if (rules.length) parts.push('【世界规则】\n' + rules.join('\n'));
    if (recent && recent.text && o.includeChapter !== false) parts.push('【最近剧情：' + recent.title + '】\n' + clip(recent.text.slice(-1800), 1800));
    parts.push('回答简洁自然，可以包含动作与神态描写（用括号）。不知道的事情就按角色认知回应，不要编造设定之外的重大事实。');
    return parts.join('\n\n');
  }

  function buildMessages(project, characterId, history, options) {
    const msgs = [{ role:'system', content:characterPrompt(project, characterId, options) }];
    (history || []).slice(-30).forEach(m => msgs.push({ role:m.role === 'user' ? 'user' : 'assistant', content:m.text }));
    return msgs;
  }

  /** 解析 SSE 文本块；返回 {deltas:[...], rest}。 */
  function parseSSE(buffer) {
    const lines = buffer.split('\n'), rest = lines.pop(), deltas = [];
    let done = false;
    lines.forEach(line => {
      const l = line.trim();
      if (!l.startsWith('data:')) return;
      const body = l.slice(5).trim();
      if (body === '[DONE]') { done = true; return; }
      try { const j = JSON.parse(body); const d = j.choices && j.choices[0] && (j.choices[0].delta || j.choices[0].message);
        if (d && d.content) deltas.push(d.content); } catch (e) {}
    });
    return { deltas, rest, done };
  }

  function explain(status, text) {
    if (status === 401 || status === 403) return 'API 密钥无效或没有权限（' + status + '），请在「设置」里检查密钥。';
    if (status === 404) return '接口地址或模型名称不正确（404），请检查「接口地址」和「模型」。';
    if (status === 429) return '请求太频繁或额度不足（429），稍后再试。';
    if (status >= 500) return '模型服务暂时不可用（' + status + '）。';
    return '模型请求失败（' + status + '）' + (text ? '：' + clip(text, 200) : '');
  }

  /** 发送对话。onDelta(片段, 已累计全文)。返回 Promise<全文>。 */
  /** 回复语言跟随界面：界面是英文时让模型用英文回答（人名、书名保持原文） */
  function withLang(messages, lang) {
    const L = lang || (typeof self !== 'undefined' && self.QZI18N && self.QZI18N.lang && self.QZI18N.lang()); if (L !== 'en' || !Array.isArray(messages)) return messages;
    const note = 'Reply in English (the author uses the English interface). Keep Chinese character names, place names and quoted original text as they are.';
    const out = messages.slice(), i = out.findIndex(m => m.role === 'system'); if (i >= 0) out[i] = Object.assign({}, out[i], { content:out[i].content + '\n\n' + note }); else out.unshift({ role:'system', content:note }); return out;
  }
  function complete(settings, messages, opts) {
    const o = opts || {}, f = o.fetch || fetch; messages = withLang(messages, o.lang);
    if (!ready(settings)) return Promise.reject(new Error('还没有连接模型，请先到「设置」填写接口与密钥。'));
    const headers = { 'Content-Type':'application/json' };
    if (settings.apiKey) headers.Authorization = 'Bearer ' + settings.apiKey;
    return f(endpoint(settings.baseUrl), { method:'POST', headers, signal:o.signal,
      body:JSON.stringify({ model:settings.model, messages, stream:true, temperature:Number(settings.temperature) || 0.8 }) })
      .catch(e => { if (e && e.name === 'AbortError') throw e; throw new Error('无法连接模型服务：' + (e && e.message || e) + '（检查网络、地址，或服务是否允许浏览器跨域访问）'); })
      .then(r => {
        if (!r.ok) return r.text().catch(() => '').then(t => { throw new Error(explain(r.status, t)); });
        let full = '';
        const push = d => { full += d; if (o.onDelta) o.onDelta(d, full); };
        const type = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if (!r.body || !r.body.getReader || /json/.test(type)) {
          return r.text().then(t => {
            if (/^\s*data:/m.test(t)) parseSSE(t + '\n').deltas.forEach(push);
            else { const j = JSON.parse(t); push(j.choices[0].message.content || ''); }
            return full;
          });
        }
        const reader = r.body.getReader(), dec = new TextDecoder();
        let buf = '';
        const pump = () => reader.read().then(x => {
          if (x.done) { parseSSE(buf + '\n').deltas.forEach(push); return full; }
          buf += dec.decode(x.value, { stream:true });
          const p = parseSSE(buf); buf = p.rest; p.deltas.forEach(push);
          return p.done ? full : pump();
        });
        return pump();
      });
  }

  return { PRESETS, loadSettings, saveSettings, attachVault, keyInfo, strip, backupData, ready, endpoint, characterPrompt, buildMessages, parseSSE, complete, explain, withLang };
}));
