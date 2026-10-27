#!/usr/bin/env node
/* i18n：词典、术语表、t(tpl, vars) 插值、整句模板匹配、AI 回复语言跟随界面 */
'use strict';
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const i18nSource = fs.readFileSync(path.join(__dirname, '..', 'ui', 'i18n.js'), 'utf8');
function isolatedLanguage(initial, options = {}) {
  const values = { ...initial }, writes = [];
  let reloads = 0;
  const context = {
    document: { documentElement: { lang:'zh-CN' }, addEventListener() {}, title:'' },
    MutationObserver: function () { this.observe = () => {}; },
    location: { reload() { reloads++; } },
  };
  if (!options.noStorage) context.localStorage = {
    getItem(key) {
      if (options.blockReads) throw new Error('fixture storage unavailable');
      return Object.hasOwn(values, key) ? values[key] : null;
    },
    setItem(key, value) { writes.push([key, value]); values[key] = String(value); },
  };
  context.window = context; context.self = context;
  vm.runInNewContext(i18nSource, context, { filename:'ui/i18n.js' });
  return { api:context.QZI18N, htmlLang:context.document.documentElement.lang, values, writes, reloads:() => reloads };
}
for (const [label, values, options, language] of [
  ['fresh browser', {}, {}, 'zh'],
  ['saved English', { 'qianzhang:lang':'en' }, {}, 'en'],
  ['saved Chinese', { 'qianzhang:lang':'zh' }, {}, 'zh'],
  ['legacy Chinese', { 'canongraph:lang':'zh' }, {}, 'zh'],
  ['legacy English', { 'canongraph:lang':'en' }, {}, 'en'],
  ['current choice takes priority', { 'qianzhang:lang':'en', 'canongraph:lang':'zh' }, {}, 'en'],
  ['unknown preference', { 'qianzhang:lang':'fr' }, {}, 'zh'],
  ['empty preference', { 'qianzhang:lang':'' }, {}, 'zh'],
  ['blocked storage', {}, { blockReads:true }, 'zh'],
  ['unavailable storage', {}, { noStorage:true }, 'zh'],
]) {
  const result = isolatedLanguage(values, options);
  assert.strictEqual(result.api.lang(), language, label);
  assert.strictEqual(result.htmlLang, language === 'zh' ? 'zh-CN' : 'en', label + ' HTML language');
  assert.strictEqual(result.api.t('撤销'), language === 'zh' ? '撤销' : 'Undo', label + ' visible translation');
  assert.strictEqual(result.writes.length, 0, label + ' must not overwrite language preferences');
}
const switchLanguage = isolatedLanguage({});
switchLanguage.api.set('zh');
assert.deepStrictEqual(switchLanguage.writes, [['qianzhang:lang', 'zh']]);
assert.strictEqual(switchLanguage.reloads(), 1, 'language switch reloads once');
assert.strictEqual(isolatedLanguage(switchLanguage.values).api.lang(), 'zh', 'Chinese remains available after switching');

global.localStorage = { getItem: () => 'en', setItem() {} };
global.window = global; global.self = global;
global.document = { documentElement: {}, addEventListener() {}, title: '' };
global.MutationObserver = function () { this.observe = () => {}; };
require(path.join(__dirname, '..', 'ui', 'i18n.js'));
const { t } = QZI18N;
assert.strictEqual(t('入正典'), 'Add to canon');
assert.strictEqual(t('撤销'), 'Undo');
assert.strictEqual(t('已移进回收站：《{title}》', { title: 'X' }), 'Moved to Trash: «X»');
assert.ok(!/[\u4e00-\u9fff]/.test(t('已移进回收站：《青崖》').replace('青崖', '')), t('已移进回收站：《青崖》'));
for (const [zh, en] of QZI18N.templates) assert.strictEqual(t(zh, {}), en, zh);
QZI18N._setLang('zh');
assert.strictEqual(t('已移进回收站：《{title}》', { title: 'X' }), '已移进回收站：《X》');
assert.strictEqual(t('撤销'), '撤销');
const AI = require(path.join(__dirname, '..', 'core', 'ai.js'));
const m = [{ role: 'system', content: '你是编辑' }, { role: 'user', content: 'hi' }];
assert.strictEqual(AI.withLang(m, 'zh'), m);
const e = AI.withLang(m, 'en');
assert.ok(/Reply in English/.test(e[0].content) && m[0].content === '你是编辑');
assert.ok(/Reply in English/.test(AI.withLang([{ role: 'user', content: 'x' }], 'en')[0].content));
console.log('i18n 测试通过');
