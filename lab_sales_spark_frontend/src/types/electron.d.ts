export interface SubtitleData {
  text: string;
  sender: "user" | "ai" | "status";
}

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  hideToTray: () => void;
  isMaximized: () => Promise<boolean>;
  showNotification: (title: string, body: string) => void;
  onWindowStateChange: (callback: (isMaximized: boolean) => void) => () => void;
  updateSubtitle: (subtitle: SubtitleData | null) => void;
  onSubtitleMessage: (callback: (subtitle: SubtitleData | null) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
