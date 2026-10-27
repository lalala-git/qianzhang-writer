'use strict';
/* 每个前端/核心/服务脚本都必须能解析：一个语法错会让整个页面静悄悄地失效。 */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
let n = 0;
for (const dir of ['core', 'ui', 'server', 'tools/pack']) {
  const d = path.join(__dirname, '..', dir); if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(d, f), 'utf8').replace(/^#!.*/, '');
    try { new vm.Script(src, { filename:dir + '/' + f }); n++; } catch (e) { console.error('语法错误：' + dir + '/' + f + '：' + e.message); process.exitCode = 1; }
  }
}
if (!process.exitCode) console.log('脚本语法检查通过（' + n + ' 个文件）');
