# 更新记录 / Changelog

格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [1.2.0] - 2026-11-12

### English

- Qianzhang.exe now opens its own window (a small host built with .NET Framework, showing the UI in the Microsoft Edge WebView2 runtime that usually already ships with Windows 10/11): the window, taskbar and tray icon belong to Qianzhang. Closing the window or choosing "退出千章" from the tray saves unsaved writing and quits. Opening the exe again while it is already running brings the existing window forward. The window remembers its position and size. Works stay where they were. Needs the WebView2 Runtime and .NET Framework 4.6.2 or later. If the runtime is missing, a Chinese notice explains how to install it from Microsoft and Qianzhang opens in a browser window for this session. Set `QZ_PACK_EDGE=1` when packaging to build only the older Edge/Chrome-window exe.
- New app icon: a pale sky-blue stack of pages with a few lines of text and an orange cursor, used for the exe, window, taskbar, tray and the in-app icon. Sources are the SVG files in `tools/pack/icon/`; `python tools/pack/icon/make-icon.py` rebuilds `tools/pack/icon.ico`.
- Write page toolbar: button labels now collapse to icons only when they really do not fit (any window width, either language, check panel open or closed); on very narrow windows the toolbar wraps to two lines instead of pushing buttons off-screen.
- English interface: your own chapter titles, outlines, book titles and card summaries are no longer half machine-translated (e.g. "Chapter 1 半张剑谱"); fixed half-Chinese phrases such as the chapter counter, foreshadowing due line, word milestones ("10k chars"), "Due soon" / "Overdue" tags and the delete-work button; long menu items wrap instead of pushing shortcuts out of the menu.
- Small labels (tags, current-work label, sidebar tagline and similar) are now at least 12px for easier reading of Chinese text.
- Narrow windows: the manuscript page no longer gets cut off on the right.
- Write page: the chapter text is now one paper-like page that grows as you write and scrolls with the page, with no box or blue focus outline around it (an old global focus style was overriding the editor). Click anywhere below the text to keep writing at the end. While you type at the end of a long chapter, the line you are writing stays well above the bottom of the window.
- Write page size: font size and line length follow the window width (about 30 characters per line in a narrow window, up to about 45 on a large screen, 17–22px text, line height 1.9), so a maximized window no longer shows a thin strip with empty space on both sides. "Font & paper" has a new default "自动（随窗口）" for size and width; your own choices still apply, and the old defaults are read as "auto".
- Large screens: the exe window now scales the whole interface to the screen (1.0 on 1920×1080, about 1.2 on 2560×1440, up to 1.5), recalculated when the window moves to another monitor. Ctrl+mouse wheel or Ctrl+plus/minus still zooms, and Qianzhang remembers your own zoom.
- Windows between 761 and 1100px wide: the sidebar becomes a narrow icon bar so the chapter list and text have more room; chapter titles and word counts stay readable.
- Write page toolbar: "标为已发布" and "检查" have different icons, every button has a tooltip, labels are shown whenever they fit, and the save status (已保存 / 未保存 / 有冲突) is shown next to the word count.
- Write page: a new "hide sidebar" button next to "+" in the 目录 header (or Ctrl+\) slides away both the left navigation and the chapter list, so the page re-centers and the text size and line length follow the wider window. A small button at the top-left of the toolbar (before the chapter counter) or Ctrl+\ again brings them back. Qianzhang remembers the choice after a restart. It only applies to the write page; other pages always show the navigation. Also in the command palette (Ctrl+K).

### 中文

- Qianzhang.exe 现在用自己的窗口（用 .NET Framework 编译的小外壳，界面显示在 Windows 10/11 通常已自带的 Microsoft Edge WebView2 运行时里）：窗口、任务栏和托盘图标都是千章自己的。关窗口或在托盘里选「退出千章」，会先把还没保存的内容存好再退出。已经打开时再双击，会把现有窗口调到前面。窗口会记住位置和大小。作品位置不变。运行需要 WebView2 运行时和 .NET Framework 4.6.2 或更新版本。缺少运行时会弹出中文说明，并可打开微软的下载页面，这次先用浏览器窗口打开。打包时设 `QZ_PACK_EDGE=1`，则只打出原来的 Edge/Chrome 窗口版。
- 新图标：淡天蓝底上叠着几张纸，前面有几行字和一个橙色光标，用于 exe、窗口、任务栏、托盘和页面小图标。源文件是 `tools/pack/icon/` 里的 SVG，用 `python tools/pack/icon/make-icon.py` 生成 `tools/pack/icon.ico`。
- 写作页顶栏：按实际宽度判断，放不下时才把按钮收成只有图标（不管窗口多宽、中英文、开不开检查面板）；窗口很窄时折成两行，不再把按钮挤出屏幕。
- 英文界面：你自己写的章节标题、细纲、书名和设定简介不再被半翻译；修正章序、伏笔到期、字数里程碑、「快到期 / 已逾期」标签和删除作品按钮里的中英混杂；菜单里的长英文项自动换行，快捷键不再被挤出菜单。
- 标签、「当前作品」、侧栏口号等小字至少 12px，中文更好认。
- 窄窗口下稿纸右边不再被裁掉一截。
- 写作页：正文变成一整张随内容长高的稿纸，跟着页面一起滚动，四周不再有框，也不再有聚焦时的蓝色描边（原因是一条全局的聚焦样式盖过了正文的设置）。点正文下面的空白处就能接着在末尾写。长章节在末尾打字时，正在写的那一行会留在窗口下方三成以上，不会贴着底边。
- 写作页大小：字号和每行字数跟着窗口宽度变（窄窗口每行约 30 字，大屏约 45 字，字号 17–22px，行距 1.9），最大化后不再是中间一窄条、两边空空的。「字体与纸张」里字号和版心宽度新增默认的「自动（随窗口）」，自己选过的字号照旧生效，旧版默认值会按「自动」处理。
- 大屏：exe 窗口会按屏幕大小整体放大界面（1920×1080 不放大，2560×1440 约 1.2 倍，最多 1.5 倍），窗口拖到别的显示器时重新计算。Ctrl+滚轮或 Ctrl+加减号仍可手动缩放，千章会记住你自己调的比例。
- 窗口宽度在 761–1100px 之间时，左侧栏收成一条图标栏，给目录和正文腾出地方；章节标题和字数不会被挤没。
- 写作页顶栏：「标为已发布」和「检查」换成不同的图标，每个按钮都有悬停提示，放得下时显示文字；字数旁边显示保存状态（已保存 / 未保存 / 有冲突）。
- 写作页可以收起侧边栏：「目录」标题右边、「+」左边新增收起按钮（或按 Ctrl+\），左侧导航和目录一起滑走，正文重新居中，字号和每行字数按变宽后的窗口重新计算。顶栏最左边（章序前面）的小按钮或再按一次 Ctrl+\ 就能展开。收起状态会记住，重开千章还是一样。只在写作页生效，去别的页面导航照常显示。命令面板（Ctrl+K）里也能找到。

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
