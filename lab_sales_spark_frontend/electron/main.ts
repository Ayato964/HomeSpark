import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  NativeImage,
  globalShortcut,
  Notification,
  screen,
  dialog,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { spawn, spawnSync, ChildProcess } from "child_process";
import * as http from "http";
import { promisify } from "util";
import { autoUpdater } from "electron-updater";

const execAsync = promisify(require("child_process").exec);

// Crash resilience: Catch any unexpected exceptions
process.on("uncaughtException", (error) => {
  console.error("[Electron Main] Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Electron Main] Unhandled Rejection:", reason);
});

let splashWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let overlayHideTimer: NodeJS.Timeout | null = null;
let internalServer: http.Server | null = null;
let dynamicFrontendUrl: string = "http://127.0.0.1:3000";
let resolvedBackendPort: number = 8080;

let lastSplashState = { log: "システム初期化中...", percent: 20, subLog: "高速エンジンを準備しています" };

// Child processes for local backend and TTS
const spawnedProcesses: ChildProcess[] = [];

const isDev = process.env.NODE_ENV !== "production" || !app.isPackaged;

// Configure autoUpdater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Helper to update splash screen progress and log
function updateSplash(log: string, percent: number, subLog?: string) {
  lastSplashState = { log, percent, subLog: subLog || "" };
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash-progress", { log, percent, subLog });
  }
}

// Find an available port dynamically (tries startPort first, then assigns OS free port)
function findAvailablePort(startPort: number = 8080): Promise<number> {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(startPort, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : startPort;
      srv.close(() => resolve(port));
    });
    srv.on("error", () => {
      // Port in use, get OS dynamic port
      const dynSrv = http.createServer();
      dynSrv.listen(0, "127.0.0.1", () => {
        const addr = dynSrv.address();
        const port = typeof addr === "object" && addr ? addr.port : startPort + 1;
        dynSrv.close(() => resolve(port));
      });
      dynSrv.on("error", () => resolve(startPort + 1));
    });
  });
}

// MIME types for embedded static server
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

// Locate Next.js static export `out` directory
function getStaticOutDir(): string {
  const candidates = [
    path.join(__dirname, "../out"),
    path.join(app.getAppPath(), "out"),
    path.join(process.resourcesPath, "app.asar", "out"),
    path.resolve(__dirname, "../../out"),
    path.join(process.cwd(), "out"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "index.html"))) {
      console.log("[Electron] Serving static frontend from:", c);
      return c;
    }
  }

  return path.join(app.getAppPath(), "out");
}

// Start embedded HTTP server with DYNAMIC PORT ASSIGNMENT (ZERO PORT CONFLICTS)
function startInternalHttpServer(): Promise<string> {
  return new Promise((resolve) => {
    if (internalServer) {
      resolve(dynamicFrontendUrl);
      return;
    }

    const outDir = getStaticOutDir();

    internalServer = http.createServer((req, res) => {
      try {
        let reqPath = decodeURI(req.url?.split("?")[0] || "/");
        if (reqPath === "/") reqPath = "/index.html";

        let filePath = path.join(outDir, reqPath);

        // Fallback for clean URLs or SPA routing
        if (!fs.existsSync(filePath)) {
          if (fs.existsSync(filePath + ".html")) {
            filePath = filePath + ".html";
          } else {
            filePath = path.join(outDir, "index.html");
          }
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          const data = fs.readFileSync(filePath);
          res.writeHead(200, {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
          });
          res.end(data);
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      } catch (err) {
        console.error("[Internal Server Error]:", err);
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });

    // Listen on dynamic port 0 (OS automatically assigns a free port)
    internalServer.listen(0, "127.0.0.1", () => {
      const addr = internalServer?.address();
      const port = typeof addr === "object" && addr ? addr.port : 3000;
      dynamicFrontendUrl = `http://127.0.0.1:${port}`;
      console.log(`[Electron] Internal Frontend Server dynamically assigned port at ${dynamicFrontendUrl}`);
      resolve(dynamicFrontendUrl);
    });

    internalServer.on("error", (e: any) => {
      console.error("[Internal Server Port Error]:", e);
      resolve("http://127.0.0.1:3000");
    });
  });
}

// Helper to check if a local HTTP service is alive
function checkPortAlive(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, () => {
      resolve(true);
    });
    req.on("error", () => {
      resolve(false);
    });
    req.setTimeout(600, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Dynamically locate the workspace root folder for development
function findProjectRootDir(): string {
  const candidates = [
    path.resolve(__dirname, "../../"),
    path.resolve(process.resourcesPath, "../../../../"),
    path.resolve(process.resourcesPath, "../../../"),
    path.resolve(app.getAppPath(), "../../../../"),
    path.resolve(app.getAppPath(), "../../../"),
    process.cwd(),
    "G:\\My_Project\\spark",
  ];

  for (const candidate of candidates) {
    const backendPy = path.join(candidate, "lab_sales_spark_backend", "server.py");
    const venvPy = path.join(candidate, "lab_sales_spark_backend", ".venv", "Scripts", "python.exe");
    const portablePy = path.join(candidate, "lab_sales_spark_backend", "python_runtime", "python.exe");
    if (fs.existsSync(backendPy) && (fs.existsSync(venvPy) || fs.existsSync(portablePy))) {
      return candidate;
    }
  }

  return "G:\\My_Project\\spark";
}

// Resolve backend directories and Python executable
function getBackendConfig(): { backendDir: string; venvPython: string; ttsDir: string } {
  if (process.resourcesPath) {
    const embeddedBackend = path.join(process.resourcesPath, "app_backend");
    const portablePython = path.join(embeddedBackend, "python_runtime", "python.exe");
    const venvPython = path.join(embeddedBackend, ".venv", "Scripts", "python.exe");

    const resolvedPython = fs.existsSync(portablePython)
      ? portablePython
      : (fs.existsSync(venvPython) ? venvPython : "python.exe");

    if (fs.existsSync(path.join(embeddedBackend, "server.py"))) {
      console.log("[Electron] Using standalone embedded backend with Python:", resolvedPython);
      return {
        backendDir: embeddedBackend,
        venvPython: resolvedPython,
        ttsDir: path.join(embeddedBackend, "Irodori-TTS-Lite"),
      };
    }
  }

  const rootDir = findProjectRootDir();
  const backendDir = path.join(rootDir, "lab_sales_spark_backend");
  const portablePython = path.join(backendDir, "python_runtime", "python.exe");
  const venvPython = path.join(backendDir, ".venv", "Scripts", "python.exe");

  const resolvedPython = fs.existsSync(portablePython)
    ? portablePython
    : (fs.existsSync(venvPython) ? venvPython : "python.exe");

  return {
    backendDir,
    venvPython: resolvedPython,
    ttsDir: path.join(backendDir, "Irodori-TTS-Lite"),
  };
}

// Check if NVIDIA / dedicated GPU is present asynchronously
async function checkGpuPresent(venvPython: string): Promise<boolean> {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync('powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"', { timeout: 2500 });
      const out = (stdout || "").toLowerCase();
      if (out.includes("nvidia") || out.includes("geforce") || out.includes("rtx") || out.includes("gtx") || out.includes("quadro") || out.includes("radeon")) {
        return true;
      }
    } catch {
      // fallback
    }
  }

  if (fs.existsSync(venvPython)) {
    try {
      await execAsync(`"${venvPython}" -s -E -c "import torch; exit(0 if torch.cuda.is_available() else 1)"`, { timeout: 2500 });
      return true;
    } catch {
      // fallback
    }
  }

  return false;
}

// Find splash.html or return fallback data URL
function getSplashHtmlUrl(): string {
  const candidates = [
    path.join(__dirname, "splash.html"),
    path.join(__dirname, "../electron/splash.html"),
    path.join(app.getAppPath(), "dist-electron/splash.html"),
    path.join(app.getAppPath(), "electron/splash.html"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return `file://${c.replace(/\\/g, "/")}`;
    }
  }

  const fallbackHtml = `<!DOCTYPE html><html><body style="background:#0d0f17;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;border-radius:16px;border:1px solid rgba(255,255,255,0.1);"><h2 style="margin-bottom:8px;">HomeSpark GeMo</h2><p id="log-text" style="font-size:12px;color:#94a3b8;">起動中...</p></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`;
}

// Create animated splash window
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const splashUrl = getSplashHtmlUrl();
  splashWindow.loadURL(splashUrl);

  splashWindow.once("ready-to-show", () => {
    splashWindow?.show();
  });

  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

// Auto-start backend and TTS services with crash monitoring & isolation (-s -E)
async function ensureBackendServices() {
  const { backendDir, venvPython, ttsDir } = getBackendConfig();

  updateSplash("ハードウェア環境（GPU / CUDA）を診断中...", 25, "システム診断");
  const hasGpu = await checkGpuPresent(venvPython);
  console.log("[Electron] GPU Presence Diagnosis:", hasGpu);

  // 1. Resolve free backend port dynamically
  resolvedBackendPort = await findAvailablePort(8080);
  console.log(`[Electron] Starting FastAPI backend on dynamically resolved port: ${resolvedBackendPort}`);

  // 2. Ensure Backend Server (FastAPI)
  updateSplash(`FastAPI バックエンドサーバーを起動中 (${resolvedBackendPort})...`, 50, "データベース＆API準備");
  const backendAlive = await checkPortAlive(resolvedBackendPort);
  if (!backendAlive) {
    if (fs.existsSync(venvPython)) {
      try {
        const backendProc = spawn(
          venvPython,
          ["-s", "-E", "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", resolvedBackendPort.toString()],
          {
            cwd: backendDir,
            stdio: "pipe",
            detached: false,
            shell: false,
            windowsHide: true,
            env: { ...process.env, PARENT_ELECTRON_PID: process.pid.toString(), PORT: resolvedBackendPort.toString() },
          }
        );

        backendProc.stderr?.on("data", (d) => {
          console.log("[FastAPI Output]:", d.toString().trim());
        });

        backendProc.on("error", (err) => {
          console.warn("[Backend Proc Error]:", err.message);
          updateSplash(`バックエンド起動失敗: ${err.message}`, 80);
        });

        backendProc.on("exit", (code) => {
          console.warn(`[Backend Exited]: code=${code}`);
          if (code !== 0 && !isQuitting) {
            updateSplash(`バックエンドが異常終了しました (code: ${code})`, 80);
          }
        });

        spawnedProcesses.push(backendProc);
      } catch (e: any) {
        console.error("[Electron] Failed to spawn backend:", e);
        updateSplash(`バックエンド起動例外: ${e?.message || e}`, 80);
      }
    }
  }

  // 3. Ensure Local TTS Engine (port 8008) ONLY IF GPU IS PRESENT
  if (hasGpu) {
    updateSplash("Irodori-TTS 音声合成エンジンを起動中 (8008)...", 75, "CUDA 高速音声推論");
    const ttsAlive = await checkPortAlive(8008);
    if (!ttsAlive) {
      const ttsScript = path.join(ttsDir, "app_voice.py");
      if (fs.existsSync(venvPython) && fs.existsSync(ttsScript)) {
        try {
          const ttsProc = spawn(venvPython, ["-s", "-E", "app_voice.py"], {
            cwd: ttsDir,
            stdio: "pipe",
            detached: false,
            shell: false,
            windowsHide: true,
            env: { ...process.env, PARENT_ELECTRON_PID: process.pid.toString() },
          });

          ttsProc.on("error", (err) => console.warn("[TTS Proc Error]:", err.message));
          spawnedProcesses.push(ttsProc);
        } catch (e) {
          console.error("[Electron] Failed to spawn TTS:", e);
        }
      }
    }
  } else {
    updateSplash("GPU非搭載環境: 音声合成エンジンの起動をスキップしました", 75, "軽量テキストチャットモード");
  }

  updateSplash("準備完了！HomeSpark GeMo を起動します...", 95);
}

// Complete zombie process annihilation via taskkill tree kill
function cleanupProcesses() {
  if (internalServer) {
    try {
      internalServer.close();
    } catch {
      // ignore
    }
  }

  for (const proc of spawnedProcesses) {
    try {
      if (proc.pid) {
        if (process.platform === "win32") {
          spawnSync("taskkill", ["/pid", proc.pid.toString(), "/t", "/f"], { windowsHide: true });
        } else {
          proc.kill("SIGTERM");
        }
      }
    } catch {
      // ignore
    }
  }
}

// Create fallback tray icon
function createDefaultTrayIcon(): NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="7" fill="#6366f1" />
    <path d="M8 4a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0V6a2 2 0 0 0-2-2z" fill="#ffffff" />
    <path d="M5 8a3 3 0 0 0 6 0" stroke="#ffffff" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "HomeSpark GeMo - 専属秘書GeMo",
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0d0f17",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const showAndCloseSplash = () => {
    updateSplash("準備完了！", 100);
    setTimeout(() => {
      mainWindow?.show();
      mainWindow?.focus();
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
    }, 300);
  };

  const targetUrl = `${dynamicFrontendUrl}/?backendPort=${resolvedBackendPort}`;

  mainWindow.loadURL(targetUrl).then(() => {
    showAndCloseSplash();
  }).catch((err) => {
    console.warn("[Electron] Initial loadURL failed, retrying:", err);
    setTimeout(() => {
      mainWindow?.loadURL(targetUrl).finally(() => {
        showAndCloseSplash();
      });
    }, 600);
  });

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window-state-changed", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window-state-changed", false);
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: "HomeSpark GeMo 常駐中",
          body: "GeMo（ジェモ）はバックグラウンドで待機しています。Ctrl+Alt+J またはタスクバーのアイコンからいつでも呼び出せます。",
        }).show();
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const overlayWidth = 680;
  const overlayHeight = 90;

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: Math.round((width - overlayWidth) / 2),
    y: height - overlayHeight - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true);
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  const overlayHtmlPath = path.join(__dirname, "overlay.html");
  overlayWindow.loadFile(overlayHtmlPath).catch(() => {
    overlayWindow?.loadFile(path.join(__dirname, "../electron/overlay.html"));
  });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

function setupAutoUpdater() {
  autoUpdater.on("checking-for-update", () => {
    mainWindow?.webContents.send("update-status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update-status", { status: "available", version: info.version });
    if (Notification.isSupported()) {
      new Notification({
        title: "新しいバージョンが見つかりました",
        body: `HomeSpark GeMo v${info.version} をダウンロードしています...`,
      }).show();
    }
  });

  autoUpdater.on("update-not-available", () => {
    mainWindow?.webContents.send("update-status", { status: "not-available" });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    mainWindow?.webContents.send("update-status", {
      status: "downloading",
      percent: Math.round(progressObj.percent),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("update-status", { status: "downloaded", version: info.version });
    if (Notification.isSupported()) {
      new Notification({
        title: "アップデートの準備が完了しました！",
        body: "アプリを再起動すると、自動的に最新バージョンが適用されます。",
      }).show();
    }
  });

  autoUpdater.on("error", (err) => {
    console.warn("[AutoUpdater Error]:", err?.message);
    mainWindow?.webContents.send("update-status", { status: "error", error: err?.message });
  });
}

function createTray() {
  const icon = createDefaultTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("HomeSpark GeMo - 専属秘書GeMo (待機中)");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "GeMoを開く (Ctrl+Alt+J)",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "アップデートを確認",
      click: () => {
        if (!isDev) {
          autoUpdater.checkForUpdates().catch((err) => {
            console.warn("[Tray] checkForUpdates failed:", err);
          });
        } else {
          dialog.showMessageBox({
            type: "info",
            title: "アップデート確認",
            message: "開発モードで稼働中です。パッケージ版（.exe）にて自動更新が有効になります。",
          });
        }
      },
    },
    {
      label: "再読み込み",
      click: () => {
        mainWindow?.reload();
      },
    },
    {
      label: "開発者ツール",
      click: () => {
        mainWindow?.webContents.toggleDevTools();
      },
    },
    { type: "separator" },
    {
      label: "完全に終了",
      click: () => {
        isQuitting = true;
        cleanupProcesses();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function setupIPC() {
  ipcMain.on("splash-ready", () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send("splash-progress", lastSplashState);
    }
  });

  ipcMain.handle("get-backend-port", () => {
    return resolvedBackendPort;
  });

  ipcMain.on("window-minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on("window-close", () => {
    mainWindow?.close();
  });

  ipcMain.on("window-hide-to-tray", () => {
    mainWindow?.hide();
  });

  ipcMain.handle("window-is-maximized", () => {
    return mainWindow?.isMaximized() ?? false;
  });

  ipcMain.on("show-notification", (_event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });

  ipcMain.on("check-for-updates", () => {
    if (!isDev) {
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn("[IPC] checkForUpdates failed:", err);
      });
    } else {
      mainWindow?.webContents.send("update-status", { status: "not-available" });
    }
  });

  ipcMain.on("restart-and-install-update", () => {
    isQuitting = true;
    cleanupProcesses();
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.on("update-subtitle", (_event, subtitle) => {
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("subtitle-data", subtitle);

      if (subtitle && subtitle.text && subtitle.text.trim().length > 0) {
        if (!overlayWindow.isVisible()) {
          overlayWindow.showInactive();
        }
      } else {
        overlayHideTimer = setTimeout(() => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send("subtitle-data", null);
            setTimeout(() => {
              if (overlayWindow && !overlayWindow.isDestroyed()) {
                overlayWindow.hide();
              }
            }, 300);
          }
        }, 1500);
      }
    }
  });
}

// App lifecycle
app.whenReady().then(async () => {
  createSplashWindow();
  setupIPC();
  setupAutoUpdater();
  createTray();
  await startInternalHttpServer();
  await ensureBackendServices();
  await createWindow();
  createOverlayWindow();

  globalShortcut.register("CommandOrControl+Alt+J", () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((e) => {
        console.warn("[AutoUpdater Launch]:", e?.message);
      });
    }, 4000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createOverlayWindow();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  cleanupProcesses();
});

app.on("before-quit", () => {
  isQuitting = true;
  cleanupProcesses();
});

app.on("window-all-closed", () => {
  // Keep running in tray
});
