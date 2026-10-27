#!/usr/bin/env node
/* 运行 tests/ 下全部 test-*.js。在仓库根目录执行：node tests/run-all.js [关键字] */
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const only = process.argv[2];
const files = fs.readdirSync(__dirname).filter(f => /^test-.*\.js$/.test(f) && (!only || f.includes(only))).sort();
const failed = [];
const t0 = Date.now();
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { cwd: root, encoding: 'utf8', timeout: 120000 });
  const ok = r.status === 0;
  console.log((ok ? '  通过  ' : '  失败  ') + f);
  if (!ok) { failed.push(f); console.log(((r.stdout || '') + (r.stderr || '')).split('\n').slice(-25).join('\n')); }
}
console.log('\n共 ' + files.length + ' 个测试文件：通过 ' + (files.length - failed.length) + '，失败 ' + failed.length + '（' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒）');
if (failed.length) { console.log('失败：' + failed.join('、')); process.exit(1); }
