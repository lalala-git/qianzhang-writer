# 参与千章 / Contributing

欢迎提 issue 反馈问题和建议（中文或英文）。暂不接受代码贡献；以后如接受，可能需要先签署贡献协议。
Issues with bug reports and suggestions are welcome, in Chinese or English. Code contributions are not accepted for now; if that changes, a contributor agreement may be required.

## 开发 / Development

- 源码运行使用原生 JS，无前端构建步骤、无需 npm 依赖；需要 Node.js 18+。Vanilla JS with no frontend build or npm dependencies when running from source; requires Node.js 18+.
- Windows 单文件打包是单独流程，建议 Node.js 22+；`node tools/pack/build.js` 会通过 npm/npx 联网获取固定版本的 rcedit 和 postject。Windows single-file packaging is a separate workflow, recommended with Node.js 22+; the build downloads pinned rcedit and postject through npm/npx. See README for the distinction between runtime and build requirements.
- 启动：`node server/server.js .`，打开 <http://127.0.0.1:7801/>。
- 提交前跑 `node tests/run-all.js`（CI 也跑这个）。改了界面再跑 `node tests/browser-smoke.js [截图目录]`（Node 18/20/22，需本机 Chrome/Edge/Chromium，可用 `CHROME=路径` 指定）。它自己起服务，作品目录用 `.test-tmp/smoke-data`，查完删除，**不会读写 `data/`**；结束时还会核对 `data/projects` 没被改动。设置 `QZ_BASE=http://127.0.0.1:端口` 可改为检查已在运行的服务，这时只用内存里的临时书、不保存。
- Run `node tests/run-all.js` before sending a PR. For UI changes also run `node tests/browser-smoke.js [shots]` (Node 18/20/22, needs Chrome/Edge/Chromium, override with `CHROME=path`). It starts its own server with a temporary works folder (`.test-tmp/smoke-data`, deleted afterwards), **never reads or writes `data/`**, and verifies `data/projects` is unchanged at the end. Set `QZ_BASE=http://127.0.0.1:port` to check an already-running server instead; it then only uses throw-away in-memory books.
- 调试开关：在地址后加 `?selfcheck=fail`（如 `http://127.0.0.1:7801/workspace/?selfcheck=fail`）会强制显示启动自检失败的横幅，用来检查这条提示的样子。Debug switch: append `?selfcheck=fail` to the URL to force the startup self-check failure banner.
- README 里引用的本地文件（截图等）必须已提交进 git，`tests/test-opensource.js` 会检查。Every local file linked from README must be committed; `tests/test-opensource.js` checks this.

## 约定 / Conventions

- **作品数据向后兼容**：`core/store.js` 读旧文件要能用，未知字段原样保留；改数据结构要加测试。Keep work files backward compatible and preserve unknown fields.
- **新界面文字**加英文到 `ui/i18n.js`（整句带变量用模板 `t('已移进回收站：《{title}》', {title})`）。术语：正典 = canon。Add English for new UI strings to `ui/i18n.js`.
- **少打扰**：能撤销就不弹确认框；提示条可关、可调。Prefer undo over confirm dialogs.
- **检查项先看误报**：新检查要在真实长文本上看误报率，`docs/pain-points.md` 记一行「痛点 → 怎么解决」。
- 不要提交 `data/`、备份、`dist/`、`.test-tmp/`（已在 `.gitignore`）。Never commit your own works, backups or `dist/`.

发布前运行 `node tests/test-opensource.js --public-ref <待发布引用>`，检查待发布的单提交源码快照：它会拒绝个人数据目录、二进制、日志与未审查配图，并扫描全部文本里的疑似凭据和私人路径；文字和图片内容仍需人工看一遍。请从该快照分发源码，不要直接压缩含作品和浏览器档案的本机工作目录。

Before a release, run `node tests/test-opensource.js --public-ref <ref>` against the single-commit source snapshot. It rejects private data folders, binaries, logs and unreviewed images, and scans all text for credentials and private paths; text and images still need a human review. Distribute that snapshot rather than the local working folder containing works and browser profiles.

## 安全 / Security

AI 密钥不写浏览器存储：由本地服务加密保存在数据目录的 `app/ai-key.json`（Windows 用 DPAPI 按当前账户加密；其他系统用 AES-256-GCM，密钥由本机标识派生）。这能防止拷贝、同步或误分享数据文件夹时密钥被直接读出，防不了以你的账户运行的恶意程序。备份默认去掉密钥，只有导出时勾选才会以明文附上。请求 AI 时密钥会发送给用户配置的接口；远程 AI 功能还可能发送正文、设定和对话上下文。陪写默认关闭，第一次打开会提示会发送什么。本地服务只监听 127.0.0.1；浏览器直连的 AI 接口需要允许跨域访问（CORS）。
API keys are not kept in browser storage. The local server encrypts them into `app/ai-key.json` in the data folder (DPAPI for the current account on Windows; AES-256-GCM with a machine-derived key elsewhere). This protects against copying, syncing or accidentally sharing the data folder; it does not protect against malware running as your account. Backups omit the key unless you tick the option when exporting. The key is sent to the configured AI endpoint with each request, and remote AI features may also send manuscript, setting and conversation context. The co-writer is off by default and explains what it sends the first time you turn it on. The local server listens on 127.0.0.1 only; direct browser AI requests require CORS support.

目前未公布独立的私密报告渠道。发现安全问题时，请先提交不含敏感内容的 Issue 请求私密联系方式；不要在公开 Issue 中附上密钥、作品原文、个人路径、浏览器档案或可直接利用的细节。维护者提供渠道后，再私下补充必要材料。
No dedicated private reporting channel is currently listed. First open an Issue without sensitive details to request a private contact route. Do not include API keys, unpublished work, personal paths, browser profiles or directly exploitable details in public Issues; share necessary details privately after the maintainer supplies a channel.
