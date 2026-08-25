export interface SubtitleData {
  text: string;
  sender: 'user' | 'ai' | 'status';
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
  openExternal: (url: string) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
