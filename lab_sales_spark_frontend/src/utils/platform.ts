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
