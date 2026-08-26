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
  shell,
  protocol,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { spawn, spawnSync, execSync, ChildProcess } from "child_process";
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

let lastSplashState = { log: "システム初期化中...", percent: 20, subLog: "高速エンジンを準備しています", isError: false, errorDetails: "" };

// Rolling buffer of startup diagnostics and process logs for user debugging/copying
const startupLogs: string[] = [];
function addStartupLog(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  const entry = `[${ts}] ${msg}`;
  startupLogs.push(entry);
  if (startupLogs.length > 300) startupLogs.shift();
  console.log(entry);
}

// Child processes for local backend and TTS
const spawnedProcesses: ChildProcess[] = [];

const isDev = !app.isPackaged;

// Configure autoUpdater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Helper to update splash screen progress and log
function updateSplash(log: string, percent: number, subLog?: string, isError: boolean = false, errorDetails?: string) {
  lastSplashState = { log, percent, subLog: subLog || "", isError, errorDetails: errorDetails || "" };
  addStartupLog(`${isError ? "[ERROR] " : ""}${log}${subLog ? ` (${subLog})` : ""}`);
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash-progress", lastSplashState);
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

// Safely terminate lingering Python/uvicorn zombie process occupying a given local TCP port
async function killProcessOnPort(port: number): Promise<void> {
  if (process.platform !== "win32") return;
  try {
    const netstatOut = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    const lines = netstatOut.split("\n");
    for (const line of lines) {
      if (line.includes("LISTENING")) {
        const parts = line.trim().split(/\s+/);
        const localAddr = parts[1] || "";
        // Strict port match: ensure localAddr ends with `:${port}` (e.g. 127.0.0.1:8008, not 127.0.0.1:18008)
        if (!localAddr.endsWith(`:${port}`)) {
          continue;
        }
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid)) && Number(pid) !== process.pid) {
          try {
            // Verify process name to avoid killing unrelated services
            const procName = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName"`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim().toLowerCase();
            if (procName.includes("python") || procName.includes("uvicorn")) {
              console.log(`[Port Cleanup] Terminating zombie Python process PID ${pid} occupying port ${port}...`);
              execSync(`taskkill /PID ${pid} /F /T`, { stdio: "ignore" });
            }
          } catch {}
        }
      }
    }
  } catch {}
}

// Helper to poll until backend /api/health returns 200 OK or times out
function waitForBackendReady(port: number, maxWaitMs: number = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      });
      req.on("error", () => {
        // still starting up
      });
      req.setTimeout(500, () => {
        req.destroy();
      });

      if (Date.now() - startTime > maxWaitMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 250);
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

// Stable origin for the renderer.
//
// The renderer used to be served over an HTTP server bound to port 0, so the
// OS handed out a different port on every launch. localStorage is keyed by
// origin (scheme://host:port), so every restart landed on a brand-new, empty
// store: the session token, the onboarding flag and the cached backend port all
// vanished, and the user had to re-link Google and re-enter their profile every
// single time. A custom scheme has a fixed origin (`homespark://app`) for the
// life of the install, so browser storage now survives restarts and updates.
const APP_SCHEME = "homespark";
const APP_ORIGIN = `${APP_SCHEME}://app`;
let appProtocolRegistered = false;

// Must run before `app.whenReady()`.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,      // gives the scheme a real, comparable origin
      secure: true,        // secure context: getUserMedia / crypto.subtle work
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function registerAppProtocol(outDir: string): void {
  if (appProtocolRegistered) return;

  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      let reqPath = decodeURIComponent(url.pathname);
      if (!reqPath || reqPath === "/") reqPath = "/index.html";

      let filePath = path.join(outDir, reqPath);

      // Keep everything inside outDir: a crafted `..` path must not escape.
      const rootReal = path.resolve(outDir);
      if (!path.resolve(filePath).startsWith(rootReal)) {
        return new Response("Forbidden", { status: 403 });
      }

      // Clean URLs and SPA fallback, mirroring the old HTTP server.
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (fs.existsSync(`${filePath}.html`)) {
          filePath = `${filePath}.html`;
        } else if (fs.existsSync(path.join(filePath, "index.html"))) {
          filePath = path.join(filePath, "index.html");
        } else {
          filePath = path.join(outDir, "index.html");
        }
      }

      if (!fs.existsSync(filePath)) {
        return new Response("Not Found", { status: 404 });
      }

      const ext = path.extname(filePath).toLowerCase();
      return new Response(fs.readFileSync(filePath), {
        status: 200,
        headers: { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" },
      });
    } catch (err) {
      console.error("[App Protocol Error]:", err);
      return new Response("Internal Error", { status: 500 });
    }
  });

  appProtocolRegistered = true;
  console.log(`[Electron] Serving renderer from ${APP_ORIGIN} (stable origin) out of ${outDir}`);
}

/**
 * Resolve the URL the main window should load.
 *
 * Prefers the fixed-origin custom scheme whenever a static export is present;
 * falls back to the dynamic-port HTTP server only when there is nothing to
 * serve (i.e. `next dev` drives the UI instead).
 */
async function resolveFrontendUrl(): Promise<string> {
  const outDir = getStaticOutDir();
  if (fs.existsSync(path.join(outDir, "index.html"))) {
    registerAppProtocol(outDir);
    dynamicFrontendUrl = APP_ORIGIN;
    return APP_ORIGIN;
  }

  addStartupLog(
    "Static export not found; falling back to the dynamic-port dev server. " +
    "Browser storage will not persist across restarts in this mode."
  );
  return startInternalHttpServer();
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

// Load persisted environment variables from AppData / user profile
function loadUserEnvironment(): Record<string, string> {
  const envMap: Record<string, string> = {};
  const appDataDir = path.join(app.getPath("appData"), "HomeSpark");
  const userEnvPath = path.join(appDataDir, ".env");
  const projectRootDir = findProjectRootDir();
  const devEnvPath = path.join(projectRootDir, "lab_sales_spark_backend", ".env");

  // If AppData .env does not exist yet, but dev .env exists, provision initial copy
  if (!fs.existsSync(userEnvPath) && fs.existsSync(devEnvPath)) {
    try {
      if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true });
      }
      fs.copyFileSync(devEnvPath, userEnvPath);
      console.log("[Electron] Initialized AppData .env from dev environment:", userEnvPath);
    } catch (e) {
      console.warn("[Electron] Failed to initialize AppData .env:", e);
    }
  }

  const envCandidates = [
    userEnvPath,
    path.join(app.getPath("home"), ".homespark", ".env"),
    devEnvPath,
  ];

  for (const p of envCandidates) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, "utf-8");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
            const idx = trimmed.indexOf("=");
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (key && !(key in envMap)) {
              envMap[key] = val;
            }
          }
        }
      } catch (err) {
        console.warn(`[Electron] Failed to parse env file at ${p}:`, err);
      }
    }
  }

  return envMap;
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

// Check if NVIDIA / dedicated GPU is present asynchronously with multi-method redundancy
async function checkGpuPresent(venvPython: string): Promise<boolean> {
  // Method 1: nvidia-smi quick check (very fast and reliable on NVIDIA systems)
  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync("nvidia-smi --query-gpu=name --format=csv,noheader", { timeout: 4000 });
      if (stdout && stdout.trim().length > 0) {
        console.log("[Electron] Detected NVIDIA GPU via nvidia-smi:", stdout.trim());
        return true;
      }
    } catch {
      // ignore and fallback
    }

    // Method 2: PowerShell Get-CimInstance
    try {
      const { stdout } = await execAsync('powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"', { timeout: 6000 });
      const out = (stdout || "").toLowerCase();
      if (out.includes("nvidia") || out.includes("geforce") || out.includes("rtx") || out.includes("gtx") || out.includes("quadro") || out.includes("radeon")) {
        console.log("[Electron] Detected GPU via PowerShell WMI:", stdout.trim());
        return true;
      }
    } catch {
      // fallback
    }
  }

  // Method 3: PyTorch CUDA check via Python runtime
  if (fs.existsSync(venvPython)) {
    try {
      await execAsync(`"${venvPython}" -c "import torch; exit(0 if torch.cuda.is_available() else 1)"`, { timeout: 8000 });
      console.log("[Electron] Detected CUDA availability via PyTorch in Python runtime");
      return true;
    } catch {
      // fallback
    }
  }

  return false;
}

// The installer ships a slim embedded Python (requirements.txt only), so the
// heavy voice stack may simply not be there. Spawning app_voice.py without it
// just produces a process that dies on `import torch`, which then surfaces as a
// confusing "connection refused" in the startup diagnostics.
// app_voice.py publishes its own state here, because loading the TTS + Whisper
// models takes about a minute during which the port stays shut. Without this we
// cannot tell a still-loading engine from a dead one, and would kill and respawn
// a healthy instance on every launch.
function readVoiceEngineStatus(): { state: string; pid?: number; port?: number } | null {
  try {
    const appdata = process.env.APPDATA || path.join(require("os").homedir(), ".homespark");
    const file = path.join(appdata, "HomeSpark", "data", "voice_engine_status.json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.includes(String(pid));
  } catch {
    return false;
  }
}

async function checkLocalTtsStack(venvPython: string): Promise<boolean> {
  if (!fs.existsSync(venvPython)) return false;
  try {
    await execAsync(
      `"${venvPython}" -c "import torch, scipy, pyopenjtalk, irodori_tts_lite"`,
      { timeout: 20000 }
    );
    return true;
  } catch {
    return false;
  }
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

// Auto-start backend and TTS services with crash monitoring & readiness check
async function ensureBackendServices() {
  const { backendDir, venvPython, ttsDir } = getBackendConfig();

  addStartupLog(`Python Runtime: ${venvPython}`);
  addStartupLog(`Backend Directory: ${backendDir}`);

  updateSplash("ハードウェア環境（GPU / CUDA）を診断中...", 20, "システム診断");
  const hasGpu = await checkGpuPresent(venvPython);
  addStartupLog(`GPU Detection Result: ${hasGpu ? "Dedicated GPU (CUDA) Active" : "CPU Mode (GPU Not Detected)"}`);

  // 1. Proactively clean up dangling zombie processes on default ports
  updateSplash("ゾンビプロセスの事前解放中...", 30, "ポートクリーンアップ");
  await killProcessOnPort(8080);
  await killProcessOnPort(8008);

  // 2. Resolve free ports dynamically
  resolvedBackendPort = await findAvailablePort(8080);
  const resolvedTtsPort = await findAvailablePort(8008);
  addStartupLog(`Resolved Ports - Backend: ${resolvedBackendPort}, TTS: ${resolvedTtsPort}`);

  // 3. Ensure Backend Server (FastAPI)
  updateSplash(`FastAPI バックエンドサーバーを起動中 (${resolvedBackendPort})...`, 45, "データベース＆API準備");
  const backendAlive = await checkPortAlive(resolvedBackendPort);
  if (!backendAlive) {
    if (fs.existsSync(venvPython)) {
      try {
        const userEnv = loadUserEnvironment();
        let lastStderr = "";
        const backendProc = spawn(
          venvPython,
          ["server.py"],
          {
            cwd: backendDir,
            stdio: "pipe",
            detached: false,
            shell: false,
            windowsHide: true,
            env: {
              ...process.env,
              ...userEnv,
              PARENT_ELECTRON_PID: process.pid.toString(),
              PORT: resolvedBackendPort.toString(),
              TTS_SERVER_URL: `http://127.0.0.1:${resolvedTtsPort}`,
            },
          }
        );

        backendProc.stdout?.on("data", (d) => {
          const s = d.toString().trim();
          addStartupLog(`[FastAPI] ${s}`);
        });

        backendProc.stderr?.on("data", (d) => {
          const s = d.toString().trim();
          addStartupLog(`[FastAPI Error] ${s}`);
          lastStderr = s;
        });

        backendProc.on("error", (err) => {
          addStartupLog(`[Backend Proc Error] ${err.message}`);
          updateSplash(`バックエンド起動失敗: ${err.message}`, 80, "エラー", true, err.message);
        });

        backendProc.on("exit", (code) => {
          addStartupLog(`[Backend Exited] code=${code}`);
          if (code !== 0 && !isQuitting) {
            updateSplash(`バックエンド異常終了 (code ${code}): ${lastStderr}`, 80, "エラー", true, lastStderr || `プロセス終了 code ${code}`);
          }
        });

        spawnedProcesses.push(backendProc);

        // Wait until FastAPI is fully ready and responding to /api/health
        updateSplash(`バックエンドの初期化完了を待機中 (${resolvedBackendPort})...`, 65, "ヘルスチェック");
        const ready = await waitForBackendReady(resolvedBackendPort, 15000);
        if (ready) {
          addStartupLog(`FastAPI backend is verified healthy on port ${resolvedBackendPort}!`);
        } else {
          addStartupLog(`FastAPI backend readiness wait timed out on port ${resolvedBackendPort}.`);
          updateSplash("バックエンド応答待機タイムアウト", 70, "フォールバックモードで続行", false, lastStderr);
        }
      } catch (e: any) {
        addStartupLog(`Failed to spawn backend: ${e?.message || e}`);
        updateSplash(`バックエンド起動例外: ${e?.message || e}`, 80, "例外エラー", true, String(e));
      }
    } else {
      addStartupLog(`Python executable not found at: ${venvPython}`);
      updateSplash("Pythonランタイムが見つかりません", 80, "環境エラー", true, `Not found: ${venvPython}`);
    }
  } else {
    addStartupLog(`FastAPI backend is already active on port ${resolvedBackendPort}`);
  }

  // 4. Ensure Local TTS Engine ONLY IF GPU IS PRESENT *and* the engine is installed
  const hasLocalTtsStack = hasGpu ? await checkLocalTtsStack(venvPython) : false;
  if (hasGpu && !hasLocalTtsStack) {
    addStartupLog(
      "Local voice engine (torch/Irodori-TTS) is not installed in the bundled Python runtime. " +
      "Skipping app_voice.py; the app will use Web Speech synthesis. " +
      "Install it from 設定 > 音声 > 音声エンジン構成."
    );
  }
  if (hasGpu && hasLocalTtsStack) {
    updateSplash(`Irodori-TTS & Whisper 音声エンジンを起動中 (${resolvedTtsPort})...`, 85, "CUDA 高速音声推論");
    const ttsAlive = await checkPortAlive(resolvedTtsPort);

    // An engine part-way through loading its models has not bound the port yet.
    // Killing it here and spawning a replacement just restarts the (slow) load
    // and doubles VRAM pressure.
    const engineStatus = readVoiceEngineStatus();
    const engineLoading =
      !!engineStatus &&
      engineStatus.state === "loading" &&
      !!engineStatus.pid &&
      isPidAlive(engineStatus.pid);

    if (engineLoading) {
      addStartupLog(
        `TTS/Whisper engine (pid ${engineStatus!.pid}) is already loading its models; leaving it alone.`
      );
    } else if (!ttsAlive) {
      await killProcessOnPort(resolvedTtsPort);
      const ttsScript = path.join(ttsDir, "app_voice.py");
      if (fs.existsSync(venvPython) && fs.existsSync(ttsScript)) {
        try {
          const userEnv = loadUserEnvironment();
          const ttsProc = spawn(venvPython, ["app_voice.py"], {
            cwd: ttsDir,
            stdio: "pipe",
            detached: false,
            shell: false,
            windowsHide: true,
            env: {
              ...process.env,
              ...userEnv,
              PYTHONPATH: `${ttsDir};${backendDir};${process.env.PYTHONPATH || ""}`,
              PARENT_ELECTRON_PID: process.pid.toString(),
              PORT: resolvedTtsPort.toString(),
            },
          });

          ttsProc.stdout?.on("data", (d) => {
            addStartupLog(`[TTS/Whisper Server] ${d.toString().trim()}`);
          });

          ttsProc.stderr?.on("data", (d) => {
            addStartupLog(`[TTS/Whisper Info] ${d.toString().trim()}`);
          });

          ttsProc.on("error", (err) => addStartupLog(`[TTS Proc Error] ${err.message}`));
          spawnedProcesses.push(ttsProc);

          // Model load takes ~60-90s. Do NOT await it: that would hold the
          // splash screen hostage for the whole load. Watch it in the
          // background and just record the outcome in the startup log; the UI
          // learns the engine is ready from /api/system/voice-engine/status.
          updateSplash("音声エンジンをバックグラウンドで初期化中...", 90, "モデル読み込みは1〜2分かかります");
          void waitForBackendReady(resolvedTtsPort, 180000).then((ttsReady) => {
            addStartupLog(
              ttsReady
                ? `TTS/Whisper engine is ready on port ${resolvedTtsPort}.`
                : `TTS engine did not respond within 180s on port ${resolvedTtsPort}.`
            );
          });
        } catch (e) {
          addStartupLog(`Failed to spawn TTS: ${e}`);
        }
      }
    }
  } else if (hasGpu) {
    updateSplash("ローカル音声エンジン未導入: Web Speech API で発話します", 85, "設定画面から追加導入できます");
  } else {
    updateSplash("GPU非搭載環境: Web Speech API で発話します", 85, "クラウド音声構成");
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
    <circle cx="8" cy="8" r="7" fill="#4285F4" />
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

  // Allow Google OAuth Sign-In by using standard Chrome User-Agent
  mainWindow.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

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

interface UpdateStatusData {
  status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "dev-mode";
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  error?: string;
  message?: string;
  releaseNotes?: string;
}

let currentUpdateStatus: UpdateStatusData = {
  status: "idle",
};

function broadcastUpdateStatus(data: UpdateStatusData) {
  currentUpdateStatus = { ...currentUpdateStatus, ...data };
  console.log(`[AutoUpdater State] -> status: ${data.status}, version: ${data.version || currentUpdateStatus.version || "N/A"}, percent: ${data.percent ?? "N/A"}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", currentUpdateStatus);
  }
}

function setupAutoUpdater() {
  autoUpdater.logger = console;
  autoUpdater.allowPrerelease = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  try {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "Ayato964",
      repo: "HomeSpark",
    });
  } catch (e: any) {
    console.warn("[AutoUpdater] setFeedURL error:", e?.message);
  }

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Checking for updates from GitHub Releases...");
    broadcastUpdateStatus({ status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[AutoUpdater] Found update-available:", info.version);
    broadcastUpdateStatus({
      status: "available",
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
    });
    if (Notification.isSupported()) {
      new Notification({
        title: "新しいバージョンが見つかりました",
        body: `HomeSpark GeMo v${info.version} をダウンロードしています...`,
      }).show();
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("[AutoUpdater] Update not-available. Current version is latest:", info?.version);
    broadcastUpdateStatus({
      status: "not-available",
      version: info?.version || app.getVersion(),
    });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    broadcastUpdateStatus({
      status: "downloading",
      version: currentUpdateStatus.version,
      percent: Math.round(progressObj.percent),
      transferred: progressObj.transferred,
      total: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[AutoUpdater] Update downloaded successfully:", info.version);
    broadcastUpdateStatus({
      status: "downloaded",
      version: info.version,
    });
    if (Notification.isSupported()) {
      new Notification({
        title: "アップデートの準備が完了しました！",
        body: "アプリを再起動すると、自動的に最新バージョンが適用されます。",
      }).show();
    }
  });

  autoUpdater.on("error", (err) => {
    console.warn("[AutoUpdater Error]:", err?.message);
    broadcastUpdateStatus({
      status: "error",
      error: err?.message || String(err),
      version: currentUpdateStatus.version,
    });
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
          broadcastUpdateStatus({ status: "checking" });
          autoUpdater.checkForUpdates().catch((err) => {
            console.warn("[Tray] checkForUpdates failed:", err);
            broadcastUpdateStatus({ status: "error", error: err?.message || String(err) });
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

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("get-backend-port", () => {
    return resolvedBackendPort;
  });

  ipcMain.handle("get-startup-logs", () => {
    return startupLogs;
  });

  ipcMain.handle("get-update-status", () => {
    return currentUpdateStatus;
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

  ipcMain.on("check-for-updates", async () => {
    if (!isDev) {
      try {
        console.log("[IPC] Manual check-for-updates triggered");
        broadcastUpdateStatus({ status: "checking" });
        const res = await autoUpdater.checkForUpdates();
        console.log("[IPC] checkForUpdates triggered successfully, updateInfo:", res?.updateInfo?.version);
        if (res?.downloadPromise) {
          res.downloadPromise.catch((dlErr: any) => {
            console.warn("[AutoUpdater Download Promise Error]:", dlErr?.message);
            broadcastUpdateStatus({ status: "error", error: dlErr?.message || String(dlErr), version: res.updateInfo?.version });
          });
        }
      } catch (err: any) {
        console.warn("[IPC] checkForUpdates failed:", err?.message);
        broadcastUpdateStatus({ status: "error", error: err?.message || String(err) });
      }
    } else {
      console.log("[IPC] In development mode, reporting dev-mode update-status");
      broadcastUpdateStatus({
        status: "dev-mode",
        message: "開発モード（未パッケージ）で実行中のため、自動更新は無効です。最新版は GitHub Releases から入手できます。"
      });
    }
  });

  // Restarting is how a freshly installed local voice engine gets picked up:
  // the engine probe and app_voice.py spawn both happen during startup.
  ipcMain.on("restart-app", () => {
    console.log("[IPC] restart-app requested.");
    isQuitting = true;
    cleanupProcesses();
    app.relaunch();
    // quit(), not exit(): a hard exit skips Chromium's shutdown, which is when
    // pending localStorage writes are flushed to disk.
    app.quit();
  });

  ipcMain.on("restart-and-install-update", () => {
    console.log("[IPC] restart-and-install-update requested. Quitting and installing...");
    isQuitting = true;
    cleanupProcesses();
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err: any) {
      console.error("[AutoUpdater] quitAndInstall failed:", err);
      app.quit();
    }
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

  ipcMain.on("open-external", (_event, url: string) => {
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      shell.openExternal(url);
    }
  });

  ipcMain.handle("get-onboarding-status", () => {
    const config = readAppConfig();
    return {
      onboardingDone: Boolean(config.onboardingDone),
      voiceSupported: Boolean(config.voiceSupported),
    };
  });

  ipcMain.handle("set-onboarding-complete", (_event, { voiceEnabled }: { voiceEnabled: boolean }) => {
    writeAppConfig({
      onboardingDone: true,
      voiceSupported: Boolean(voiceEnabled),
    });
    return { success: true };
  });

  ipcMain.handle("get-app-config", () => {
    return readAppConfig();
  });

  ipcMain.handle("set-app-config", (_event, config: Record<string, any>) => {
    writeAppConfig(config);
    return { success: true };
  });
}

function getAppConfigPath(): string {
  const appData = process.env.APPDATA || (process.platform === "darwin" ? path.join(process.env.HOME || "", "Library/Application Support") : path.join(process.env.HOME || "", ".config"));
  const dir = path.join(appData, "HomeSpark");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "app_config.json");
}

function readAppConfig(): Record<string, any> {
  try {
    const p = getAppConfigPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch (e) {
    console.warn("[AppConfig] Failed to read app config:", e);
  }
  return {};
}

function writeAppConfig(update: Record<string, any>): void {
  try {
    const p = getAppConfigPath();
    const current = readAppConfig();
    const merged = { ...current, ...update };
    fs.writeFileSync(p, JSON.stringify(merged, null, 2), "utf-8");
  } catch (e) {
    console.warn("[AppConfig] Failed to write app config:", e);
  }
}

// App lifecycle
app.whenReady().then(async () => {
  createSplashWindow();
  setupIPC();
  setupAutoUpdater();
  createTray();
  await resolveFrontendUrl();
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
