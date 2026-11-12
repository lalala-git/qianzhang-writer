#!/usr/bin/env node
'use strict';
/* 写作页「收起侧边栏」：按钮位置、Ctrl+\ 切换、记住状态、只在写作页生效（别的页面导航不会被藏住）、中英文提示 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mem = {};
global.localStorage = { getItem:k => (k in mem ? mem[k] : null), setItem:(k, v) => { mem[k] = String(v); }, removeItem:k => { delete mem[k]; }, key:i => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
const cls = new Set();
const classList = { add:c => cls.add(c), remove:c => cls.delete(c), contains:c => cls.has(c), toggle:(c, on) => { const v = on === undefined ? !cls.has(c) : !!on; if (v) cls.add(c); else cls.delete(c); return v; } };
global.document = { documentElement:{ classList, dataset:{} }, activeElement:null, querySelector:() => null, querySelectorAll:() => [] };
global.self = globalThis;
mem['qianzhang:write-side'] = 'off'; // 上次是收起的：页面脚本一加载就恢复
globalThis.QZStore = require('../core/store.js'); globalThis.QZAI = require('../core/ai.js'); globalThis.QZStorage = require('../core/storage.js'); globalThis.QZCraft = require('../core/craft.js');
for (const f of ['components', 'page-write', 'palette']) require('../ui/' + f + '.js');
const W = globalThis.QZPages.write;
assert.ok(cls.has('side-collapsed'), '重新打开时恢复上次收起的状态');

const project = new globalThis.QZStore({ meta:{ title:'书' } });
const ch = project.addChapter('第一章'); project.updateChapter(ch.id, { text:'正文' });
const app = { project, storage:{ server:true, list:() => Promise.resolve([]) }, route:{ page:'write', params:[ch.id] }, theme:() => 'light' };
const html = W.render(app, [ch.id]);
// 收起按钮在「目录」标题行、紧挨着 + 的左边
const head = html.slice(html.indexOf('<div class="side-head">'), html.indexOf('</div>', html.indexOf('<div class="side-head">')));
const iClose = head.indexOf('data-act="write.sidebar"'), iAdd = head.indexOf('data-act="write.add"');
assert.ok(iClose > 0 && iAdd > iClose, '收起按钮在目录标题里、新建按钮左边');
assert.match(head, /title="收起侧边栏（Ctrl\+\\）"/, '收起按钮有提示和快捷键');
// 展开按钮在顶栏最前面（「第 1 / 1 章」之前）
const bar = html.slice(html.indexOf('<div class="editor-bar">'));
assert.ok(bar.indexOf('side-open') > 0 && bar.indexOf('side-open') < bar.indexOf('ch-pos'), '展开按钮在顶栏章序前面');
assert.match(bar, /title="展开侧边栏（Ctrl\+\\）"/, '展开按钮有提示和快捷键');
// 没有章节的空白页没有正文，也就不给收起按钮（免得收起后找不到展开）
assert.ok(!W.render({ ...app, project:new globalThis.QZStore({}) }, []).includes('write.sidebar'), '空白页不显示收起按钮');

// 点按钮切换，并记住
W.actions.sidebar(app);
assert.ok(!cls.has('side-collapsed') && mem['qianzhang:write-side'] === 'on', '点一下展开并记住');
W.actions.sidebar(app);
assert.ok(cls.has('side-collapsed') && mem['qianzhang:write-side'] === 'off', '再点一下收起并记住');
assert.ok(cls.has('side-anim'), '手动切换时才有过渡动画');
// Ctrl+\ 切换
const key = o => W.onKey(app, Object.assign({ key:'\\', code:'Backslash', ctrlKey:true, metaKey:false, shiftKey:false, altKey:false }, o));
assert.equal(key({}), true); assert.ok(!cls.has('side-collapsed'), 'Ctrl+\\ 展开');
assert.equal(key({}), true); assert.ok(cls.has('side-collapsed'), 'Ctrl+\\ 收起');
assert.equal(key({ key:'|', shiftKey:true }), false, 'Ctrl+Shift+\\ 不算');
assert.ok(cls.has('side-collapsed'));
// 小黑屋里不动（那里本来就全藏着）
app.focus = { chapterId:ch.id }; key({}); assert.ok(cls.has('side-collapsed'), '小黑屋里快捷键不切换'); delete app.focus;
W.actions.sidebar(app); // 还原成展开

// 样式：只在有正文的写作页生效，别的页面导航始终可见；窄屏/图标栏宽度也收
const css = fs.readFileSync(path.join(__dirname, '..', 'ui', 'style.css'), 'utf8');
const rules = css.split('}').filter(r => r.includes('html.side-collapsed') && /margin-left|display:none/.test(r));
assert.ok(rules.length >= 2, '有收起规则');
for (const r of rules) for (const sel of r.slice(r.lastIndexOf('{') >= 0 ? 0 : 0, r.lastIndexOf('{')).split(',')) assert.ok(/\.page-write/.test(sel), '收起只作用于写作页：' + sel.trim());
assert.ok(/#app:has\(\.page-write \.editor\) \.sidebar/.test(css), '左侧导航只在写作页正文出现时收起');
assert.ok(/visibility:hidden/.test(rules.join('}')), '收起后键盘 Tab 不会跑进看不见的导航');

// 命令面板里能找到，中英文提示都有
const pal = fs.readFileSync(path.join(__dirname, '..', 'ui', 'palette.js'), 'utf8');
assert.ok(pal.includes("['sidebar', '收起 / 展开侧边栏', 'Ctrl+\\\\']"), '命令面板有收起侧边栏');
global.localStorage.setItem('qianzhang:lang', 'en'); global.window = global; global.MutationObserver = function () { this.observe = () => {}; }; global.document.addEventListener = () => {}; global.document.title = '';
require('../ui/i18n.js');
const { t } = globalThis.QZI18N;
assert.equal(t('收起侧边栏（Ctrl+\\）'), 'Hide sidebar (Ctrl+\\)');
assert.equal(t('展开侧边栏（Ctrl+\\）'), 'Show sidebar (Ctrl+\\)');
assert.equal(t('收起侧边栏'), 'Hide sidebar'); assert.equal(t('展开侧边栏'), 'Show sidebar');
assert.equal(t('收起 / 展开侧边栏'), 'Hide / show sidebar');
console.log('侧边栏收起：全部通过');
