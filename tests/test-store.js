'use strict';
/* 数据层：旧作品兼容、未知字段保留、章节/设定/关系/对话的增删改。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Project = require('../core/store.js');
const root = path.join(__dirname, '..');

// 1) 旧格式（manuscript.files 按偏移切章）能迁移为独立章节，原字段一个不丢
const legacy = { format_version:2, project_id:'legacy', meta:{ title:'旧书', custom:'keep' }, futureField:{ x:1 },
  nodes:[{ id:'A', name:'阿青', type:'PERSON', summary:'剑客', weird:[1, 2] }, { id:'B', name:'城', type:'PLACE' }],
  relations:[{ source:'A', target:'B', label:'住在' }, { source:'A', target:'GHOST', label:'悬空' }],
  manuscript:{ files:[{ id:'f1', name:'书.txt', text:'第一章 开端\n雨夜。\n第二章 远行\n出城。', chapters:[
    { id:'c1', title:'第一章 开端', start:0, end:11, order:0 }, { id:'c2', title:'第二章 远行', start:11, end:21, order:1 }] }], facts:[{ id:'x' }] },
  batches:[{ id:'old' }] };
const p = new Project(legacy);
assert.equal(p.title, '旧书');
assert.deepEqual(p.chapters().map(c => c.title), ['第一章 开端', '第二章 远行']);
assert.equal(p.chapters()[0].text, '雨夜。', '去掉与标题重复的首行');
assert.equal(p.chapters()[1].text, '出城。');
assert.equal(p.data.relations.length, 1, '指向不存在节点的关系被过滤');
const out = p.toJSON();
assert.equal(out.meta.custom, 'keep'); assert.deepEqual(out.futureField, { x:1 }); assert.deepEqual(out.batches, [{ id:'old' }]);
assert.deepEqual(out.nodes[0].weird, [1, 2]); assert.deepEqual(out.manuscript.facts, [{ id:'x' }]);
assert.ok(Array.isArray(out.nodes) && Array.isArray(out.relations) && out.project_id === 'legacy', '满足本地服务的保存校验');
assert.equal(legacy.chapters, undefined, '不改动传入对象');
// 再次载入不会重复迁移
assert.equal(new Project(out).chapters().length, 2);

// 2) 真实作品与演示书都能载入
for (const f of ['data/projects/workspace.json', 'tests/fixtures/demo-book.json']) {
  const file = path.join(root, f);
  if (!fs.existsSync(file)) { console.log('  （跳过不存在的 ' + f + '）'); continue; }
  const q = new Project(JSON.parse(fs.readFileSync(file, 'utf8')));
  assert.ok(q.title, f + ' 有书名');
  if (!f.includes('workspace')) assert.ok(q.data.nodes.length > 0, f + ' 有设定');
  if (f.includes('demo')) assert.ok(q.chapters().length > 0 && q.stats().words > 0, f + ' 有正文');
}

// 旧格式：正文放在 manuscript.files 里、按偏移切章，载入时自动拆成章节
{
  const text = '# 第一章\n山雾。\n# 第二章\n剑鸣。';
  const old = new Project({ meta:{ title:'旧格式' }, nodes:[{ id:'A', name:'甲', type:'PERSON' }], manuscript:{ files:[{ id:'f1', name:'稿.md', text,
    chapters:[{ id:'c1', title:'第一章', start:0, end:9, order:0 }, { id:'c2', title:'第二章', start:9, end:text.length, order:1 }] }] } });
  assert.equal(old.chapters().length, 2, '旧 manuscript 拆成两章');
  assert.ok(/山雾/.test(old.chapters()[0].text) && /剑鸣/.test(old.chapters()[1].text), '旧 manuscript 正文按偏移拆分');
}

// 3) 章节
const b = new Project({ meta:{ title:'新书' } });
let changes = 0; b.onChange(() => changes++);
const c1 = b.addChapter('甲'), c2 = b.addChapter('乙');
b.updateChapter(c1.id, { text:'一二三 abc' });
assert.equal(Project.countWords('一二三 abc'), 4);
b.moveChapter(c2.id, -1); assert.deepEqual(b.chapters().map(c => c.title), ['乙', '甲']);
b.removeChapter(c2.id); assert.equal(b.chapters().length, 1);
const added = b.importText('# 第一章\n内容一\n# 第二章\n内容二');
assert.equal(added.length, 2); assert.equal(b.chapters()[2].text, '内容二');
assert.equal(b.importText('第1章 起\n甲\n第2章 承\n乙').length, 2);
assert.ok(changes >= 5);

// 4) 设定、关系、对话
const e1 = b.addEntity({ name:'林舟', type:'PERSON', summary:'少年' }), e2 = b.addEntity({ name:'灯塔', type:'PLACE' });
assert.equal(b.entities({ q:'林' }).length, 1); assert.equal(b.entities({ type:'PLACE' })[0].id, e2.id);
b.addRelation(e1.id, e2.id, '守护'); assert.equal(b.relationsOf(e1.id).length, 1);
b.addMessage(e1.id, 'user', '你好'); b.addMessage(e1.id, 'assistant', '嗯。');
assert.equal(b.chat(e1.id).messages.length, 2);
b.clearChat(e1.id); assert.equal(b.chat(e1.id).messages.length, 0);
b.addMessage(e1.id, 'user', '再见');
b.removeEntity(e1.id);
assert.equal(b.data.relations.length, 0, '删除设定连带删除关系'); assert.equal(b.chat(e1.id), null, '连带删除对话');
b.updateEntity(e2.id, { name:'旧灯塔' }); assert.equal(b.entity(e2.id).name, '旧灯塔');
console.log('数据层：旧作品迁移、未知字段保留、章节/设定/关系/对话通过');

// 历史稿、全书搜索替换
{
  const p = new Project({}); const a = p.addChapter('一', '林周拔剑。\n林周大笑。'), b = p.addChapter('二', '林周走了。');
  p.updateChapter(a.id, { text:'林周拔剑。\n林周大笑。\n新的一段。' });
  assert.equal(p.history(a.id).length, 1, '第一次改动前自动存档');
  p.updateChapter(a.id, { text:'再改一次' });
  assert.equal(p.history(a.id).length, 1, '10 分钟内不重复自动存档');
  assert.equal(p.search('林周').length, 1);
  assert.equal(p.search('林周')[0].no, 2);
  const n = p.replaceAll('林周', '林舟'); assert.equal(n, 1);
  assert.equal(p.chapter(b.id).text, '林舟走了。'); assert.equal(p.chapter(b.id).history[0].text, '林周走了。');
  const h = p.history(b.id)[0]; p.restore(b.id, h.at); assert.equal(p.chapter(b.id).text, '林周走了。');
  assert.ok(p.history(b.id).some(x => x.text === '林舟走了。'), '恢复前的版本也留着');
  const d0 = p.data.writing.daily, before = JSON.stringify(d0); p.restore(b.id, p.history(b.id)[0].at); assert.equal(JSON.stringify(p.data.writing.daily), before, '恢复不计字数');
  for (let i = 0; i < 30; i++) { p.updateChapter(b.id, { text:'v' + i, silent:true }); p.snapshot(b.id, 's'); }
  assert.ok(p.chapter(b.id).history.length <= 15, '最多 15 份');
  const back = new Project(JSON.parse(JSON.stringify(p.toJSON()))); assert.equal(back.history(b.id).length, p.history(b.id).length, '历史稿能存能读');
  const C = require('../core/craft.js');
  const df = C.diffParas('甲\n乙\n丙', '甲\n丙\n丁'); assert.deepEqual(df.map(x => x.t + x.s), ['=甲', '-乙', '=丙', '+丁']);
}
console.log('历史稿、搜索替换通过');

// 章节模板
{
  const p = new Project({}); const t = p.addTemplate(' 我的爽点 ', '压\n爆'); assert.equal(p.templates().length, 1); assert.equal(t.name, '我的爽点');
  const back = new Project(JSON.parse(JSON.stringify(p.toJSON()))); assert.equal(back.templates()[0].outline, '压\n爆');
  p.removeTemplate(t.id); assert.equal(p.templates().length, 0);
  assert.ok(require('../core/craft.js').TEMPLATES.length >= 5);
}
console.log('章节模板通过');
{
  const p = new Project({}); const c = p.addChapter('一', 'A稿');
  const b = p.addBranch(c.id, '方案B', 'B稿'); p.addBranch(c.id, '');
  assert.equal(p.branches(c.id).length, 2); assert.equal(p.branches(c.id)[1].name, '分支 2'); assert.equal(p.branches(c.id)[1].text, 'A稿');
  p.switchBranch(c.id, b.id, '原稿');
  assert.equal(p.chapter(c.id).text, 'B稿'); assert.equal(p.chapter(c.id).activeBranch, '方案B'); assert.equal(p.branches(c.id)[0].text, 'A稿'); assert.equal(p.branches(c.id)[0].name, '原稿');
  assert.ok(p.history(c.id).some(h => h.text === 'A稿'));
  const back = new Project(JSON.parse(JSON.stringify(p.toJSON()))); assert.equal(back.branches(c.id).length, 2);
  p.removeBranch(c.id, b.id); assert.equal(p.branches(c.id).length, 1);
}
console.log('情节分支通过');

// 素材墙
{
  const p = new Project({});
  const c = p.addChapter('第一章', '林舟推门。'), n = p.addEntity({ name:'林舟', type:'PERSON' });
  const a = p.addNote('#反派 他笑的时候从不露牙', [n.id]), b = p.addNote('雨夜的桥段 #氛围 #反派', [c.id]); p.addNote('无挂接');
  assert.equal(p.notes().length, 3); assert.equal(p.notes({ tag:'反派' }).length, 2); assert.equal(p.notes({ link:c.id })[0].id, b.id);
  assert.deepEqual(p.noteTags()[0], ['反派', 2]); assert.equal(p.notes({ q:'雨夜' }).length, 1);
  p.updateNote(a.id, { pinned:true }); assert.equal(p.notes()[0].id, a.id, '置顶排最前');
  p.linkNote(a.id, c.id); assert.equal(p.notes({ link:c.id }).length, 2); p.linkNote(a.id, c.id); assert.equal(p.notes({ link:c.id }).length, 1);
  p.removeNote(b.id); assert.equal(p.notes().length, 2);
  const back = new Project(JSON.parse(JSON.stringify(p.toJSON()))); assert.equal(back.notes()[0].pinned, true);
  assert.equal(new Project({ notes:[{ id:'x', text:1 }, null] }).notes()[0].text, '1', '旧数据兼容');
  assert.equal(new Project({}).data.notes, undefined, '没用过素材墙不加字段');
}
console.log('素材墙通过');
