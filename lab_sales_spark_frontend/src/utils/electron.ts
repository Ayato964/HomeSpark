import type { ElectronAPI } from "../types/electron";

export function isElectron(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.electronAPI?.isElectron);
}

export function getElectronAPI(): ElectronAPI | undefined {
  if (typeof window === "undefined") return undefined;
  return window.electronAPI;
}

export function showNativeNotification(title: string, body: string) {
  const api = getElectronAPI();
  if (api) {
    api.showNotification(title, body);
  } else if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}
