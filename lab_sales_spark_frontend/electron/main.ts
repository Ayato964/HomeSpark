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
} from "electron";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import * as http from "http";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// Child processes for local backend and TTS
const spawnedProcesses: ChildProcess[] = [];

const isDev = process.env.NODE_ENV !== "production" || !app.isPackaged;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Helper to check if a local HTTP service is alive
function checkPortAlive(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, () => {
      resolve(true);
    });
    req.on("error", () => {
      resolve(false);
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Auto-start backend services if not already running
async function ensureBackendServices() {
  const backendAlive = await checkPortAlive(8080);
  const rootDir = path.resolve(__dirname, "../../");
  const backendDir = path.join(rootDir, "lab_sales_spark_backend");
  const venvPython = path.join(backendDir, ".venv", "Scripts", "python.exe");

  if (!backendAlive) {
    console.log("[Electron] Starting local backend server (port 8080)...");
    try {
      const backendProc = spawn(
        venvPython,
        ["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8080"],
        {
          cwd: backendDir,
          stdio: "ignore",
          detached: false,
          shell: true,
        }
      );
      spawnedProcesses.push(backendProc);
    } catch (e) {
      console.error("[Electron] Failed to auto-start backend:", e);
    }
  } else {
    console.log("[Electron] Backend server already running on port 8080.");
  }

  const ttsAlive = await checkPortAlive(8008);
  if (!ttsAlive) {
    console.log("[Electron] Starting local TTS engine (port 8008)...");
    try {
      const ttsDir = path.join(backendDir, "Irodori-TTS-Lite");
      const ttsProc = spawn(venvPython, ["app_voice.py"], {
        cwd: ttsDir,
        stdio: "ignore",
        detached: false,
        shell: true,
      });
      spawnedProcesses.push(ttsProc);
    } catch (e) {
      console.error("[Electron] Failed to auto-start TTS:", e);
    }
  } else {
    console.log("[Electron] TTS engine already running on port 8008.");
  }
}

function cleanupProcesses() {
  for (const proc of spawnedProcesses) {
    try {
      if (proc.pid) {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", proc.pid.toString(), "/f", "/t"]);
        } else {
          proc.kill("SIGTERM");
        }
      }
    } catch {
      // ignore cleanup errors
    }
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "HomeSpark - 専属秘書ジェニー",
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

  if (isDev) {
    mainWindow.loadURL(FRONTEND_URL);
  } else {
    mainWindow.loadURL(FRONTEND_URL);
  }

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
          title: "HomeSpark 常駐中",
          body: "ジェニーはバックグラウンドで待機しています。Ctrl+Alt+J またはタスクバーのアイコンからいつでも呼び出せます。",
        }).show();
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = createDefaultTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("HomeSpark - 専属秘書ジェニー (待機中)");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "🎙️ ジェニーを開く (Ctrl+Alt+J)",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
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
}

// App lifecycle
app.whenReady().then(async () => {
  setupIPC();
  createTray();
  await ensureBackendServices();
  createWindow();

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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
