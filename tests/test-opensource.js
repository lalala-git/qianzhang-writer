#!/usr/bin/env node
/* 发布检查：不附 LICENSE 与许可/版权声明、README 无本机路径、不附带第三方作品示例、CI、作品与备份不进仓库/exe、代码里没有密钥 */
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
assert.ok(!fs.existsSync(path.join(root, 'LICENSE')), '暂不授予许可：不应有 LICENSE');
for (const f of ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md']) assert.ok(!/\bMIT\b|licen[cs]e|copyright|all rights reserved|版权|许可/i.test(rd(f)), f + ' 不应出现许可或版权声明');
const readme = rd('README.md').replace(/\r\n/g, '\n');
assert.ok(!/(?:\b[A-Za-z]:[\\/]|\/(?:home|Users)\/)/.test(readme), 'README 有本机路径');
assert.ok(/## English/.test(readme));
/* 不附带第三方作品示例；文档里不留旧项目名、外部参考链接或开发过程记录 */
assert.ok(!fs.existsSync(path.join(root, 'examples')), '不应再附带 examples/');
for (const f of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'docs/pain-points.md']) {
  const t = rd(f);
  assert.ok(!/西游记|Journey to the West|wikisource|CanonGraph|公开设计参考|第\s*\d+\s*轮/i.test(t), f + ' 含已移除的内容');
}
/* 未签名、SmartScreen、平台与 AI 服务验证范围要说清楚 */
assert.ok(/SmartScreen/.test(readme) && /仍要运行/.test(readme) && /Run anyway/.test(readme) && /代码签名/.test(readme) && /code-signed|code signing/i.test(readme), 'README 应说明未签名与 SmartScreen');
assert.ok(/真实的 macOS 或 Linux 桌面硬件/.test(readme) && /real macOS or Linux desktop hardware/.test(readme) && /真实的? ?AI 服务|real AI service/i.test(readme), 'README 应说明未验证的范围');
for (const f of ['CONTRIBUTING.md', 'CHANGELOG.md', '.github/workflows/test.yml']) assert.ok(fs.existsSync(path.join(root, f)), f);
assert.ok(/node tests\/run-all\.js/.test(rd('.github/workflows/test.yml')));
const gi = rd('.gitignore'); for (const p of ['/data/', '**/.backup/', '*.bak', '/dist/']) assert.ok(gi.includes(p), p);
const SECRET = /(sk-[A-Za-z0-9]{24,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY)/;
(function walk(d) { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes:true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (/\.(js|json|html|css|md)$/.test(e.name)) assert.ok(!SECRET.test(rd(r)), '疑似密钥：' + r); } })('core'); 
for (const d of ['ui', 'server', 'workspace', 'tools']) (function walk(x) { for (const e of fs.readdirSync(path.join(root, x), { withFileTypes:true })) { const r = x + '/' + e.name; if (e.isDirectory()) walk(r); else if (/\.(js|json|html|css|md)$/.test(e.name)) assert.ok(!SECRET.test(rd(r)), '疑似密钥：' + r); } })(d);
/* README 里引用的本地文件必须存在于 git（没有 .git 的副本就查文件是否存在） */
const { spawnSync } = require('node:child_process');
const g = spawnSync('git', ['ls-files'], { cwd:root, encoding:'utf8' }), tracked = g.status === 0 && g.stdout ? new Set(g.stdout.split(/\r?\n/)) : null;
const refs = Array.from(readme.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)).map(m => decodeURI(m[1])).filter(u => !/^[a-z]+:/i.test(u));
assert.ok(refs.length >= 4, 'README 本地引用太少？' + refs);
for (const r of refs) assert.ok(tracked ? tracked.has(r) : fs.existsSync(path.join(root, r)), 'README 引用的文件不在 git 里：' + r);
for (const p of ['/.test-tmp/', '/dist/', '/data/']) assert.ok(gi.includes(p), p);
assert.ok(/--port/.test(readme) && /Ctrl\+C/.test(readme) && /git clone/.test(readme) && /macOS/.test(readme) && /QZ_BASE/.test(readme));
assert.ok(readme.startsWith('# Qianzhang'), 'README 应以英文介绍开头');
const englishStart = readme.indexOf('## English\n'), chineseStart = readme.indexOf('## 简体中文\n');
assert.ok(englishStart >= 0 && chineseStart > englishStart, 'README 应为英文优先、中文辅助');
const en = readme.slice(englishStart + '## English\n'.length, chineseStart), zh = readme.slice(chineseStart + '## 简体中文\n'.length);
assert.strictEqual((zh.match(/^## /gm) || []).length, (en.match(/^## /gm) || []).length, '中英文章节数应一致');
/* 首次对外公开前核对真正的 Git 快照，而不只检查当前工作目录。 */
const publicOption = process.argv.indexOf('--public-ref');
if (publicOption >= 0) {
  const ref = process.argv[publicOption + 1];
  assert.ok(ref && !ref.startsWith('-'), '--public-ref 需要指定已审查的 Git 引用');
  const gitRead = args => {
    const result = spawnSync('git', args, { cwd:root, encoding:'utf8', maxBuffer:16 * 1024 * 1024 });
    assert.strictEqual(result.status, 0, '公开快照读取失败');
    return result.stdout;
  };
  const commit = gitRead(['rev-parse', '--verify', ref + '^{commit}']).trim();
  assert.strictEqual(Number(gitRead(['rev-list', '--count', commit]).trim()), 1, '首次公开快照不能包含开发历史');
  const records = gitRead(['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean);
  const published = new Set(records.map(record => record.slice(record.indexOf('\t') + 1)));
  for (const file of ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', '.gitignore', '.github/workflows/test.yml', 'workspace/index.html', 'server/server.js', 'core/store.js', 'core/storage.js', 'core/craft.js', 'core/ai.js', 'ui/app.js', 'ui/components.js', 'ui/i18n.js', 'ui/style.css', 'server/keystore.js', 'tools/pack/build.js', 'tools/pack/launcher.js', 'tools/pack/icon.ico']) assert.ok(published.has(file), '公开快照缺少必要文件：' + file);
  const publicReadme = gitRead(['show', commit + ':README.md']);
  assert.ok(!/(?:\b[A-Za-z]:[\\/]|\/(?:home|Users)\/)/.test(publicReadme), '公开快照 README 有本机路径');
  const publicRefs = Array.from(publicReadme.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)).map(m => decodeURI(m[1])).filter(u => !/^[a-z]+:/i.test(u));
  assert.ok(publicRefs.length >= 4, '公开快照 README 本地引用不足');
  for (const file of publicRefs) assert.ok(published.has(file), '公开快照 README 引用缺失：' + file);
  const approvedImages = new Set(['docs/screenshots/home.jpg', 'docs/screenshots/chapter-check.jpg']);
  const docs = new Set(['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', '.gitignore', 'docs/pain-points.md']);
  const privatePath = /(?:\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]|\/(?:Users|home)\/)/;
  let textFiles = 0, imageFiles = 0;
  for (const record of records) {
    const split = record.indexOf('\t'), description = record.slice(0, split).split(' '), file = record.slice(split + 1);
    assert.ok(split > 0 && description[0] === '100644' && description[1] === 'blob', '公开快照包含链接或特殊文件：' + file);
    assert.ok(!/(^|\/)(data|dist|private|projects|backups?|\.backup|\.trash|\.test-tmp|_scratch|node_modules)(\/|$)|(^|\/)\.env(?:\.|$)|\.(exe|log|bak|backup|lnk|pem|key|pfx|zip)$/i.test(file), '公开快照混入私人数据或运行产物：' + file);
    const text = docs.has(file) || /^(core|ui|server|workspace|tests|tools)\/.+\.(js|json|html|css)$/.test(file) || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file);
    assert.ok(text || approvedImages.has(file) || file === 'tools/pack/icon.ico', '公开快照包含未审查文件：' + file);
    if (approvedImages.has(file)) imageFiles++;
    if (text) {
      const content = gitRead(['show', commit + ':' + file]);
      assert.ok(!SECRET.test(content), '公开文本含疑似凭据：' + file);
      assert.ok(!privatePath.test(content), '公开文本含私人用户目录：' + file);
      textFiles++;
    }
  }
  assert.strictEqual(imageFiles, approvedImages.size, '公开配图应只有两张已审查的原创演示截图');
  console.log('首次公开快照检查通过：' + records.length + ' 文件，' + textFiles + ' 文本，2 个配图文件名符合审查清单，无开发历史');
}
assert.ok(!/English by default|starts in English|默认英文/.test(readme) && /Chinese by default/.test(readme) && /中文默认/.test(readme), 'README 应写明新安装默认中文');
assert.ok(/github\.com\/lalala-git\/qianzhang-writer\/releases\/latest/.test(readme) && !/lalala-git\/qianzhang(?!-writer)/.test(readme), 'README 链接应指向 qianzhang-writer 仓库');
assert.ok(!/Codex/.test(readme), 'README 不再列 Codex 协作者');
assert.strictEqual((readme.match(/Grok \(xAI\)\]\(https:\/\/x\.ai\/\) \u00b7 Grok Bot \u6c34\u6ef4\u{1F4A7}/gu) || []).length, 2, 'README 中英文都应写 AI 协作者 Grok (xAI) · Grok Bot 水滴');
console.log('开源检查通过');
