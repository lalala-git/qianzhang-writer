#!/usr/bin/env node
/* 别名映射回归：tests/fixtures/alias-cases.json（29 例） */
'use strict';
const assert = require('node:assert');
const path = require('node:path');
const C = require(path.join(__dirname, '..', 'core', 'craft.js'));
const { cases } = require('./fixtures/alias-cases.json');
const fails = [];
for (const k of cases) {
  const ctx = { canon:k.canon, aliases:k.aliases || {}, marks:k.marks || {} }, e = k.expect;
  try {
    if (k.op) {
      const r = C.aliasReplace(k.text, k.op, ctx);
      if (e.refuse) assert.ok(r.refused && r.text === k.text, 'should refuse');
      if (e.text !== undefined) assert.strictEqual(r.text, e.text);
      if (e.changes !== undefined) assert.strictEqual(r.changes.length, e.changes);
      if (e.preview) { const p = C.aliasPreview([{ id:'c1', no:1, text:k.text }], k.op, ctx); assert.strictEqual(p.count, e.preview.count); assert.strictEqual(p.groupBy, e.preview.groupBy); }
      if (e.afterReplace) assert.ok(!C.aliasSuggest(ctx, r.text).some(x => x.name === k.op.from), 'after replace still flagged');
    } else {
      const s = C.aliasSuggest(ctx, k.text);
      if (e.nosuggest) assert.ok(!s.some(x => x.name === e.nosuggest), 'unexpected ' + JSON.stringify(s));
      if (e.suggest) {
        const g = e.suggest, hit = s.find(x => x.kind === g.kind && x.name === g.name && JSON.stringify(x.target) === JSON.stringify(g.target));
        assert.ok(hit, 'missing ' + JSON.stringify(g) + ' got ' + JSON.stringify(s));
        if (g.confidence) assert.strictEqual(hit.confidence, g.confidence);
        assert.ok(hit.at.every(a => k.text.substr(a, g.name.length) === g.name), 'bad offset');
      }
    }
  } catch (err) { fails.push(k.id + ': ' + err.message); }
}
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
console.log('别名用例 ' + cases.length + ' 条全部通过');
