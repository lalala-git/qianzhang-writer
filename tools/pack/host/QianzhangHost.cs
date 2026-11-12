/*! 千章 · Windows 桌面外壳：自己的原生窗口 + WebView2，后台跑本地服务（qianzhang-engine.exe，即原来的 Node 程序）。
 *  窗口属于 Qianzhang.exe 进程；关窗 = 先让页面把没存的字存完，再停掉本地服务，整个程序退出。
 *  没装 WebView2 运行时：提示去哪下载，这次先退回原来的浏览器窗口方式。 */
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("千章")]
[assembly: AssemblyProduct("千章")]
[assembly: AssemblyDescription("千章 · 网文写作台")]
[assembly: AssemblyCompany("千章 contributors")]

static class Program {
  internal static string ExeDir, DataDir, AppDir, BinDir, LogPath, Key;
  static readonly string[] Payload = { "qianzhang-engine.exe", "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll" };

  [STAThread]
  static int Main() {
    try {
      ExeDir = Path.GetDirectoryName(Application.ExecutablePath);
      DataDir = PickData();
      AppDir = Path.Combine(DataDir, "app");
      Directory.CreateDirectory(AppDir);
      LogPath = Path.Combine(AppDir, "qianzhang-window.log");
      Key = Md5(DataDir.ToLowerInvariant());
      BinDir = Path.Combine(AppDir, "bin", BuildInfo.Id);
      AppDomain.CurrentDomain.AssemblyResolve += Resolve;
      bool first;
      var mutex = new Mutex(true, "Local\\Qianzhang-" + Key, out first);
      if (!first) { /* 已经开着：叫那边的窗口出来，自己退出 */
        try { EventWaitHandle.OpenExisting("Local\\Qianzhang-show-" + Key).Set(); } catch (Exception) { }
        return 0;
      }
      Extract();
      int rc = Run();
      GC.KeepAlive(mutex);
      return rc;
    } catch (Exception e) {
      Log("启动失败 " + e);
      MessageBox.Show("千章启动失败：" + e.Message + (LogPath != null ? "\n\n日志：" + LogPath : ""), "千章", MessageBoxButtons.OK, MessageBoxIcon.Error);
      return 1;
    }
  }

  /* 作品放哪：和原来的启动器同一套规则（QZ_DATA → 仓库 dist 里运行用仓库 data → exe 旁边的 data → 旧版 qianzhang-app\data） */
  static string PickData() {
    string env = Environment.GetEnvironmentVariable("QZ_DATA");
    if (!string.IsNullOrEmpty(env)) return Path.GetFullPath(env);
    string repo = Path.GetDirectoryName(ExeDir);
    if (repo != null && Path.GetFileName(ExeDir).ToLowerInvariant() == "dist" && File.Exists(Path.Combine(repo, "server", "server.js")) && Directory.Exists(Path.Combine(repo, "workspace"))) return Path.Combine(repo, "data");
    string beside = Path.Combine(ExeDir, "data"), legacy = Path.Combine(ExeDir, "qianzhang-app", "data");
    return !HasBooks(beside) && HasBooks(legacy) ? legacy : beside;
  }
  static bool HasBooks(string d) { try { return Directory.GetFiles(Path.Combine(d, "projects"), "*.json").Length > 0; } catch (Exception) { return false; } }

  /* 把内置的本地服务和 WebView2 组件放到 data\app\bin\<版本标识>\（只写程序文件，从不碰作品） */
  static void Extract() {
    Directory.CreateDirectory(BinDir);
    var asm = Assembly.GetExecutingAssembly();
    foreach (string name in Payload) {
      string dst = Path.Combine(BinDir, name);
      using (Stream s = asm.GetManifestResourceStream("qz." + name)) {
        if (s == null) throw new Exception("程序文件缺少 " + name);
        if (File.Exists(dst) && new FileInfo(dst).Length == s.Length) continue;
        string tmp = dst + ".tmp";
        using (var f = File.Create(tmp)) s.CopyTo(f);
        if (File.Exists(dst)) File.Delete(dst);
        File.Move(tmp, dst);
        MediumLabel(dst);
      }
    }
    try { foreach (string d in Directory.GetDirectories(Path.Combine(AppDir, "bin"))) if (!string.Equals(Path.GetFileName(d), BuildInfo.Id, StringComparison.OrdinalIgnoreCase)) try { Directory.Delete(d, true); } catch (Exception) { } } catch (Exception) { }
  }
  /* 文件夹带“低完整性”标记时（比如从网上下载解压到的目录），解压出来的程序会继承低完整性，
     在低完整性下浏览器窗口里的页面会空白。和打包时给 Qianzhang.exe 做的一样，把它调回普通级别。 */
  static void MediumLabel(string file) {
    try {
      var psi = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "icacls.exe"), "\"" + file + "\" /setintegritylevel M") { UseShellExecute = false, CreateNoWindow = true };
      using (var p = Process.Start(psi)) p.WaitForExit(5000);
    } catch (Exception e) { Log("调整完整性级别失败 " + e.Message); }
  }
  static Assembly Resolve(object sender, ResolveEventArgs a) {    string n = new AssemblyName(a.Name).Name + ".dll", p = BinDir == null ? null : Path.Combine(BinDir, n);
    return p != null && File.Exists(p) ? Assembly.UnsafeLoadFrom(p) : null;
  }

  [MethodImpl(MethodImplOptions.NoInlining)]
  static int Run() {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    string ver = null;
    try { CoreWebView2Environment.SetLoaderDllFolderPath(BinDir); ver = CoreWebView2Environment.GetAvailableBrowserVersionString(); } catch (Exception e) { Log("WebView2 运行时检查 " + e.Message); }
    if (Environment.GetEnvironmentVariable("QZ_FAKE_NO_WEBVIEW2") == "1") ver = null; /* 测试用：模拟没装运行时 */
    if (string.IsNullOrEmpty(ver)) { NoRuntime(); return 0; }
    Log("WebView2 " + ver);
    var engine = Engine.Start(true);
    Application.Run(new MainForm(engine));
    engine.Stop();
    return 0;
  }
  static void NoRuntime() {
    Log("没有 WebView2 运行时，改用浏览器窗口");
    var r = MessageBox.Show("这台电脑缺少「Microsoft Edge WebView2 运行时」，千章的窗口要靠它显示。\n\nWindows 11 和较新的 Windows 10 一般已经自带；没有的话可以从微软官网免费安装。\n\n点「是」打开微软的下载页面。这次先用浏览器窗口打开千章，你的作品不受影响。", "千章", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
    if (r == DialogResult.Yes) OpenExternal("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
    Engine.Start(false); /* 原来的方式：本地服务自己开 Edge/Chrome 窗口或默认浏览器，并管退出 */
  }

  /* 完整的多尺寸图标（打包时作为资源放进来）：窗口和托盘按需要的尺寸取对应的那一张，小图标不再是 32px 缩小来的 */
  internal static System.Drawing.Icon AppIcon(Size size) {
    try { using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("qz.icon.ico")) if (s != null) return size.IsEmpty ? new System.Drawing.Icon(s) : new System.Drawing.Icon(s, size); } catch (Exception e) { Log("读取图标失败 " + e.Message); }
    try { return System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { return null; }
  }
  internal static void OpenExternal(string url) { try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch (Exception e) { Log("打开链接失败 " + e.Message); } }
  internal static void Log(string s) { try { if (LogPath != null) File.AppendAllText(LogPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + s + Environment.NewLine, Encoding.UTF8); } catch (Exception) { } }
  static string Md5(string s) { using (var m = MD5.Create()) return BitConverter.ToString(m.ComputeHash(Encoding.UTF8.GetBytes(s))).Replace("-", "").Substring(0, 16); }
}

/* 本地服务子进程：标准输入一直开着，窗口这边一退出（哪怕是崩溃），管道断开，服务就自己退出；
   另外把它放进“随本进程关闭而结束”的作业对象里兜底。 */
sealed class Engine {
  public Process Proc; public string Url; public bool Shared;
  readonly ManualResetEvent ready = new ManualResetEvent(false);

  public static Engine Start(bool hosted) {
    var psi = new ProcessStartInfo(Path.Combine(Program.BinDir, "qianzhang-engine.exe")) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Program.ExeDir };
    psi.EnvironmentVariables["QZ_HOME"] = Program.ExeDir;
    psi.EnvironmentVariables["QZ_DATA"] = Program.DataDir;
    var e = new Engine();
    if (!hosted) { Process.Start(psi); return e; }
    psi.EnvironmentVariables["QZ_HOST"] = "webview2";
    psi.EnvironmentVariables["QZ_NO_BROWSER"] = "1";
    psi.EnvironmentVariables["QZ_NO_TRAY"] = "1";
    psi.RedirectStandardInput = true; psi.RedirectStandardOutput = true; psi.StandardOutputEncoding = Encoding.UTF8;
    e.Proc = Process.Start(psi);
    Job.Add(e.Proc);
    var t = new Thread(() => {
      try { string line; while ((line = e.Proc.StandardOutput.ReadLine()) != null) { if (line.StartsWith("QZ_URL ")) { var parts = line.Substring(7).Trim().Split(' '); e.Shared = parts.Length > 1 && parts[1] == "shared"; e.Url = parts[0]; e.ready.Set(); } } } catch (Exception) { }
      e.ready.Set();
    }) { IsBackground = true };
    t.Start();
    return e;
  }
  public string WaitUrl(int ms) { ready.WaitOne(ms); return Url; }
  public void Stop() {
    if (Proc == null) return;
    try { Proc.StandardInput.Close(); } catch (Exception) { }
    try { if (!Proc.WaitForExit(4000)) { Program.Log("本地服务没有按时退出，强制结束"); Proc.Kill(); } } catch (Exception) { }
  }
}

static class Job {
  [StructLayout(LayoutKind.Sequential)] struct BASIC { public long a, b; public uint LimitFlags; public UIntPtr c, d; public uint e; public UIntPtr f; public uint g, h; }
  [StructLayout(LayoutKind.Sequential)] struct IO { public ulong a, b, c, d, e, f; }
  [StructLayout(LayoutKind.Sequential)] struct EXT { public BASIC Basic; public IO Io; public UIntPtr a, b, c, d; }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attr, string name);
  [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int cls, ref EXT info, int len);
  [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
  static IntPtr handle;
  public static void Add(Process p) {
    try {
      if (handle == IntPtr.Zero) {
        handle = CreateJobObject(IntPtr.Zero, null);
        var info = new EXT(); info.Basic.LimitFlags = 0x2000 | 0x1000; /* 本进程关了就结束服务；服务再开的程序（比如默认浏览器）不受影响 */
        SetInformationJobObject(handle, 9, ref info, Marshal.SizeOf(typeof(EXT)));
      }
      AssignProcessToJobObject(handle, p.Handle);
    } catch (Exception e) { Program.Log("作业对象 " + e.Message); }
  }
}

sealed class MainForm : Form {
  readonly Engine engine;
  readonly WebView2 web = new WebView2();
  readonly NotifyIcon tray = new NotifyIcon();
  string origin = "";
  bool closingStarted, closingDone;

  public MainForm(Engine engine) {
    this.engine = engine;
    Text = "千章";
    var appIcon = Program.AppIcon(Size.Empty); if (appIcon != null) Icon = appIcon;
    StartPosition = FormStartPosition.CenterScreen;
    Size = new Size(1320, 880);
    MinimumSize = new Size(720, 480);
    BackColor = Color.FromArgb(246, 244, 239);
    RestoreSavedBounds();
    web.Dock = DockStyle.Fill;
    web.DefaultBackgroundColor = BackColor;
    Controls.Add(web);
    tray.Icon = Program.AppIcon(SystemInformation.SmallIconSize) ?? Icon; tray.Text = "千章";
    var menu = new ContextMenuStrip();
    menu.Items.Add("打开千章", null, (s, e) => ShowMain());
    menu.Items.Add("退出千章", null, (s, e) => { Program.Log("托盘：退出"); Close(); });
    tray.ContextMenuStrip = menu;
    tray.DoubleClick += (s, e) => ShowMain();
    tray.Visible = true;
    var show = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\Qianzhang-show-" + Program.Key);
    new Thread(() => { while (show.WaitOne()) { try { BeginInvoke((Action)ShowMain); } catch (Exception) { } } }) { IsBackground = true }.Start();
    if (engine.Proc != null) {
      engine.Proc.EnableRaisingEvents = true;
      engine.Proc.Exited += (s, e) => { if (engine.Shared) return; try { BeginInvoke((Action)(() => { if (!closingStarted) { Program.Log("本地服务已退出（页面里点了退出？），关闭窗口"); closingStarted = closingDone = true; tray.Visible = false; Close(); } })); } catch (Exception) { } };
    }
    Load += async (s, e) => await Init();
  }

  async Task Init() {
    try {
      string profile = Path.Combine(Program.AppDir, "webview2-profile");
      MigrateLocalStorage(profile);
      var envTask = CoreWebView2Environment.CreateAsync(null, profile, new CoreWebView2EnvironmentOptions("--disable-features=Translate"));
      var urlTask = Task.Run(() => engine.WaitUrl(30000));
      var env = await envTask;
      await web.EnsureCoreWebView2Async(env);
      var st = web.CoreWebView2.Settings;
      st.AreDevToolsEnabled = Environment.GetEnvironmentVariable("QZ_DEVTOOLS") == "1";
      st.IsStatusBarEnabled = false;
      st.IsGeneralAutofillEnabled = false;
      st.IsPasswordAutosaveEnabled = false;
      web.CoreWebView2.DocumentTitleChanged += (o, a) => { string t = web.CoreWebView2.DocumentTitle; Text = string.IsNullOrEmpty(t) || t.StartsWith("http") ? "千章" : t; };
      web.CoreWebView2.NewWindowRequested += (o, a) => { a.Handled = true; if (origin != "" && a.Uri.StartsWith(origin)) web.CoreWebView2.Navigate(a.Uri); else Program.OpenExternal(a.Uri); };
      web.CoreWebView2.NavigationStarting += (o, a) => { if (origin != "" && !a.Uri.StartsWith(origin) && !a.Uri.StartsWith("about:") && !a.Uri.StartsWith("data:")) { a.Cancel = true; Program.OpenExternal(a.Uri); } };
      web.CoreWebView2.ProcessFailed += (o, a) => { Program.Log("页面进程出错 " + a.ProcessFailedKind); if (a.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited || a.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive) try { web.CoreWebView2.Reload(); } catch (Exception) { } };
      string url = await urlTask;
      if (string.IsNullOrEmpty(url)) throw new Exception("本地服务没能启动，详见 " + Path.Combine(Program.AppDir, "qianzhang.log"));
      origin = new Uri(url).GetLeftPart(UriPartial.Authority) + "/";
      Program.Log("打开 " + url + (engine.Shared ? "（连到已在运行的旧版千章）" : ""));
      web.CoreWebView2.Navigate(url);
      web.Focus();
    } catch (Exception ex) {
      Program.Log("窗口初始化失败 " + ex);
      MessageBox.Show(this, "千章窗口打不开：" + ex.Message + "\n\n日志：" + Program.LogPath, "千章", MessageBoxButtons.OK, MessageBoxIcon.Error);
      closingStarted = closingDone = true; Close();
    }
  }

  /* 第一次用新窗口时，把旧版浏览器窗口里的界面设置（语言、主题、纸张等，存在 Local Storage）带过来；作品本身在 data\projects，不在这里 */
  static void MigrateLocalStorage(string profile) {
    try {
      string src = Path.Combine(Program.AppDir, "window-profile", "Default", "Local Storage"), dst = Path.Combine(profile, "EBWebView", "Default", "Local Storage");
      if (Directory.Exists(profile) || !Directory.Exists(src)) return;
      CopyDir(src, dst); Program.Log("已带过旧窗口的界面设置");
    } catch (Exception e) { Program.Log("带过界面设置失败（不影响作品） " + e.Message); }
  }
  static void CopyDir(string src, string dst) {
    Directory.CreateDirectory(dst);
    foreach (string f in Directory.GetFiles(src)) { if (Path.GetFileName(f) == "LOCK") continue; File.Copy(f, Path.Combine(dst, Path.GetFileName(f)), true); }
    foreach (string d in Directory.GetDirectories(src)) CopyDir(d, Path.Combine(dst, Path.GetFileName(d)));
  }

  void ShowMain() { if (closingStarted) return; if (!Visible) Show(); if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal; Activate(); BringToFront(); }

  protected override void OnFormClosing(FormClosingEventArgs e) {
    if (closingDone || e.CloseReason == CloseReason.WindowsShutDown || e.CloseReason == CloseReason.TaskManagerClosing) { SaveBounds(); tray.Visible = false; base.OnFormClosing(e); return; }
    e.Cancel = true;
    if (closingStarted) return;
    closingStarted = true;
    Shutdown();
  }
  async void Shutdown() {
    SaveBounds();
    try { /* 先让页面把还没存的字存完（最多等 4 秒） */
      if (web.CoreWebView2 != null) {
        var t = web.CoreWebView2.CallDevToolsProtocolMethodAsync("Runtime.evaluate", "{\"expression\":\"(window.QZ && QZ.flush) ? Promise.resolve(QZ.flush()).then(function(){return 1}) : 0\",\"awaitPromise\":true}");
        Hide();
        await Task.WhenAny(t, Task.Delay(4000));
      }
    } catch (Exception e) { Program.Log("关闭前保存 " + e.Message); }
    tray.Visible = false;
    Program.Log("窗口关闭，退出");
    closingDone = true;
    Close();
  }

  string BoundsFile { get { return Path.Combine(Program.AppDir, "window.txt"); } }
  void SaveBounds() {
    try { var b = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds; File.WriteAllText(BoundsFile, b.X + "," + b.Y + "," + b.Width + "," + b.Height + "," + (WindowState == FormWindowState.Maximized ? 1 : 0)); } catch (Exception) { }
  }
  void RestoreSavedBounds() {
    try {
      var p = File.ReadAllText(BoundsFile).Split(','); var r = new Rectangle(int.Parse(p[0]), int.Parse(p[1]), int.Parse(p[2]), int.Parse(p[3]));
      foreach (var s in Screen.AllScreens) if (s.WorkingArea.IntersectsWith(r) && r.Width >= 720 && r.Height >= 480) { StartPosition = FormStartPosition.Manual; Bounds = r; if (p[4] == "1") WindowState = FormWindowState.Maximized; break; }
    } catch (Exception) { }
  }
}