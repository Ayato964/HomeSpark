import { contextBridge, ipcRenderer } from "electron";

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
}

const electronAPI: ElectronAPI = {
  isElectron: true,
  platform: process.platform,
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
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
