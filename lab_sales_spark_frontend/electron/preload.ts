import { contextBridge, ipcRenderer } from "electron";

export interface SubtitleData {
  text: string;
  sender: "user" | "ai" | "status";
}

export interface UpdateStatusData {
  status: "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "dev-mode";
  version?: string;
  percent?: number;
  error?: string;
  message?: string;
}

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  appVersion: string;
  getAppVersion: () => Promise<string>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  hideToTray: () => void;
  isMaximized: () => Promise<boolean>;
  showNotification: (title: string, body: string) => void;
  onWindowStateChange: (callback: (isMaximized: boolean) => void) => () => void;
  updateSubtitle: (subtitle: SubtitleData | null) => void;
  onSubtitleMessage: (callback: (subtitle: SubtitleData | null) => void) => () => void;
  checkForUpdates: () => void;
  restartAndInstallUpdate: () => void;
  onUpdateStatus: (callback: (data: UpdateStatusData) => void) => () => void;
  getBackendPort: () => Promise<number>;
  getStartupLogs: () => Promise<string[]>;
  openExternal: (url: string) => void;
  getOnboardingStatus: () => Promise<{ onboardingDone: boolean; voiceSupported: boolean }>;
  setOnboardingComplete: (voiceEnabled: boolean) => Promise<{ success: boolean }>;
  getAppConfig: () => Promise<Record<string, any>>;
  setAppConfig: (config: Record<string, any>) => Promise<{ success: boolean }>;
}

const electronAPI: ElectronAPI = {
  isElectron: true,
  platform: process.platform,
  appVersion: "3.2.0",
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  hideToTray: () => ipcRenderer.send("window-hide-to-tray"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  showNotification: (title: string, body: string) =>
    ipcRenderer.send("show-notification", { title, body }),
  onWindowStateChange: (callback: (isMaximized: boolean) => void) => {
    const subscription = (_event: unknown, isMax: boolean) => callback(isMax);
    ipcRenderer.on("window-state-changed", subscription);
    return () => {
      ipcRenderer.removeListener("window-state-changed", subscription);
    };
  },
  updateSubtitle: (subtitle: SubtitleData | null) => {
    ipcRenderer.send("update-subtitle", subtitle);
  },
  onSubtitleMessage: (callback: (subtitle: SubtitleData | null) => void) => {
    const subscription = (_event: unknown, data: SubtitleData | null) => callback(data);
    ipcRenderer.on("subtitle-data", subscription);
    return () => {
      ipcRenderer.removeListener("subtitle-data", subscription);
    };
  },
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),
  restartAndInstallUpdate: () => ipcRenderer.send("restart-and-install-update"),
  onUpdateStatus: (callback: (data: UpdateStatusData) => void) => {
    const subscription = (_event: unknown, data: UpdateStatusData) => callback(data);
    ipcRenderer.on("update-status", subscription);
    return () => {
      ipcRenderer.removeListener("update-status", subscription);
    };
  },
  getBackendPort: () => ipcRenderer.invoke("get-backend-port"),
  getStartupLogs: () => ipcRenderer.invoke("get-startup-logs"),
  openExternal: (url: string) => ipcRenderer.send("open-external", url),
  getOnboardingStatus: () => ipcRenderer.invoke("get-onboarding-status"),
  setOnboardingComplete: (voiceEnabled: boolean) =>
    ipcRenderer.invoke("set-onboarding-complete", { voiceEnabled }),
  getAppConfig: () => ipcRenderer.invoke("get-app-config"),
  setAppConfig: (config: Record<string, any>) => ipcRenderer.invoke("set-app-config", config),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
