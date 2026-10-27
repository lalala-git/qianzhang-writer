'use strict';
/* 千章网文工具：码字记录、连更、热力图、伏笔状态、本章体检、分卷、AI 提示。 */
const assert = require('node:assert/strict');
const C = require('../core/craft.js'), Project = require('../core/store.js');

// 日期与连更
assert.equal(C.addDays('2026-03-01', -1), '2026-02-28');
assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
const daily = { '2026-10-18':2500, '2026-10-19':100, '2026-10-20':2000, '2026-10-21':3000, '2026-10-22':2100 };
let s = C.streak(daily, 2000, '2026-10-23');
assert.deepEqual([s.current, s.best, s.today, s.done], [3, 3, 0, false], '今天没写不断更，从昨天往回数');
s = C.streak({ ...daily, '2026-10-23':2000 }, 2000, '2026-10-23');
assert.deepEqual([s.current, s.best, s.done], [4, 4, true]);
assert.equal(C.streak({}, 2000, '2026-10-23').current, 0);
const hm = C.heatmap(daily, 2000, 4, '2026-10-23');
assert.equal(hm.length, 4); assert.ok(hm.every(c => c.length === 7));
const cells = hm.flat(); assert.equal(cells.find(c => c.key === '2026-10-21').level, 3);
assert.equal(cells.find(c => c.key === '2026-10-19').level, 1);
assert.ok(cells.find(c => c.key === '2026-10-25').future, '2026-10-23 是周五，本周日在未来');
assert.equal(hm[0][0].key, '2026-09-28', '每列从周一开始');

// 伏笔状态
assert.equal(C.foreshadowStatus({ resolvedIn:'x', dueChapter:1 }, 50), 'resolved');
assert.equal(C.foreshadowStatus({ dueChapter:10 }, 11), 'overdue');
assert.equal(C.foreshadowStatus({ dueChapter:10 }, 8), 'soon');
assert.equal(C.foreshadowStatus({ dueChapter:10 }, 2), 'open');
assert.equal(C.foreshadowStatus({}, 999), 'open');

// 体检
const ents = [{ id:'a', name:'沈星河', aliases:'星君，阿河', summary:'少年' }, { id:'b', name:'林舟' }, { id:'c', name:'青崖山' }];
const text = '沈星河跳上青崖山。阿河回头一笑。沈星海说：快走！林洲说：等等。林州很好。毒品不能碰。' + '仿佛'.repeat(3) + '飞剑'.repeat(8);
const r = C.scan(text, ents, ['快走']);
const m = Object.fromEntries(r.mentions.map(x => [x.entity.id, x.count]));
assert.equal(m.a, 2, '别名也算出场'); assert.equal(m.c, 1); assert.ok(!m.b);
const sus = r.suspects.map(x => x.word + '>' + x.like);
assert.ok(sus.includes('沈星海>沈星河'), '三字名差一字');
assert.ok(sus.includes('林洲>林舟'), '两字名后跟「说」才提示');
assert.ok(!sus.includes('林州>林舟'), '两字名后面没有对话动词不提示');
assert.deepEqual(r.sensitive.map(x => x.word).sort(), ['快走', '毒品'].sort(), '内置 + 自定义敏感词');
assert.equal(text.slice(r.sensitive[0].index, r.sensitive[0].index + r.sensitive[0].word.length), r.sensitive[0].word, 'index 可定位');
assert.equal(r.crutch[0].word, '仿佛');
assert.ok(r.repeats.some(x => x.word === '飞剑'), '高频重复词');
assert.deepEqual(C.scan('', ents).mentions, []);
assert.ok(C.scan('沈星河沈星河', ents).suspects.length === 0, '正确写法不误报');

// 数据层：分卷、细纲、伏笔、今日字数、旧文件兼容
const old = new Project({ meta:{ title:'旧书' }, chapters:[{ id:'c1', title:'一', text:'旧文', order:0, volumeId:'gone' }] });
assert.deepEqual(old.data.volumes, []); assert.deepEqual(old.data.foreshadows, []); assert.equal(old.data.writing.goal, 2000);
assert.equal(old.chapter('c1').volumeId, undefined, '指向不存在分卷的章节回到未分卷');
const p = new Project({});
const c1 = p.addChapter('第一章', '导入的一万字不算今天');
assert.deepEqual(p.data.writing.daily, {}, '新建/导入正文不计入今日字数');
p.updateChapter(c1.id, { text:p.chapter(c1.id).text + '又写了五个' });
assert.equal(p.data.writing.daily[C.dayKey()], 5);
p.updateChapter(c1.id, { text:'短' });
assert.ok(p.data.writing.daily[C.dayKey()] < 0, '删字会抵扣今日字数');
const v1 = p.addVolume('第一卷'), v2 = p.addVolume('');
assert.equal(v2.title, '第2卷');
const c2 = p.addChapter('第二章', '', v2.id), c3 = p.addChapter('第三章', '', v1.id);
assert.deepEqual(p.chapters().map(c => c.title), ['第一章', '第三章', '第二章'], '按卷排序');
assert.equal(p.chapterNo(c2.id), 3);
p.moveChapter(c3.id, -1); assert.equal(p.chapter(c3.id).volumeId, undefined, '上移越过卷边界就进入上一组');
p.updateChapter(c2.id, { outline:'主角被逐出宗门' }); assert.equal(p.chapter(c2.id).outline, '主角被逐出宗门');
assert.deepEqual(p.outline().map(g => g.volume ? g.volume.title : '未分卷'), ['未分卷', '第一卷', '第2卷']);
p.removeVolume(v2.id); assert.equal(p.chapter(c2.id).volumeId, undefined, '删卷不删章');
const f = p.addForeshadow({ title:'白铃', plantedIn:c1.id, dueChapter:'2' });
assert.equal(f.dueChapter, 2);
p.updateForeshadow(f.id, { resolvedIn:c2.id }); assert.equal(C.foreshadowStatus(p.foreshadow(f.id), 3), 'resolved');
p.setGoal(4000); assert.equal(p.data.writing.goal, 4000); p.setGoal('abc'); assert.equal(p.data.writing.goal, 2000);
const e = p.addEntity({ name:'沈渡', type:'PERSON' }); p.updateEntity(e.id, { aliases:'沈三' }); assert.equal(p.entity(e.id).aliases, '沈三');
const round = new Project(JSON.parse(JSON.stringify(p.toJSON())));
assert.equal(round.foreshadows().length, 1); assert.equal(round.volumes().length, 1); assert.equal(round.data.writing.goal, 2000);

// AI 提示：带设定、伏笔与细纲
const msgs = C.unblockMessages(p, c2.id).map(x => x.content).join('\n');
assert.ok(msgs.includes('沈渡（又名沈三）') && msgs.includes('主角被逐出宗门'));
assert.ok(C.checkMessages(p, c2.id)[0].content.includes('责编'));
console.log('网文工具：连更日历、伏笔状态、本章体检、分卷细纲、AI 提示通过');

// 存稿与小黑屋
{
  const q = new Project({});
  const a = q.addChapter('一', '字'.repeat(600)), b = q.addChapter('二', '字'.repeat(600)), c = q.addChapter('三', '字'.repeat(600)), d = q.addChapter('四', '短');
  let st = C.stock(q, '2026-10-23');
  assert.deepEqual([st.published, st.stock, st.days, st.level], [0, 3, 3, 'warn'], '没发布时全部算存稿，字数太少的不算');
  q.updateChapter(a.id, { status:'published' }); q.updateChapter(b.id, { publishAt:'2026-10-22' }); q.updateChapter(c.id, { publishAt:'2026-10-25' });
  st = C.stock(q, '2026-10-23');
  assert.deepEqual([st.published, st.stock, st.days], [1, 2, 2]); assert.equal(st.level, 'danger');
  assert.equal(st.overdue.length, 1, '过了计划日没发布'); assert.equal(st.next.id, c.id);
  q.updateChapter(b.id, { publishAt:'bad' }); assert.equal(q.chapter(b.id).publishAt, undefined, '非法日期被忽略');
  q.updateChapter(a.id, { status:'' }); assert.equal(q.chapter(a.id).status, undefined);
  q.data.writing.perDay = 2; assert.equal(C.stock(q).days, 1);
  assert.equal(new Project({ writing:{ perDay:'x' } }).data.writing.perDay, 1);
  void d;
  const f = { start:0, minutes:30, goal:1000, startWords:5000, lock:true };
  let s1 = C.focusState(f, 60000, 5400);
  assert.deepEqual([s1.left, s1.wrote, s1.done, s1.locked], [1740, 400, false, true]);
  s1 = C.focusState(f, 31 * 60000, 5400); assert.ok(s1.timeDone && s1.locked, '有字数目标时，到时间也要写够才解锁');
  s1 = C.focusState(f, 60000, 6000); assert.ok(s1.done && !s1.locked);
  assert.ok(!C.focusState({ ...f, goal:0 }, 31 * 60000, 0).locked, '只设时间：到点解锁');
  assert.ok(!C.focusState({ ...f, lock:false }, 0, 0).locked);
  assert.equal(C.mmss(125), '02:05');
}
console.log('存稿与小黑屋通过');

// 状态变化、已故角色开口、时间线数据
{
  const q = new Project({});
  const c1 = q.addChapter('一', ''), c2 = q.addChapter('二', ''), c3 = q.addChapter('三', '');
  const e = q.addEntity({ name:'陈默', type:'PERSON' });
  q.addProgress(e.id, { chapterId:c1.id, text:'左臂受伤' });
  const dead = q.addProgress(e.id, { chapterId:c2.id, text:'坠崖', dead:true });
  assert.deepEqual(q.progressOf(e.id).map(x => x.text), ['左臂受伤', '坠崖']);
  assert.equal(q.progressOf(e.id, 1).length, 1, '截至第 1 章');
  assert.deepEqual(q.deadBy(1), []); assert.deepEqual(q.deadBy(2), [e.id]);
  const r = C.scan('“别怕。”陈默说。陈默的墓碑很冷。', q.data.nodes, [], { dead:q.deadBy(2) });
  assert.equal(r.ghosts.length, 1); assert.equal(r.ghosts[0].count, 1, '只算开口说话，不算被提到');
  assert.equal(C.scan('陈默说', q.data.nodes).ghosts.length, 0, '没传死亡名单就不检查');
  q.updateProgress(e.id, dead.id, { dead:false }); assert.deepEqual(q.deadBy(3), []);
  q.removeProgress(e.id, dead.id); assert.equal(q.progressOf(e.id).length, 1);
  q.updateChapter(c3.id, { storyTime:' 第三天夜 ' }); assert.equal(q.chapter(c3.id).storyTime, '第三天夜');
  q.updateChapter(c3.id, { storyTime:'' }); assert.equal(q.chapter(c3.id).storyTime, undefined);
  assert.ok(C.checkMessages(q, c2.id)[1].content.includes('左臂受伤'), 'AI 体检带上截至上一章的状态');
  const again = new Project(JSON.parse(JSON.stringify(q.toJSON()))); assert.equal(again.progressOf(e.id).length, 1);
}
console.log('状态变化与时间线通过');

// 错别字、平台排版、长篇性能
{
  const r = C.scan('他迫不急待地冲出去，一切莫明其妙。即使如此，也要再接再厉。', []);
  assert.deepEqual(r.typos.map(x => x.word + '>' + x.fix).sort(), ['莫明其妙>莫名其妙', '迫不急待>迫不及待']);
  assert.ok(Object.keys(C.TYPOS).every(k => k !== C.TYPOS[k] && !Object.values(C.TYPOS).includes(k)), '错写表不会把正确写法当错字');
  const out = C.platformText([{ title:'第一章 起', text:'  第一段\n\n\n第二段  \n　第三段' }]);
  assert.equal(out, '第一章 起\n\n\u3000\u3000第一段\n\n\u3000\u3000第二段\n\n\u3000\u3000第三段');
  assert.equal(C.platformText([{ title:'t', text:'a\nb' }], { indent:false, blank:false, title:false }), 'a\nb');
  // 合成长篇：120 章 × 约 8000 字
  const big = new Project({}); ['林舟', '沈渡', '白霜'].forEach(n => big.addEntity({ name:n, type:'PERSON' }));
  const para = '林舟说：“夜色沉沉，剑光如水，我们走吧。”沈渡点头，白霜望向远方的群山与河流。\n';
  for (let i = 0; i < 120; i++) big.addChapter('第' + (i + 1) + '章', para.repeat(250) + i);
  const t0 = Date.now();
  for (let k = 0; k < 3; k++) { big.stats(); big.chapters(); C.stock(big); C.scan(big.chapters()[50].text, big.data.nodes); JSON.stringify(big.toJSON()); }
  const ms = Date.now() - t0;
  assert.ok(big.stats().words > 800000, '合成书约百万字');
  assert.ok(ms < 3000, '百万字长篇的统计、存稿、体检、序列化 3 轮应在 3 秒内（实际 ' + ms + 'ms）');
}
console.log('错别字、平台排版、长篇性能通过');

// 节奏分析
{
  const p = new Project({}); const hero = p.addEntity({ name:'林舟', type:'PERSON' }); p.addEntity({ name:'沈渡', type:'PERSON' }); p.addEntity({ name:'青锋剑', type:'ITEM' });
  p.addChapter('一', '林舟站在山门前。“你也配？”众人竟然大笑。林舟怒喝一声，打脸来得太快！'.repeat(60) + '他到底是谁？');
  p.addChapter('二', '沈渡出场。'.repeat(10) + '平淡的一天。'.repeat(400));
  for (let i = 0; i < 12; i++) p.addChapter('章' + i, '林舟赶路，风很大，树很高。'.repeat(80));
  const r = C.insight(p);
  assert.equal(r.chapters.length, 14); assert.equal(r.lead.name, '林舟'); assert.equal(r.cast.length, 2, '只统计人物');
  assert.ok(r.chapters[0].hype >= 2 && r.chapters[0].hook && r.chapters[0].dialogue > 0);
  assert.equal(r.golden[0].ok, true, '主角在第一章开头登场');
  assert.equal(r.golden[1].ok, false, '第二章及以后不够 2000 字或第三章太短也会提示');
  assert.ok(r.flat.length >= 1, '连续平淡章节');
  assert.ok(r.missing.some(x => x.name === '沈渡') === false, '只出场一章不算失踪');
  assert.strictEqual(C.insight(p), r, '内容不变时走缓存');
  p.updateChapter(p.chapters()[13].id, { text:'沈渡回来了。' });
  assert.notStrictEqual(C.insight(p), r, '内容变了重算');
  assert.equal(new Project({}).chapters().length, 0); assert.deepEqual(C.insight(new Project({})).golden, []);
}
console.log('节奏分析通过');

// 读者评论、书名简介
{
  const p = new Project({}); p.addChapter('一', '沈星澜跳下断崖。');
  const r = C.comments('第一章「沈星澜」写错了\n大大求加更！！\n建议女主早点出场\n太好看了\n嗯嗯\n', p);
  assert.equal(r.fix.length, 1); assert.equal(r.fix[0].quote, '沈星澜'); assert.equal(r.fix[0].hits.length, 1);
  assert.equal(r.urge.length, 1); assert.equal(r.idea.length, 1); assert.equal(r.praise.length, 1); assert.equal(r.other.length, 1);
  assert.deepEqual(C.comments('', p), { fix:[], urge:[], idea:[], praise:[], other:[] });
  const b = C.blurbCheck('我在修仙界当卧底', '林舟只是个外门杂役，却被宗主看中，派去魔门卧底。'.repeat(4) + '他却不知道……', '林舟');
  assert.ok(b.every(x => x.ok), b.filter(x => !x.ok).map(x => x.label).join());
  const bad = C.blurbCheck('未命名作品', '这个世界分为九大陆。', '');
  assert.ok(bad.filter(x => !x.ok).length >= 4);
  p.setBlurb('  简介  '); assert.equal(new Project(p.toJSON()).data.meta.blurb, '简介');
}
console.log('读者评论、书名简介通过');

// 报表、关系图布局
{
  const r = C.report({ '2026-10-23':3000, '2026-10-21':1000, '2026-10-15':2000 }, 2000, 7, '2026-10-23');
  assert.equal(r.days.length, 7); assert.equal(r.sum, 4000); assert.equal(r.activeDays, 2); assert.equal(r.avg, 2000); assert.equal(r.hit, 1);
  assert.equal(r.best.key, '2026-10-23'); assert.equal(r.prev, 2000); assert.equal(r.change, 1);
  assert.equal(C.report({}, 2000, 30, '2026-10-23').change, null);
  const pos = C.layoutGraph(['a', 'b', 'c'], [{ source:'a', target:'b' }, { source:'b', target:'c' }], 900, 500);
  assert.ok(Object.values(pos).every(p => p.x >= 40 && p.x <= 860 && p.y >= 40 && p.y <= 460 && isFinite(p.x)));
  assert.deepEqual(pos, C.layoutGraph(['a', 'b', 'c'], [{ source:'a', target:'b' }, { source:'b', target:'c' }], 900, 500), '布局是确定的');
  assert.deepEqual(C.layoutGraph(['x'], [], 100, 100), { x:{ x:50, y:50 } });
}
console.log('报表、关系图通过');

// AI 写作提示词、简介
{
  const P2 = Project.Project || Project;
  const p = new P2(JSON.parse(require('fs').readFileSync(__dirname + '/fixtures/demo-book.json', 'utf8')));
  const id = p.chapters()[0].id;
  const m = C.writeMessages(p, id, { mode:'polish', keep:['cast'], sel:'选中的一段', note:'更紧张' });
  assert.ok(/润色/.test(m[0].content) && /不新增/.test(m[0].content) && /更紧张/.test(m[0].content) && /选中的一段/.test(m[1].content));
  assert.ok(!/选中段落】/.test(C.writeMessages(p, id, { mode:'continue' })[1].content));
  assert.ok(/3000 字/.test(C.writeMessages(p, id, { len:99999 })[0].content));
  assert.ok(C.blurbDraft(p).length > 10 && /3 版/.test(C.blurbMessages(p)[0].content));
  assert.deepEqual(C.splitVersions('一、甲\n二、乙\n三、丙'), ['甲', '乙', '丙']);
}
console.log('AI 写作提示词通过');

// 平台发布预设与自查
{
  const P2 = Project.Project || Project, p = new P2({});
  const a = p.addChapter('开端', '短。\n毒品'), b = p.addChapter('第二章 再来', '甲'.repeat(2100));
  assert.equal(C.chapterTitle(a, 1), '第1章 开端'); assert.equal(C.chapterTitle(b, 2), '第二章 再来');
  const iss = C.publishCheck(p, [a, b], 'qidian');
  assert.ok(iss.some(x => x.chapterId === a.id && /敏感词/.test(x.text)) && iss.some(x => x.chapterId === a.id && /建议/.test(x.text)) && !iss.some(x => x.chapterId === b.id));
  assert.ok(C.publishText(p, [a], 'fanqie').startsWith('第1章 开端\n\n短。\n\n毒品'));
  assert.ok(C.publishText(p, [a], 'qimao').includes('\u3000\u3000短。\n\u3000\u3000毒品'));
}
console.log('平台发布通过');
{
  const m = C.milestones(120000, 12, { '2026-10-18':500, '2026-10-20':300 }, '2026-10-23');
  assert.equal(m.words.next, '30 万字'); assert.equal(m.words.reached, '10 万字'); assert.equal(m.words.need, 180000); assert.equal(m.words.pct, 10);
  assert.equal(m.chapters.next, '50 章'); assert.equal(m.gap, 3);
  assert.equal(C.milestones(0, 0, {}, '2026-10-23').gap, null);
}
console.log('里程碑通过');

// 战力 / 资源成长提醒
{
  const P3 = require('../core/store.js'), C = require('../core/craft.js'), p = new P3({});
  const chs = []; for (let i = 0; i < 60; i++) chs.push(p.addChapter('第' + (i + 1) + '章', '正文'));
  const hero = p.addEntity({ name:'林舟', type:'PERSON' }), foe = p.addEntity({ name:'沈砚', type:'PERSON' });
  const add = (e, i, text, kind) => p.addProgress(e.id, { chapterId:chs[i - 1].id, text, kind });
  add(hero, 1, '炼气一层', 'power'); add(hero, 2, '突破筑基', 'power'); add(hero, 10, '结成金丹', 'power');
  add(foe, 5, '金丹后期', 'power'); add(foe, 8, '跌落筑基', 'power'); add(foe, 9, '晋升化神', 'power');
  add(hero, 3, '得到灵石 +100', 'res'); add(hero, 6, '买丹药 灵石 -150', 'res'); add(hero, 7, '受伤', undefined);
  assert.equal(C.rankOf('突破筑基，又到金丹', C.ladderOf()), 2, '取最后出现的境界');
  const g = C.growth(p), k = g.alerts.map(a => a.kind).sort();
  assert.deepEqual(k, ['down', 'fast', 'neg', 'skip', 'stall', 'stall'], JSON.stringify(g.alerts));
  assert.equal(g.people.find(x => x.id === hero.id).level, '金丹'); assert.equal(g.res[0].balance, -50);
  assert.equal(C.growth(p, { ladder:'一品 二品' }).people[0].rank, -1, '自定义阶梯');
  const back = new P3(JSON.parse(JSON.stringify(p.toJSON()))); assert.equal(back.progressOf(hero.id).filter(x => x.kind === 'power').length, 3);
  assert.equal(back.progressOf(hero.id).find(x => x.text === '受伤').kind, undefined);
}
console.log('成长提醒通过');

// 设定规则
{
  const C = require('../core/craft.js'), r = C.parseRules('长生诀 第20章前：这时还没人知道\n师兄/师弟：只叫沈兄\n沈砚 第60章起\n血契 第5-10章\n\n//注释行');
  assert.equal(r.length, 4); assert.deepEqual([r[0].from, r[0].to], [1, 19]); assert.deepEqual(r[1].words, ['师兄', '师弟']); assert.equal(r[1].to, Infinity);
  assert.deepEqual([r[2].from, r[2].to], [60, Infinity]); assert.deepEqual([r[3].from, r[3].to], [5, 10]); assert.equal(r[0].note, '这时还没人知道');
  assert.equal(C.ruleHits(r, '他练的是长生诀', 3).length, 1); assert.equal(C.ruleHits(r, '他练的是长生诀', 20).length, 0);
  assert.equal(C.ruleHits(r, '沈砚笑了，师弟师弟', 61).find(h => h.word === '师弟').count, 2); assert.equal(C.ruleHits(r, '血契', 11).length, 0);
  const P = require('../core/store.js'), p = new P({}); const c = p.addChapter('一', '长生诀现世'); p.setRules('长生诀 第2章前：太早');
  assert.ok(C.publishCheck(p, [c], 'plain').some(x => /设定规则/.test(x.text)));
}
console.log('设定规则通过');

// 读者数据导入
{
  const C = require('../core/craft.js');
  const t = '章节\t标题\t阅读人数\t均订\t本章说\n1\t第1章 下山\t12,000\t800\t35\n2\t第2章 雨夜\t9800\t760\t20\n3\t第3章 拜师\t5000\t700\t8\n4\t第4章 比武\t4800\t1.2万\t9';
  const r = C.parseReader(t); assert.deepEqual(r.cols, ['阅读', '订阅', '评论']); assert.equal(r.rows.length, 4); assert.equal(r.rows[0].v['阅读'], 12000); assert.equal(r.rows[3].v['订阅'], 12000);
  const d = C.readerDrops(r, '阅读'); assert.equal(d.drops.length, 1); assert.equal(d.drops[0].no, 3); assert.equal(d.keep, 40);
  const csv = C.parseReader('第1章 下山,1000,50\n第2章 雨夜,600,40'); assert.equal(csv.rows[1].no, 2); assert.equal(csv.rows[1].title, '第2章 雨夜'); assert.equal(csv.cols.length, 2);
  assert.equal(C.parseReader('随便写写'), null);
  const P = require('../core/store.js'), p = new P({}); p.setReader(r); const back = new P(JSON.parse(JSON.stringify(p.toJSON()))); assert.equal(back.data.reader.rows.length, 4);
  assert.equal(new P({ reader:'坏数据' }).data.reader, undefined);
}
console.log('读者数据通过');

{ // 发布前 30 秒自查
  const S = require('../core/store.js'), C = require('../core/craft.js'), assert = require('node:assert/strict');
  const p = new S({ meta:{ title:'书' } }), c = p.addChapter('');
  p.updateChapter(c.id, { text:'他走进门。'.repeat(10) });
  p.addForeshadow({ title:'玉佩', plantedIn:c.id, dueChapter:1 });
  let q = C.quickCheck(p, c.id, 'qidian', []);
  const by = k => q.items.find(x => x.k === k);
  assert.equal(by('title').level, 'warn'); assert.equal(by('hook').level, 'warn'); assert.equal(by('foreshadow').level, 'warn'); assert.equal(by('words').level, 'warn');
  assert.ok(q.ready && q.text.includes('他走进门'));
  p.updateChapter(c.id, { title:'开门', text:'他走进门。'.repeat(500) + '门后竟然站着一个人？' }); p.setRules('玉佩 1-5：第六章才出现'); p.updateChapter(c.id, { text:p.chapter(c.id).text + '玉佩' });
  q = C.quickCheck(p, c.id, 'qidian', []);
  assert.equal(q.items.find(x => x.k === 'rules').level, 'danger'); assert.ok(!q.ready);
  console.log('发布前 30 秒自查通过');
}

{ // 边写边建：新名字
  const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const t = '只听沈星河道：“好！”少年说：“走。”林小凡冷笑道：“你敢？”林小凡道：“来。”他来到青云宗。一个名叫苏青的女子走来。星河道：“嗯”。';
  const r = C.newNames(t, [{ name:'沈星河', aliases:'星河' }], []), names = r.map(x => x.name);
  assert.deepEqual(names.sort(), ['林小凡', '苏青', '青云宗'].sort(), '找出三个新名字，不含已登记的和「少年」');
  assert.equal(r.find(x => x.name === '青云宗').type, 'PLACE');
  assert.ok(!C.newNames(t, [{ name:'沈星河' }], ['林小凡', '苏青', '青云宗']).some(x => /林小凡|苏青|青云宗/.test(x.name)), '忽略过的不再提示');
  console.log('边写边建通过');
}

{ // 写作时间与效率
  const S = require('../core/store.js'), C = require('../core/craft.js'), assert = require('node:assert/strict');
  const p = new S({ meta:{ title:'书' } }), c = p.addChapter('一'), base = new Date(2026, 9, 20, 21, 0, 0).getTime();
  let text = ''; for (let i = 0; i < 31; i++) { text += '风吹过山岗。'; p.updateChapter(c.id, { text, at:base + i * 60000 }); }
  const T = p.data.writing.time, k = Object.keys(T)[0];
  assert.equal(T[k].m, 30, '30 次间隔 1 分钟 = 30 分钟'); assert.ok(T[k].h[21] > 0, '记到 21 点');
  p.data.writing.daily = { '2026-10-20':180 }; p.data.writing.time = { '2026-10-20':{ m:30, h:Object.assign([], { 21:120, 22:60 }) } };
  const s = C.timeStats(p.data.writing, 30, '2026-10-23');
  assert.equal(s.speed, 360); assert.equal(s.bestWin, 21); assert.equal(s.activeDays, 1); assert.ok(s.tips.some(t => /21:00/.test(t)));
  const again = new S(JSON.parse(JSON.stringify(p.data))); assert.ok(again.data.writing.time['2026-10-20'], '保存后读回来还在');
  console.log('写作时间通过');
}

{ // AI 陪写（离线边注）
  const S = require('../core/store.js'), C = require('../core/craft.js'), assert = require('node:assert/strict');
  const p = new S({ meta:{ title:'书' } }), c = p.addChapter('一');
  const flat = Array(20).fill('他走在路上，天气很好，路边有树。'.repeat(2)).join('\n');
  assert.ok(/平稳/.test(C.companion(p, c.id, flat, 0).text), '平淡提醒');
  const talk = Array(6).fill('“你好。”').join('\n');
  assert.ok(/对话/.test(C.companion(p, c.id, talk, 0).text), '连续对话提醒');
  assert.equal(C.companion(p, c.id, talk, 0, ['talk:6']), null, '说过的不重复');
  const m = C.companionMessages(p, c.id, flat); assert.equal(m[0].role, 'system'); assert.ok(m[1].content.length < 1000);
  console.log('AI 陪写通过');
}

{ // 下一章自动预填
  const S = require('../core/store.js'), C = require('../core/craft.js'), assert = require('node:assert/strict');
  const p = new S({ meta:{ title:'书' }, nodes:[{ id:'h', type:'PERSON', name:'林舟' }], relations:[] });
  assert.equal(C.nextPrefill(p), null, '没有章节不预填');
  const c = p.addChapter('雨夜'); p.updateChapter(c.id, { text:'林舟推开门。林舟看见桌上的玉佩，忽然愣住了。', outline:'林舟发现玉佩' });
  p.addForeshadow({ title:'玉佩来历', plantedIn:c.id, dueChapter:2 }); p.addForeshadow({ title:'远期', dueChapter:50 });
  const r = C.nextPrefill(p, c.id);
  assert.equal(r.no, 2); assert.ok(/忽然愣住了/.test(r.outline), '承接上章结尾'); assert.ok(/出场：林舟/.test(r.outline), '出场人物');
  assert.ok(/玉佩来历/.test(r.outline) && !/远期/.test(r.outline), '只提到期伏笔'); assert.ok(/上章细纲：林舟发现玉佩/.test(r.outline)); assert.ok(/章末钩子：$/.test(r.outline));
  console.log('下一章预填通过');
}

{ // 活的设定回声
  const S = require('../core/store.js'), C = require('../core/craft.js'), assert = require('node:assert/strict');
  const p = new S({ meta:{ title:'书' }, nodes:[{ id:'d', type:'ITEM', name:'九转金丹', aliases:'金丹' }, { id:'h', type:'PERSON', name:'林舟' }], relations:[] });
  const a = p.addChapter('一', '林舟得到九转金丹。'), b = p.addChapter('二', '无关。'), c = p.addChapter('三', '');
  const r = C.echoAt(p, c.id, '他摸出金丹', 5);
  assert.equal(r.name, '九转金丹'); assert.equal(r.lastNo, 1); assert.equal(r.lastId, a.id); assert.equal(r.gap, 2);
  assert.equal(C.echoAt(p, c.id, '林舟摸出金丹', 2).name, '林舟', '只看光标前');
  assert.equal(C.echoAt(p, c.id, '风吹过', 3), null);
  console.log('设定回声通过');
}

{ // 断更保险
  const S = require('../core/store.js'), C = require('../core/craft.js'), assert = require('node:assert/strict');
  const p = new S({ meta:{ title:'书' }, nodes:[], relations:[] }); const a = p.addChapter('一', '他走了。'); p.addChapter('二', '');
  const W = p.data.writing; W.goal = 100; W.daily = { '2026-10-20':200, '2026-10-21':300, '2026-10-22':150 };
  let r = C.insurance(p, '2026-10-22'); assert.equal(r.streak, 3); assert.ok(r.need); assert.deepEqual(r.keep, [a.id], '只保有正文的章');
  W.insured = '2026-10-22'; assert.ok(!C.insurance(p, '2026-10-22').need, '一天只保一次');
  r = C.insurance(p, '2026-10-25'); assert.equal(r.missed, 2); assert.ok(!r.need);
  assert.ok(C.insurance(p, '2026-10-23').missed === 0, '昨天写了不算断');
  console.log('断更保险通过');
}

{ // 千章仪式感
  const S = require('../core/store.js'), C = require('../core/craft.js'), assert = require('node:assert/strict');
  const p = new S({ meta:{ title:'书' }, nodes:[{ id:'h', type:'PERSON', name:'林舟' }], relations:[] });
  for (let i = 0; i < 99; i++) p.addChapter('', '林舟走了一步。');
  assert.equal(C.ritual(p, []), null, '99 章不触发');
  p.addChapter('', '雨。'); const r = C.ritual(p, []);
  assert.equal(r.n, 100); assert.equal(r.skin, 'ink'); assert.deepEqual(r.top, ['林舟']); assert.ok(r.words > 500);
  assert.equal(C.ritual(p, [100]), null, '同一档只触发一次');
  console.log('千章仪式感通过');
}

{ // 读者预期雷达
  const S = require('../core/store.js'), C = require('../core/craft.js'), assert = require('node:assert/strict');
  const p = new S({ meta:{ title:'书' }, nodes:[], relations:[] }), pad = '他走在街上，风很大。'.repeat(30);
  const a = p.addChapter('一', '他突破了！众人震惊。' + pad); p.updateChapter(a.id, { expect:'爽' });
  const b = p.addChapter('二', pad + pad + '他突破了！'); p.updateChapter(b.id, { expect:'爽' });
  assert.equal(p.chapter(b.id).expect, '爽'); p.updateChapter(b.id, { expect:'乱' }); assert.equal(p.chapter(b.id).expect, undefined, '非法值清掉');
  p.updateChapter(b.id, { expect:'爽' });
  const r = C.expectRadar(p, b.id); assert.equal(r.base, 1); assert.ok(/晚了 \d+ 字/.test(r.tips.join()), '比自己同类章晚'); assert.notEqual(r.level, 'ok');
  assert.equal(C.expectRadar(p, a.id).level, 'ok');
  assert.equal(new S(JSON.parse(JSON.stringify(p.data))).chapter(b.id).expect, '爽', '存盘后保留');
  assert.equal(C.expectRadar(p, p.addChapter('三', 'x').id), null, '没标不提示');
  console.log('读者预期雷达通过');
}

{ // 文风锚定
  const S = require('../core/store.js'), C = require('../core/craft.js'), assert = require('node:assert/strict');
  const p = new S({ meta:{ title:'书' }, nodes:[], relations:[] }), good = '他推开门。雨落下来。“走吗？”她问。他没答，把伞递过去。'.repeat(20);
  const a = p.addChapter('一', good), b = p.addChapter('二', good);
  const drift = '于是他非常非常愤怒，终于十分痛苦地意识到这一切都很不对，显然他不禁感到无比绝望和特别迷茫的那种很深的情绪，'.repeat(12) + '。';
  const c = p.addChapter('三', drift), r = C.styleDrift(p, c.id);
  assert.deepEqual(r.anchors, [1, 2]); assert.notEqual(r.level, 'ok'); assert.ok(r.tips.some(t => /程度词/.test(t)) && r.tips.some(t => /概括句/.test(t)) && r.tips.some(t => /变长/.test(t)));
  assert.equal(C.styleDrift(p, b.id).level, 'ok');
  p.setStyleAnchors([b.id, 'nope']); assert.deepEqual(p.data.meta.styleAnchors, [b.id]); assert.ok(C.styleDrift(p, c.id).picked);
  p.setStyleAnchors([]); assert.equal(p.data.meta.styleAnchors, undefined);
  assert.equal(C.styleDrift(p, p.addChapter('四', '短').id), null, '不足 500 字不评');
  console.log('文风锚定通过');
}

{ // 工具人预警
  const S = require('../core/store.js'), C = require('../core/craft.js'), assert = require('node:assert/strict');
  const p = new S({ meta:{ title:'书' }, nodes:[{ id:'a', type:'PERSON', name:'林舟' }, { id:'b', type:'PERSON', name:'苏晚' }], relations:[] });
  for (let i = 0; i < 5; i++) p.addChapter('', '林舟说：“走。”林舟转身出门。苏晚在旁边。大家看着苏晚和林舟。');
  const r = C.bystanders(p, 10);
  assert.deepEqual(r.map(x => x.name), ['苏晚'], '只出场不开口的是苏晚'); assert.equal(r[0].acts, 0); assert.equal(r[0].chapters, 5);
  assert.deepEqual(C.bystanders(new S({ meta:{ title:'x' } })), []);
  console.log('工具人预警通过');
}

{ // AI 腔自查
  const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const pad = '他推开门，雨落下来，她把伞递过去。'.repeat(20);
  const r = C.aiTone(pad + '他眼中闪过一丝寒意，嘴角勾起一抹弧度，不禁深吸一口气。她眼中闪过一丝慌乱。');
  assert.equal(r.hits[0].word, '眼中闪过一丝'); assert.equal(r.hits[0].count, 2); assert.ok(!r.hits.some(x => x.word === '闪过一丝'), '长词覆盖短词');
  assert.notEqual(r.level, 'ok'); assert.equal(C.aiTone(pad).level, 'ok'); assert.equal(C.aiTone('短').level, 'wait');
  { const o = C.aiTone(pad + '嘴角勾起一抹弧度。'); assert.ok(o.hits.some(x => x.word === '嘴角勾起一抹') && !o.hits.some(x => x.word === '一抹弧度'), '重叠只算最长'); assert.equal(o.total, 1); }
  console.log('AI 腔自查通过');
}

{ const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const r = C.mobileLayout('短段。\n' + '他走进来。'.repeat(60) + '\n林远道：“走吗？”苏晴说：“走。”林远问：“去哪？”\n“好。”他说。');
  assert.equal(r.walls.length, 1); assert.equal(r.walls[0].index, 4); assert.equal(r.walls[0].count, 300); assert.equal(r.crowd.length, 1); assert.equal(r.crowd[0].count, 3);
  assert.equal(C.mobileLayout('他爱说“差不多”，又说“随便”，还说“都行”。').crowd.length, 0, '术语/反讽引号不算多人对白');
  assert.equal(C.mobileLayout('他走进来。'.repeat(40)).walls.length, 0, '200 字段落不算墙');
  { const many = Array.from({ length:6 }, (_, i) => '他走进来。'.repeat(52 + i)).join('\n'); assert.equal(C.mobileLayout(many).walls.length, 3, '一章最多 3 段'); }
  assert.equal(C.mobileLayout('“好。”他说。').total, 0); console.log('手机排版通过'); }

{ const C = require('../core/craft.js'), S = require('../core/store.js'), assert = require('node:assert/strict');
  // 误报调优回归（fp-report）
  const p = new S({ meta:{ title:'t' }, nodes:[], relations:[] }); const c = p.addChapter('一', '白掌柜满心欢喜道：“好！”白掌柜满心欢喜道：“妙！”小妖道：“大王！”小妖道：“来了！”祝师道：“去吧。”祝师道：“走。”');
  const q = C.canonQueue(p, c.id).filter(x => x.kind === 'new'); assert.ok(!q.some(x => /满心|小妖|祝师/.test(x.name)), '成语/泛称不当新名字：' + JSON.stringify(q.map(x => x.name)));
  const c2 = p.addChapter('二', '韩立道：“走。”韩立道：“快。”'); assert.ok(C.canonQueue(p, c2.id).filter(x => x.kind === 'new').every(x => x.conf !== 'high'), '只靠 X道 认出的名字不算高把握');
  const e = p.addEntity({ name:'林远', aliases:['阿远', '小林'] }); assert.equal(e.aliases, '阿远、小林', 'addEntity 保留别名'); assert.equal(p.addEntity({ name:'苏晴', aliases:'晴儿' }).aliases, '晴儿');
  const lx = '华老栓。'.repeat(6) + '他把钱给老栓，又对老栓说。' + '一九二〇年七月。七斤来了。'.repeat(1) + '这是闲话。'.repeat(300);
  const sus = C.scan(lx, [{ id:'a', name:'华老栓' }, { id:'b', name:'七斤' }]).suspects.map(x => x.word); assert.ok(!sus.includes('给老栓') && !sus.includes('对老栓') && !sus.includes('七月'), '介词+省姓名、日期不算错名：' + sus);
  const sus2 = C.scan('祥林嫂。'.repeat(8) + '样林嫂来了。' + '闲话。'.repeat(500), [{ id:'a', name:'祥林嫂' }]).suspects.map(x => x.word); assert.ok(sus2.includes('样林嫂'), '真错字仍报');
  assert.equal(C.scan('因为他去。'.repeat(30) + '的。'.repeat(500), []).repeats.length, 0, '常用词不算高频重复');
  assert.equal(C.sceneBreaks('他睡了。\n第二天他醒来。').hits.length, 0, '第二天另起一段是正常写法');
  assert.equal(C.aiTone('他不禁笑了。' + '闲话。'.repeat(200)).hits.length, 0, '孤零零一个不禁不算 AI 腔');
  assert.equal(C.tellEmotion('他很高兴，跳了起来。').hits.length, 0, '情绪后紧跟动作不报');
  assert.equal(C.longSent('他' + '走了一步，'.repeat(19) + '停下。').hits.length, 0, '逗号多的长句放宽到 120 字');
  console.log('误报调优回归通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const r = C.punct('他来了,她走了。这里???再写。好！！！真的？？！【待补：打斗】');
  assert.deepEqual(r.holes.map(x => x.word).sort(), ['???', '【待补：打斗】'].sort()); assert.equal(r.half[0].word, '了,'); assert.ok(r.pile.some(x => x.word === '！！！'));
  assert.equal(C.punct('“好。”他说，“走吧！”').total, 0);
  const S = require('../core/store.js'); const p = new (S.QZStore || S)({ project_id:'t', meta:{}, nodes:[], relations:[] }, 't'); const c = p.addChapter('一', '正文TODO'); const q = C.quickCheck(p, c.id, 'plain');
  assert.equal(q.items.find(x => x.k === 'hole').level, 'danger'); console.log('标点与占位符通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict'); const pad = '他走了很久。'.repeat(15);
  assert.equal(C.opening('那天阳光很好。林小满今年十七岁。她住在城外。' + pad).level, 'danger');
  const g = C.opening('“你还有三天可活。”医生说。为什么是我？' + pad); assert.equal(g.level, 'ok'); assert.equal(g.sents.length, 3);
  assert.equal(C.opening('短').level, 'wait'); console.log('开头三行通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict'); const third = '他推开门。\n她看了他一眼。\n“我不去。”她说。\n他笑了。\n她转身。\n';
  const r = C.povSlip(third + '我心里一沉，他怎么来了。\n他坐下。\n她倒茶。'); assert.equal(r.hits.length, 1); assert.ok(r.hits[0].word.startsWith('我心里'));
  assert.equal(C.povSlip(third).hits.length, 0, '引号内的我不算'); assert.equal(C.povSlip('我走。\n我看他。\n我想。\n我笑。\n我睡。').hits.length, 0, '第一人称不报');
  assert.equal(C.povSlip(third + '我们走吧，他想。').hits.length, 0); console.log('人称跳跃通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const o = C.opening('星河道：「我要兵器。」掌柜慌了。他取出鐵劍。' + '他走了很久。'.repeat(15)); assert.equal(o.sents.length, 3); assert.ok(o.sents.every(x => x.length > 1)); assert.ok(o.talk); console.log('开头三行「」通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const dump = '这个世界的修炼被称为炼气，共分为九重境界，据说千年前曾有人突破第十重，' + '但再也没有人见过他。'.repeat(6);
  const r = C.infodump('他推门。\n' + dump + '\n“炼气分为九重。”师父说，' + '他点头。'.repeat(20)); assert.equal(r.hits.length, 1); assert.ok(r.hits[0].marks.includes('被称为')); assert.equal(r.hits[0].index, 5);
  console.log('设定说明段通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const t = '“走吧。”他说。“去哪？”她问道。“城外。”他说。“好。”她说。“快点。”他道。“嗯。”她说。“到了。”他说道。';
  const r = C.dialogTags(t); assert.equal(r.quotes, 7); assert.equal(r.level, 'warn'); assert.equal(r.hits[0].word, '说'); assert.equal(t.substr(r.hits[0].index, 1), '说');
  assert.equal(C.dialogTags('“走吧。”他把剑插回鞘里。“去哪？”她没抬头。').level, 'ok'); console.log('对话标签通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const r = C.sceneBreaks('他睡了。\n第二天，雨停了。\n\n三天后，城破。\n***\n与此同时，京城。\n她笑了。\n半个月后他回来。');
  assert.deepEqual(r.hits.map(x => x.word), ['半个月后']); assert.equal(r.hits[0].index, r.hits[0].index); console.log('场景切换通过'); } /* 第二天/次日 另起一段是常规写法，不再报 */

{ const C = require('../core/craft.js'), assert = require('node:assert/strict'), S = require('../core/store.js');
  const p = new (S.QZStore || S)({ project_id:'t', meta:{}, nodes:[], relations:[] }, 't');
  const a = p.addChapter('第1章 夜探藏经阁', 'x'); p.addChapter('第5章 夜探藏经阁', 'x'); p.addChapter('第9章 再探藏经阁', 'x'); p.addChapter('第3章 下山', 'x');
  const r = C.titleClash(p, a.id); assert.equal(r.length, 2); assert.equal(r[0].sim, 1); assert.equal(r[0].no, 2); assert.ok(r[1].sim >= 0.5 && r[1].sim < 1);
  assert.equal(C.titleClash(p, p.chapters()[3].id).length, 0); console.log('标题撞车通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const long = '他拖着那条受伤的腿一路从城南的旧码头走到城北的破庙，路上经过了三座桥、两条街和一片早已荒废的菜地，雨一直下个不停，他却始终没有停下来歇一歇脚。';
  const r = C.longSent('他来了。' + long + '她笑。'); assert.equal(r.hits.length, 1); assert.equal(r.hits[0].index, 4); assert.ok(r.hits[0].count >= 70);
  assert.equal(C.longSent('他来了。她笑了。').hits.length, 0); console.log('超长句通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const r = C.tellEmotion('他很生气。她感到害怕，他很生气地走了。“我很开心。”她说。');
  assert.equal(r.total, 3); assert.equal(r.hits[0].word, '很生气'); assert.equal(r.hits[0].count, 2); assert.ok(!r.hits.some(x => x.word === '很开心'), '对白里不算');
  console.log('情绪直给通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const r = C.routine('他醒来，起床洗漱，吃完早饭就出门了。'); assert.equal(r.level, 'warn'); assert.deepEqual(r.hits.map(x => x.word), ['醒来', '起床', '洗漱', '吃完早饭', '出门']);
  assert.ok(!r.hits.some(x => x.word === '吃早饭'), '长词覆盖短词'); assert.equal(C.routine('他醒来，发现屋里多了一个人。').level, 'ok'); console.log('流水账通过'); }

{ const C = require('../core/craft.js'), assert = require('node:assert/strict');
  const r = C.sameStart('雨停了。他推开门。他走进屋。他坐下。他倒了杯茶。窗外有狗叫。');
  assert.equal(r.hits.length, 1); assert.equal(r.hits[0].count, 4); assert.equal(r.hits[0].index, 4); assert.equal(r.hits[0].word, '「他」开头');
  assert.equal(C.sameStart('他推开门。她走进屋。他坐下。她倒茶。').hits.length, 0); console.log('句首重复通过'); }
{ // 入正典队列
  const P = new Project({});
  {
    const a = P.addEntity({ name:'林远', type:'PERSON' }), c1 = P.addChapter('一'), c2 = P.addChapter('二');
    P.updateChapter(c1.id, { text:'林远战死了。' }); P.addProgress(a.id, { chapterId:c1.id, text:'战死', dead:true });
    P.updateChapter(c2.id, { text:'苏晴道：“走。”苏晴道：“快。”店小二道：“客官。”店小二道：“慢走。”林远推门进来。他仿佛看见赵三死了。' });
    const q = C.canonQueue(P, c2.id);
    assert.ok(q.some(x => x.kind === 'new' && x.name === '苏晴'), 'canon new name');
    assert.ok(!q.some(x => x.name === '店小二'), 'canon generic skipped');
    assert.ok(q[0].kind === 'conflict' && q[0].src === 1, 'canon conflict with source');
    { const Z = new Project({}), z = Z.addEntity({ name:'王五', type:'PERSON' }), d1 = Z.addChapter('一'), d2 = Z.addChapter('二');
      for (const w of ['当场死亡', '殒命', '毙命', '气绝身亡']) { Z.updateChapter(d1.id, { text:'城门下，王五' + w + '。' }); assert.ok(C.canonQueue(Z, d1.id).some(x => x.kind === 'state' && x.id === z.id && /死亡/.test(x.text)), '死亡词：' + w); }
      Z.addProgress(z.id, { chapterId:d1.id, text:'死亡', dead:true }); Z.updateChapter(d2.id, { text:'王五推门进来。众人一惊。王五笑着坐下。' });
      const cf = C.canonQueue(Z, d2.id).filter(x => x.kind === 'conflict'); assert.equal(cf.length, 1, '死后出场归成一条冲突'); assert.equal(cf[0].hits.length, 2, '每一句都单独列出'); assert.ok(/2 处/.test(cf[0].text)); }
    P.canonMark(q[0].key, 'intended', '诈尸'); assert.ok(!C.canonQueue(P, c2.id).some(x => x.key === q[0].key), 'canon intended never re-pops');
  }
}
console.log('入正典队列通过');
{ // 预填细纲不套娃、旧细纲安全清理、存稿口径、浏览器回收站
  const P = new Project({ chapters:[{ id:'c1', title:'一', text:'他走了。', order:0, outline:'上章细纲：承接上章结尾：上章细纲：xx\n主角夺剑\n本章冲突：\n章末钩子：\n本章冲突：师徒反目' }] });
  assert.equal(P.chapter('c1').outline, '主角夺剑\n本章冲突：师徒反目', '只删空模板行和套娃行，作者写的不动');
  const pf = C.nextPrefill(P, 'c1'); assert.ok(pf.outline.includes('上章细纲：主角夺剑') && !/上章细纲：(承接|上章)/.test(pf.outline), '预填只取真细纲');
  assert.equal(new Project({ chapters:[{ id:'c', title:'x', text:'', order:0, outline:'本章冲突：\n章末钩子：' }] }).chapter('c').outline, '本章冲突：\n章末钩子：', '没被污染的空模板行保留，刷新后还在');
  const Q = new Project({}); Q.addChapter('一', '短'); const k = Q.addChapter('二', '字'.repeat(600));
  const st = C.stock(Q); assert.equal(st.stock, 1); assert.equal(st.unpub, 2); assert.equal(st.notCounted, 1);
  const S = require('../core/storage.js'), mem = {}, ls = { getItem:x => x in mem ? mem[x] : null, setItem:(x, v) => { mem[x] = String(v); }, removeItem:x => { delete mem[x]; }, key:i => Object.keys(mem)[i], get length() { return Object.keys(mem).length; } };
  const s = new S({ localStorage:ls });
  s.save('bk', { project_id:'bk', meta:{ title:'甲' }, nodes:[], relations:[] }).then(() => s.trash('bk')).then(() => s.list()).then(l => { assert.equal(l.length, 0, '删除后不在书单');
    return s.trashList(); }).then(t => { assert.equal(t[0].title, '甲'); return s.restore(t[0]); }).then(id => s.list()).then(l => { assert.equal(l[0].title, '甲', '恢复回来'); console.log('删除到回收站与恢复通过'); })
    .catch(e => { console.error(e); process.exitCode = 1; });
  // 空格名字
  const R = new Project({}); R.addEntity({ name:'林远', type:'PERSON' }); assert.ok(C.scan('林 远道：“嗯。”', R.data.nodes, [], {}).suspects.some(x => x.word === '林 远'));
  console.log('预填细纲、存稿口径、空格名字通过');
}
{ const P = new Project({}); P.addChapter('第一章', ''); const m = P.importText('第1章 起\n内容一\n第2章 承\n内容二');
  assert.equal(P.chapters().length, 2, '导入时去掉空的默认第一章'); assert.equal(m.length, 2);
  const Q = new Project({}); Q.addChapter('第一章', '有字'); Q.importText('第1章 起\n内容'); assert.equal(Q.chapters().length, 2, '有内容的不动');
  const R = new Project({}); for (let i = 0; i < 5; i++) R.addChapter('c' + i, '甲'.repeat(100)); assert.deepEqual(R.searchCount('甲'), { total:500, chapters:5 });
  console.log('导入去空章、搜索精确计数通过'); }

{ // 轻打扰——删章进章节回收站可恢复、删除可整本回滚、故意这样写可撤销
  const P = new Project({}), a = P.addChapter('一', '甲'), b = P.addChapter('二', '乙'); P.addChapter('三', '丙');
  P.removeChapter(b.id); assert.equal(P.chapters().length, 2); const Q = new Project(JSON.parse(JSON.stringify(P.toJSON())));
  assert.equal(Q.data.chapterTrash.length, 1, '章节回收站随书保存'); assert.ok(Q.restoreChapter(b.id)); assert.deepEqual(Q.chapters().map(c => c.text), ['甲', '乙', '丙'], '恢复到原位置');
  assert.equal(Q.restoreChapter(b.id), null, '不会恢复两次');
  const e = Q.addEntity({ name:'林远', type:'PERSON' }), snap = Q.checkpoint(); Q.removeEntity(e.id); assert.ok(!Q.entity(e.id)); Q.rollback(snap); assert.ok(Q.entity(e.id), '删除可撤销');
  Q.canonMark('k1', 'intended', ''); assert.ok(Q.canonNote('k1', '后文解释')); assert.equal(Q.data.writing.canonDismiss.k1.note, '后文解释'); assert.ok(Q.canonUnmark('k1')); assert.ok(!Q.data.writing.canonDismiss.k1);
}
