'use strict';
/* 各页面在无浏览器环境下渲染：内容正确、用户文字全部转义。 */
const assert = require('node:assert/strict');
const mem = {}; global.localStorage = { getItem:k => (k in mem ? mem[k] : null), setItem:(k, v) => { mem[k] = String(v); }, removeItem:k => { delete mem[k]; }, key:i => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
global.self = globalThis;
globalThis.QZStore = require('../core/store.js'); globalThis.QZAI = require('../core/ai.js'); globalThis.QZStorage = require('../core/storage.js'); globalThis.QZCraft = require('../core/craft.js');
for (const f of ['components', 'page-home', 'page-write', 'page-plan', 'page-insight', 'page-library', 'page-chat', 'page-settings', 'page-publish', 'page-notes', 'page-onboard', 'palette']) require('../ui/' + f + '.js');
const P = globalThis.QZPages, UI = globalThis.QZUI;
const XSS = '<img src=x onerror=alert(1)>';
const project = new globalThis.QZStore({ meta:{ title:'书' + XSS } });
const hero = project.addEntity({ name:'阿' + XSS, type:'PERSON', summary:'剑客' + XSS });
const town = project.addEntity({ name:'小镇', type:'PLACE' });
project.addRelation(hero.id, town.id, '住在' + XSS);
const ch = project.addChapter('第一章' + XSS); project.updateChapter(ch.id, { text:'正文' + XSS });
const vol = project.addVolume('第一卷' + XSS); project.updateChapter(ch.id, { volumeId:vol.id, outline:'细纲' + XSS });
project.addForeshadow({ title:'伏笔' + XSS, note:'注' + XSS, plantedIn:ch.id, dueChapter:1 }); project.updateEntity(hero.id, { aliases:'阿' + XSS });
project.addMessage(hero.id, 'user', '问' + XSS); project.addMessage(hero.id, 'assistant', '（抱拳）答' + XSS);
const app = { project, storage:{ server:true, list:() => Promise.resolve([]) }, route:{ page:'home', params:[] }, theme:() => 'light' };

const pages = { home:[[]], write:[[], [ch.id]], library:[[], [hero.id]], chat:[[], [hero.id]], settings:[[]], plan:[[]], insight:[[]], publish:[[]], notes:[[]], onboard:[[]] };
for (const [name, list] of Object.entries(pages)) for (const params of list) {
  const html = P[name].render(app, params);
  assert.ok(html.length > 100, name + ' 有内容');
  assert.ok(!html.includes(XSS), name + '/' + params + ' 不含未转义的用户文字');
  assert.ok(P[name].label && P[name].icon, name + ' 有导航名和图标');
}
const home = P.home.render(app, []);
for (const s of ['正文与章节', '角色与设定', '角色聊天', '我的作品']) assert.ok(home.includes(s), '首页含 ' + s);
assert.ok(P.write.render(app, [ch.id]).includes('正文&lt;img'), '写作页显示正文');
assert.ok(P.library.render(app, [hero.id]).includes('drawer'), '设定页打开详情抽屉');
const chat = P.chat.render(app, [hero.id]);
assert.ok(chat.includes('msg me') && chat.includes('msg them') && chat.includes('composer'), '聊天页有双方气泡和输入框');
assert.ok(chat.includes('去连接'), '未配置模型时提示去设置');
assert.ok(P.chat.format('（笑）好').includes('<em>'), '动作描写单独样式');
assert.equal(new globalThis.QZStore({}).chapters().length, 0);
assert.ok(P.write.render({ ...app, project:new globalThis.QZStore({}) }, []).includes('empty-state'), '没有章节时显示空状态');
assert.ok(UI.avatar('林舟').includes('>林<'), '头像取首字');
assert.equal(UI.esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
// 千章新增
assert.ok(home.includes('今日码字') && home.includes('连更日历') && home.includes('大纲伏笔'), '首页有码字目标、连更日历与大纲伏笔入口');
const w = P.write.render(app, [ch.id]);
assert.ok(!w.includes('id="check-panel"') && w.includes('>检查</button>') && w.includes('>AI</button>'), '写作页默认干净：检查面板收起，只留「检查」「AI」');
const ck = P.write.checkHtml(app, ch);
assert.ok(ck.includes('check-sum') && ck.includes('write.prepub') && ck.includes('write.rules') && ck.includes('本章出场') && ck.includes('疑似错名') && ck.includes('敏感词'), '检查合一：摘要、发布前自查、设定规则、体检');
assert.ok(w.includes('ch-outline') && w.includes('vol-head'), '有细纲框与分卷目录');
assert.ok(w.includes('AI 陪写') && w.includes('发布前自查'), '陪写与自查收进菜单');
const plan = P.plan.render(app, []);
assert.ok(plan.includes('分卷目录') && plan.includes('伏笔本') && plan.includes('fs-item'), '大纲伏笔页');
assert.ok(P.settings.render(app, []).includes('w-goal'), '设置里能改每日目标');
assert.ok(P.library.render(app, [hero.id]).includes('data-f="aliases"'), '设定抽屉有别名');
// 未连接模型时 AI 体检/卡文给出提示而不是发送请求
let modalBody = null; const realModal = UI.modal; UI.modal = o => { modalBody = o.body; return Promise.resolve(false); };
const realAI = globalThis.QZAI.complete; let sent = false; globalThis.QZAI.complete = () => { sent = true; return Promise.resolve(''); };
P.write.actions.unblock({ ...app, route:{ page:'write', params:[ch.id] } });
assert.ok(modalBody.includes('连接 AI 模型') && !sent, '无密钥时卡文助手优雅提示，不发请求');
UI.modal = realModal; globalThis.QZAI.complete = realAI;
assert.ok(w.includes('write.focus') && w.includes('write.publish'), '写作页有小黑屋与发布状态');
assert.ok(P.home.render(app, []).includes('stock-card'), '首页有存稿卡');
assert.ok(P.write.onKey, '写作页有快捷键');
project.addProgress(hero.id, { chapterId:ch.id, text:'受伤' + XSS, dead:true }); project.updateChapter(ch.id, { storyTime:'第一天' + XSS });
assert.ok(!P.plan.render(app, []).includes(XSS) && P.plan.render(app, []).includes('tl-row'), '时间线显示且转义');
assert.ok(P.library.render(app, [hero.id]).includes('pg-dead') && !P.library.render(app, [hero.id]).includes(XSS), '设定抽屉有状态变化');
assert.ok(!P.write.render(app, [ch.id]).includes(XSS), '写作页（含书中时间）转义');
console.log('页面渲染：六个页面、空状态与 XSS 转义通过');

// 新手上路、朗读按钮
{
  const h = P.home.render(app, []); assert.ok(h.includes('新手上路') && h.includes('ob-steps'), '新手上路');
  const w = P.write.render(app, [ch.id]); assert.ok(w.includes('write.read') && w.includes('朗读'), '朗读按钮');
  console.log('新手上路、朗读通过');
}
// 菜单里有 AI 续写，节奏页有简介骨架
{
  const src = require('fs').readFileSync(__dirname + '/../ui/page-write.js', 'utf8') + require('fs').readFileSync(__dirname + '/../ui/page-insight.js', 'utf8');
  require('node:assert/strict').ok(/write\.aiWrite/.test(src) && /insight\.draftBlurb/.test(src) && /AI 写入前/.test(src));
  console.log('AI 入口通过');
}

{ // 命令面板：模糊匹配 + 条目齐全
  const Pal = globalThis.QZPalette;
  assert.ok(Pal.score('第 1 章 第一章', '第一') > Pal.score('大纲与伏笔', '大伏'), '连续命中分更高');
  assert.equal(Pal.score('素材墙', '伏笔'), -1, '不含字符不匹配');
  const a = Object.assign({}, app, { pages:() => P, route:{ page:'home', params:[] } });
  const all = Pal.items(a);
  assert.ok(all.some(x => x.kind === '章节') && all.some(x => x.kind === '设定') && all.some(x => x.label === '新建章节'), '面板含章节/设定/操作');
  assert.equal(Pal.filter(all, '小镇')[0].label, '小镇', '搜设定名排第一');
}

// 空书架只提供新建作品，不再附带示例书；已有作品的首页也没有示例入口。
{
  const empty = { ...app, project:new globalThis.QZStore({}), _implicit:true, draftOnly:() => true };
  const shelf = P.home.render(empty, []), full = P.home.render(app, []);
  assert.ok(/data-act="home.create"/.test(shelf), '空书架有新建作品按钮');
  assert.ok(!/home\.example|打开示例/.test(shelf + full), '首页不再出现示例入口');
  assert.ok(!P.home.actions.example, '示例动作已移除');
  console.log('空书架：只有新建作品，没有示例入口通过');
}
