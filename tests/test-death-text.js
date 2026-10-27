#!/usr/bin/env node
/* 正文写了「当场死亡」但人物卡没记：之后出场要降一级提示；作者把那句标为忽略后不再提示 */
'use strict';
const assert = require('node:assert');
const S = require('../core/store.js'), C = require('../core/craft.js');
const p = new S({ project_id:'t', meta:{ title:'t' }, nodes:[{ id:'n1', type:'PERSON', name:'林云锋' }], relations:[] }, 't');
const c1 = p.addChapter('一', '林云锋当场死亡。'); for (let i = 2; i < 9; i++) p.addChapter(String(i), '风吹过。');
const c9 = p.addChapter('九', '林云锋推门进来，笑了笑。');
const q1 = C.canonQueue(p, c1.id); assert.ok(q1.some(x => x.kind === 'state' && x.sub === 'dead'), '第 1 章应建议记为死亡');
const q9 = C.canonQueue(p, c9.id), cf = q9.find(x => x.kind === 'conflict');
assert.ok(cf && cf.soft && cf.src === 1 && /人物卡还没记/.test(cf.text), JSON.stringify(q9));
p.canonMark(q1.find(x => x.sub === 'dead').key, 'ignore');
assert.ok(!C.canonQueue(p, c9.id).some(x => x.kind === 'conflict'), '忽略后不应再报');
const p2 = new S({ project_id:'t2', meta:{ title:'t' }, nodes:[{ id:'n1', type:'PERSON', name:'林云锋' }], relations:[] }, 't2');
p2.addChapter('一', '“林云锋死了？”众人不信。'); const d = p2.addChapter('二', '林云锋来了。');
assert.ok(!C.canonQueue(p2, d.id).some(x => x.kind === 'conflict'), '对白里的传闻不算死亡');
console.log('正文死亡检测测试通过');
