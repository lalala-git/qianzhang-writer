# 更新记录 / Changelog

格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [未发布 / Unreleased]

## [1.1.0] - 2026-10-31

### English

- Quitting on Windows: when Edge/Chrome is missing, Qianzhang explains this first and opens your default browser; in that mode a tray icon (Open / Quit) and a "Quit Qianzhang" button in the sidebar save your work and quit.
- Closing the window now ends the program more reliably: the check only counts browser processes that still have a window, and it has a time limit.
- Interface polish on the bookshelf, write page and settings (spacing, focus and hover states).
- Windows: the exe now shows the Qianzhang icon and version 1.1.0 in its file properties.
- macOS and Linux: the CI tests now also run on macOS, and a new `source-packages` workflow builds source packages with a start script after the tests pass.
- New-version reminder: shortly after start-up Qianzhang asks GitHub once whether a newer release exists. If so, a small note appears in the sidebar and clicking it opens the release page in your browser. It never downloads or replaces anything by itself, stays silent when you are offline, sends none of your writing, and can be turned off in Settings → Version and updates (which also shows the current version and has a "Check now" button).

### 中文

- Windows 退出：没有 Edge/Chrome 时先弹窗说明，再用默认浏览器打开；这种模式下，右下角托盘图标（打开 / 退出）和侧栏里的「退出千章」按钮都会先保存再退出。
- 关窗后更可靠地结束程序：只数仍然带窗口的浏览器进程，并加了超时。
- 界面细节：书架、写作页和设置页的间距、焦点和悬停效果。
- Windows：exe 的文件属性里现在带有千章图标和 1.1.0 版本号。
- macOS 和 Linux：CI 现在也在 macOS 上跑测试，新增 `source-packages` 工作流，在测试通过后打出带启动脚本的源码包。
- 新版本提醒：启动后不久，千章会向 GitHub 查一次有没有更新的发布。有的话，侧栏出现一条小提示，点一下用浏览器打开发布页面。它不会自己下载或替换任何东西，断网时不出声，也不会发送你的任何文字；可以在 设置 → 版本与更新 里关掉（那里还能看到当前版本，并有「立即检查」按钮）。

## [1.0.0] - 2026-10-27

首个公开版本。First public release.

- 本地写作：分卷与章节、每章细纲、伏笔本与到期提醒、连更统计、存稿与计划发布日期，作品保存在本机 `data/projects/`，带自动备份和回收站。
  Local writing: volumes and chapters, per-chapter outlines, a foreshadowing tracker with due reminders, streaks, a chapter buffer and planned publication dates. Works are saved in `data/projects/` with automatic backups and a trash.
- 写完一章就体检：错名与别名、敏感词、口头禅、重复、AI 腔、排版、人称、章末钩子；正典整理新人物、新地点和状态变化，已死角色再出场会提醒。
  Chapter check-up: names and aliases, sensitive words, crutch phrases, repeats, AI-sounding prose, layout, point of view and chapter-end hooks; canon collects new characters, places and state changes and flags dead characters who reappear.
- 角色与设定卡片、人物关系图、角色聊天；可选连接 OpenAI 兼容接口，使用 AI 责编、卡文助手、续写润色和陪写。
  Character and setting cards, a relationship graph and character chat; optionally connect an OpenAI-compatible endpoint for the AI editor, writer's-block helper, continue/polish and co-writer.
- 隐私：API 密钥由本地服务加密保存（Windows 用 DPAPI，其他系统用 AES-256-GCM），不存浏览器；导出备份默认不含密钥；陪写默认关闭，首次打开前说明会发送什么，开着时有常驻指示，一点就关。
  Privacy: the API key is encrypted by the local server (DPAPI on Windows, AES-256-GCM elsewhere) instead of browser storage; backups omit keys by default; the co-writer is off by default, explains what it sends before first use and shows a persistent one-click-off indicator.
- 界面默认中文，可在设置里切换 English；Windows x64 便携版（未签名），macOS / Linux 从源码运行。
  Chinese interface by default, English available in Settings; Windows x64 portable build (not code-signed); macOS / Linux run from source.
