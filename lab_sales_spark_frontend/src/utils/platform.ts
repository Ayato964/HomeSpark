/**
 * Platform Adapter Utility for HomeSpark.
 * Handles runtime environment detection between Desktop (Electron) and Web Browser.
 */

export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.electronAPI);
}

export function isLocalStorageAvailable(): boolean {
  return isDesktopApp();
}

let cachedBackendPort: number | null = null;

/**
 * Returns the resolved backend API base URL dynamically.
 * Reads query params, localStorage persistence, Electron IPC, or defaults to dynamic local host.
 */
export function getBackendBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    // 1. Check URL query parameters (e.g. ?backendPort=8080)
    try {
      const params = new URLSearchParams(window.location.search);
      const qPort = params.get("backendPort");
      if (qPort && !isNaN(Number(qPort))) {
        const p = Number(qPort);
        cachedBackendPort = p;
        try {
          localStorage.setItem("homespark_dynamic_backend_port", p.toString());
        } catch {}
        return `http://127.0.0.1:${p}`;
      }
    } catch {
      // ignore
    }

    // 2. Check in-memory cached dynamic port
    if (cachedBackendPort) {
      return `http://127.0.0.1:${cachedBackendPort}`;
    }

    // 3. Check persistent localStorage dynamic port (resilient against OAuth redirects)
    try {
      const storedPort = localStorage.getItem("homespark_dynamic_backend_port");
      if (storedPort && !isNaN(Number(storedPort))) {
        const p = Number(storedPort);
        cachedBackendPort = p;
        return `http://127.0.0.1:${p}`;
      }
    } catch {
      // ignore
    }

    // 4. Request asynchronously from Electron for next calls
    if ((window as any).electronAPI?.getBackendPort) {
      (window as any).electronAPI.getBackendPort().then((p: number) => {
        if (p) {
          cachedBackendPort = p;
          try {
            localStorage.setItem("homespark_dynamic_backend_port", p.toString());
          } catch {}
        }
      }).catch(() => {});
    }

    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || window.location.protocol === "file:" || isDesktopApp()) {
      return `http://127.0.0.1:${cachedBackendPort || 8080}`;
    }
  }
  return "https://sales-spark-backend-84357422286.asia-northeast1.run.app";
}

