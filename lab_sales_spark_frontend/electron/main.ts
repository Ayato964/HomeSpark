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
import { autoUpdater } from "electron-updater";

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

// Child processes for local backend, TTS, and frontend
const spawnedProcesses: ChildProcess[] = [];

const isDev = process.env.NODE_ENV !== "production" || !app.isPackaged;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Configure autoUpdater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Helper to update splash screen progress and log
function updateSplash(log: string, percent: number, subLog?: string) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash-progress", { log, percent, subLog });
  }
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

// Wait until a port is open with safety timeout
async function waitForPort(port: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const isAlive = await checkPortAlive(port);
    if (isAlive) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
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
    if (fs.existsSync(backendPy) && fs.existsSync(venvPy)) {
      return candidate;
    }
  }

  return "G:\\My_Project\\spark";
}

// Resolve backend directories and Python executable
function getBackendConfig(): { backendDir: string; venvPython: string; ttsDir: string; frontendDir: string } {
  // 1. Check embedded production resources (All-in-One Standalone Package)
  if (process.resourcesPath) {
    const embeddedBackend = path.join(process.resourcesPath, "app_backend");
    const embeddedPython = path.join(embeddedBackend, ".venv", "Scripts", "python.exe");
    if (fs.existsSync(path.join(embeddedBackend, "server.py")) && fs.existsSync(embeddedPython)) {
      return {
        backendDir: embeddedBackend,
        venvPython: embeddedPython,
        ttsDir: path.join(embeddedBackend, "Irodori-TTS-Lite"),
        frontendDir: app.getAppPath(),
      };
    }
  }

  // 2. Fallback to local workspace development directory
  const rootDir = findProjectRootDir();
  const backendDir = path.join(rootDir, "lab_sales_spark_backend");
  const frontendDir = path.join(rootDir, "lab_sales_spark_frontend");
  const venvPython = path.join(backendDir, ".venv", "Scripts", "python.exe");

  return {
    backendDir,
    venvPython,
    ttsDir: path.join(backendDir, "Irodori-TTS-Lite"),
    frontendDir,
  };
}

// Locate Next.js CLI binary across packaged and unpackaged environments
function findNextCli(frontendDir: string): string | null {
  const candidates = [
    path.join(frontendDir, "node_modules", "next", "dist", "bin", "next"),
    path.join(app.getAppPath(), "node_modules", "next", "dist", "bin", "next"),
    path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "next", "dist", "bin", "next"),
    path.join(process.resourcesPath, "app_backend", "node_modules", "next", "dist", "bin", "next"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

import { promisify } from "util";
const execAsync = promisify(require("child_process").exec);

// Check if NVIDIA / dedicated GPU is present asynchronously
async function checkGpuPresent(venvPython: string): Promise<boolean> {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync('powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"', { timeout: 3000 });
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
      await execAsync(`"${venvPython}" -c "import torch; exit(0 if torch.cuda.is_available() else 1)"`, { timeout: 3000 });
      return true;
    } catch {
      // fallback
    }
  }

  return false;
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

  const splashHtmlPath = isDev
    ? path.join(__dirname, "../electron/splash.html")
    : path.join(__dirname, "splash.html");

  splashWindow.loadFile(splashHtmlPath).catch(() => {
    splashWindow?.loadFile(path.join(__dirname, "splash.html"));
  });

  splashWindow.once("ready-to-show", () => {
    splashWindow?.show();
  });

  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

// Auto-start backend, TTS, and frontend services
async function ensureAllServices() {
  const { backendDir, venvPython, ttsDir, frontendDir } = getBackendConfig();

  updateSplash("🔍 ハードウェア環境（GPU / CUDA）を診断中...", 20, "システム診断");
  const hasGpu = await checkGpuPresent(venvPython);
  console.log("[Electron] GPU Presence Diagnosis:", hasGpu);

  // 1. Ensure Backend Server (FastAPI on port 8080)
  updateSplash("🚀 FastAPI バックエンドサーバーを起動中 (8080)...", 45, "データベース＆API準備");
  const backendAlive = await checkPortAlive(8080);
  if (!backendAlive) {
    if (fs.existsSync(venvPython)) {
      try {
        const backendProc = spawn(
          venvPython,
          ["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8080"],
          {
            cwd: backendDir,
            stdio: "ignore",
            detached: false,
            shell: false,
            windowsHide: true,
          }
        );
        backendProc.on("error", (err) => console.warn("[Backend Proc Error]:", err.message));
        spawnedProcesses.push(backendProc);
      } catch (e) {
        console.error("[Electron] Failed to spawn backend:", e);
      }
    }
  }

  // 2. Ensure Local TTS Engine (port 8008) ONLY IF GPU IS PRESENT
  if (hasGpu) {
    updateSplash("🎙️ Irodori-TTS 音声合成エンジンを起動中 (8008)...", 70, "CUDA 高速音声推論");
    const ttsAlive = await checkPortAlive(8008);
    if (!ttsAlive) {
      const ttsScript = path.join(ttsDir, "app_voice.py");
      if (fs.existsSync(venvPython) && fs.existsSync(ttsScript)) {
        try {
          const ttsProc = spawn(venvPython, ["app_voice.py"], {
            cwd: ttsDir,
            stdio: "ignore",
            detached: false,
            shell: false,
            windowsHide: true,
          });
          ttsProc.on("error", (err) => console.warn("[TTS Proc Error]:", err.message));
          spawnedProcesses.push(ttsProc);
        } catch (e) {
          console.error("[Electron] Failed to spawn TTS:", e);
        }
      }
    }
  } else {
    updateSplash("⚡ GPU非搭載環境: 音声合成エンジンの起動をスキップしました", 75, "軽量テキストチャットモード");
  }

  // 3. Ensure Frontend Server (port 3000) for BOTH Production and Dev
  updateSplash("🖥️ フロントエンド UI サーバーを起動中 (3000)...", 85, "Next.js");
  const frontendAlive = await checkPortAlive(3000);
  if (!frontendAlive) {
    const nodeExe = process.execPath;
    const nextCli = findNextCli(frontendDir);
    if (nextCli && fs.existsSync(nextCli)) {
      try {
        const frontendProc = spawn(nodeExe, [nextCli, "start", "-p", "3000"], {
          cwd: frontendDir,
          stdio: "ignore",
          detached: false,
          shell: false,
          windowsHide: true,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        });
        frontendProc.on("error", (err) => console.warn("[Frontend Proc Error]:", err.message));
        spawnedProcesses.push(frontendProc);
      } catch (e) {
        console.error("[Electron] Failed to start frontend server:", e);
      }
    }
  }

  updateSplash("✨ 起動準備完了！HomeSpark GeMo を起動します...", 95);
}

function cleanupProcesses() {
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
}

// Create fallback tray icon
function createDefaultTrayIcon(): NativeImage {
  const iconPath = path.join(__dirname, "assets", "tray_icon.png");
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) return img;
  } catch {
    // fallback
  }

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

  // Wait for frontend port or fallback to loadURL
  await waitForPort(3000, 15000);

  const showAndCloseSplash = () => {
    updateSplash("🚀 準備完了！", 100);
    setTimeout(() => {
      mainWindow?.show();
      mainWindow?.focus();
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
    }, 400);
  };

  const loadWithRetry = (retries = 6) => {
    mainWindow?.loadURL(FRONTEND_URL).then(() => {
      showAndCloseSplash();
    }).catch((err) => {
      console.warn(`[Electron] loadURL failed (${retries} retries left):`, err);
      if (retries > 0) {
        setTimeout(() => loadWithRetry(retries - 1), 1000);
      } else {
        // Ultimate fallback: Always show main window even on network error
        showAndCloseSplash();
      }
    });
  };

  loadWithRetry();

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

  const overlayHtmlPath = isDev
    ? path.join(__dirname, "../electron/overlay.html")
    : path.join(__dirname, "overlay.html");

  overlayWindow.loadFile(overlayHtmlPath).catch(() => {
    overlayWindow?.loadFile(path.join(__dirname, "overlay.html"));
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
        title: "🎉 新しいバージョンが見つかりました",
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
        title: "✨ アップデートの準備が完了しました！",
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
  await ensureAllServices();
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
