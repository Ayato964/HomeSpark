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
import { spawn, spawnSync, execSync, ChildProcess } from "child_process";
import * as http from "http";
import { autoUpdater } from "electron-updater";

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let overlayHideTimer: NodeJS.Timeout | null = null;

// Child processes for local backend, TTS, and frontend
const spawnedProcesses: ChildProcess[] = [];

const isDev = process.env.NODE_ENV !== "production" || !app.isPackaged;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Configure autoUpdater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Helper to check if a local HTTP service is alive
function checkPortAlive(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, () => {
      resolve(true);
    });
    req.on("error", () => {
      resolve(false);
    });
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Wait until a port is open
async function waitForPort(port: number, timeoutMs = 35000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const isAlive = await checkPortAlive(port);
    if (isAlive) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

// Dynamically locate the workspace root folder
function findProjectRootDir(): string {
  const candidates = [
    path.resolve(__dirname, "../../"), // electron/dist/main.js -> root
    path.resolve(process.resourcesPath, "../../../../"), // win-unpacked/resources -> root
    path.resolve(process.resourcesPath, "../../../"),
    path.resolve(app.getAppPath(), "../../../../"),
    path.resolve(app.getAppPath(), "../../../"),
    process.cwd(),
    "G:\\My_Project\\spark",
  ];

  for (const candidate of candidates) {
    const backendPy = path.join(candidate, "lab_sales_spark_backend", "server.py");
    const venvPy = path.join(candidate, "lab_sales_spark_backend", ".venv", "Scripts", "python.exe");
    if (fs.existsSync(backendPy) && fs.existsSync(venvPy)) {
      console.log("[Electron] Found valid project root directory:", candidate);
      return candidate;
    }
  }

  return "G:\\My_Project\\spark";
}

// Auto-start backend, TTS, and frontend services
async function ensureAllServices() {
  const rootDir = findProjectRootDir();
  const backendDir = path.join(rootDir, "lab_sales_spark_backend");
  const frontendDir = path.join(rootDir, "lab_sales_spark_frontend");
  const venvPython = path.join(backendDir, ".venv", "Scripts", "python.exe");

  // 1. Ensure Backend Server (port 8080)
  const backendAlive = await checkPortAlive(8080);
  if (!backendAlive) {
    console.log("[Electron] Auto-starting FastAPI backend server (port 8080)...");
    try {
      const backendProc = spawn(
        venvPython,
        ["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8080"],
        {
          cwd: backendDir,
          stdio: "ignore",
          detached: false,
          shell: true,
          windowsHide: true,
        }
      );
      spawnedProcesses.push(backendProc);
    } catch (e) {
      console.error("[Electron] Failed to auto-start backend:", e);
    }
  } else {
    console.log("[Electron] Backend server already running on port 8080.");
  }

  // 2. Ensure Local TTS Engine (port 8008)
  const ttsAlive = await checkPortAlive(8008);
  if (!ttsAlive) {
    console.log("[Electron] Auto-starting local TTS engine (port 8008)...");
    try {
      const ttsDir = path.join(backendDir, "Irodori-TTS-Lite");
      const ttsProc = spawn(venvPython, ["app_voice.py"], {
        cwd: ttsDir,
        stdio: "ignore",
        detached: false,
        shell: true,
        windowsHide: true,
      });
      spawnedProcesses.push(ttsProc);
    } catch (e) {
      console.error("[Electron] Failed to auto-start TTS:", e);
    }
  } else {
    console.log("[Electron] TTS engine already running on port 8008.");
  }

  // 3. Ensure Frontend Next.js Server (port 3000)
  const frontendAlive = await checkPortAlive(3000);
  if (!frontendAlive) {
    console.log("[Electron] Auto-starting Next.js frontend server (port 3000)...");
    try {
      const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
      const frontendProc = spawn(npxCmd, ["next", "start", "-p", "3000"], {
        cwd: frontendDir,
        stdio: "ignore",
        detached: false,
        shell: true,
        windowsHide: true,
      });
      spawnedProcesses.push(frontendProc);
    } catch (e) {
      console.error("[Electron] Failed to auto-start frontend:", e);
    }
  } else {
    console.log("[Electron] Frontend server already running on port 3000.");
  }
}

function cleanupProcesses() {
  // 1. Kill tracked spawned processes and their complete process trees
  for (const proc of spawnedProcesses) {
    try {
      if (proc.pid) {
        if (process.platform === "win32") {
          spawnSync("taskkill", ["/pid", proc.pid.toString(), "/f", "/t"], { windowsHide: true });
        } else {
          proc.kill("SIGTERM");
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Extra safety on Windows: Kill any lingering processes on ports 8080, 8008, 3000
  if (process.platform === "win32") {
    try {
      execSync('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :8080\') do taskkill /f /pid %a', { stdio: "ignore", windowsHide: true });
    } catch {}
    try {
      execSync('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :8008\') do taskkill /f /pid %a', { stdio: "ignore", windowsHide: true });
    } catch {}
    try {
      execSync('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :3000\') do taskkill /f /pid %a', { stdio: "ignore", windowsHide: true });
    } catch {}
  }
}

// Create fallback 16x16 / 32x32 colored tray icon if no png exists
function createDefaultTrayIcon(): NativeImage {
  const iconPath = path.join(__dirname, "assets", "tray_icon.png");
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) return img;
  } catch {
    // fallback
  }

  // Create simple 16x16 SVG data URL icon
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
    frame: false, // Custom title bar
    titleBarStyle: "hidden",
    backgroundColor: "#0d0f17",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // Keep audio and websocket alive in background
    },
  });

  // Wait for port 3000 to be ready before loading
  await waitForPort(3000, 35000);

  const loadWithRetry = (retries = 8) => {
    mainWindow?.loadURL(FRONTEND_URL).catch((err) => {
      console.warn(`[Electron] loadURL failed (${retries} retries left):`, err);
      if (retries > 0) {
        setTimeout(() => loadWithRetry(retries - 1), 1000);
      }
    });
  };

  loadWithRetry();

  // Window state listeners
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window-state-changed", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window-state-changed", false);
  });

  // Minimize to tray instead of quitting on close button
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
    y: height - overlayHeight - 20, // Bottom center above taskbar
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

  const overlayHtmlPath = isDev
    ? path.join(__dirname, "../electron/overlay.html")
    : path.join(__dirname, "overlay.html");

  overlayWindow.loadFile(overlayHtmlPath).catch(() => {
    // fallback if path differs
    overlayWindow?.loadFile(path.join(__dirname, "overlay.html"));
  });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

// Setup auto-updater listeners
function setupAutoUpdater() {
  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Checking for update...");
    mainWindow?.webContents.send("update-status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[AutoUpdater] Update available:", info.version);
    mainWindow?.webContents.send("update-status", { status: "available", version: info.version });
    if (Notification.isSupported()) {
      new Notification({
        title: "🎉 新しいバージョンが見つかりました",
        body: `HomeSpark GeMo v${info.version} をバックグラウンドでダウンロードしています...`,
      }).show();
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("[AutoUpdater] Update not available. Current version is latest.");
    mainWindow?.webContents.send("update-status", { status: "not-available" });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    console.log(`[AutoUpdater] Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
    mainWindow?.webContents.send("update-status", {
      status: "downloading",
      percent: Math.round(progressObj.percent),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[AutoUpdater] Update downloaded:", info.version);
    mainWindow?.webContents.send("update-status", { status: "downloaded", version: info.version });
    if (Notification.isSupported()) {
      new Notification({
        title: "✨ アップデートの準備が完了しました！",
        body: "アプリを再起動すると、自動的に最新バージョンが適用されます。",
      }).show();
    }
  });

  autoUpdater.on("error", (err) => {
    console.warn("[AutoUpdater] Error during update check:", err?.message);
    mainWindow?.webContents.send("update-status", { status: "error", error: err?.message });
  });
}

function createTray() {
  const icon = createDefaultTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("HomeSpark GeMo - 専属秘書GeMo (待機中)");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "🎙️ GeMoを開く (Ctrl+Alt+J)",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "🔄 アップデートを確認",
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
      label: "🔄 再読み込み",
      click: () => {
        mainWindow?.reload();
      },
    },
    {
      label: "⚙️ 開発者ツール",
      click: () => {
        mainWindow?.webContents.toggleDevTools();
      },
    },
    { type: "separator" },
    {
      label: "❌ 完全に終了",
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

// IPC Handlers
function setupIPC() {
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

  // Auto-updater IPC triggers
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

  // Handle Subtitle updates from renderer process
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
  setupIPC();
  setupAutoUpdater();
  createTray();
  await ensureAllServices();
  await createWindow();
  createOverlayWindow();

  // Register Global Shortcut (Ctrl + Alt + J / Cmd + Alt + J)
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

  // Check for updates on launch in packaged mode
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((e) => {
        console.warn("[AutoUpdater] Launch check error:", e?.message);
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
  if (process.platform !== "darwin") {
    // Keep running in tray on Windows/Linux
  }
});
