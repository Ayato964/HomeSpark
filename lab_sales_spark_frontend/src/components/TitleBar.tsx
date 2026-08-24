"use client";

import React, { useEffect, useState } from "react";
import { isElectron, getElectronAPI } from "../utils/electron";

export function TitleBar() {
  const [mounted, setMounted] = useState(false);
  const [isMax, setIsMax] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setMounted(true);
    const desktop = isElectron();
    setIsDesktop(desktop);

    if (desktop) {
      const api = getElectronAPI();
      if (api) {
        api.isMaximized().then(setIsMax);
        const unsubscribe = api.onWindowStateChange((max) => {
          setIsMax(max);
        });
        return () => unsubscribe();
      }
    }
  }, []);

  if (!mounted || !isDesktop) {
    return null;
  }

  const api = getElectronAPI();

  return (
    <div
      style={{
        height: "32px",
        width: "100%",
        backgroundColor: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "12px",
        paddingRight: "0px",
        userSelect: "none",
        zIndex: 99999,
        position: "fixed",
        top: 0,
        left: 0,
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      {/* Title & App Badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: "var(--accent, #6366f1)",
            boxShadow: "0 0 8px var(--accent, #6366f1)",
          }}
        />
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: "var(--text)",
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          HomeSpark
        </span>
        <span
          style={{
            fontSize: "10px",
            color: "var(--muted)",
            background: "var(--surface)",
            padding: "1px 6px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
          }}
        >
          🎀 専属秘書ジェニー (常駐中)
        </span>
      </div>

      {/* Window Controls (No-Drag) */}
      <div
        style={{
          display: "flex",
          height: "100%",
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties}
      >
        {/* Minimize */}
        <button
          onClick={() => api?.minimize()}
          title="最小化"
          style={{
            width: "44px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: "var(--text2)",
            cursor: "pointer",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>

        {/* Maximize / Restore */}
        <button
          onClick={() => api?.maximize()}
          title={isMax ? "元に戻す" : "最大化"}
          style={{
            width: "44px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: "var(--text2)",
            cursor: "pointer",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          {isMax ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2.5" y="0.5" width="7" height="7" />
              <polyline points="0.5,2.5 0.5,9.5 7.5,9.5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
          )}
        </button>

        {/* Close (Minimize to Tray) */}
        <button
          onClick={() => api?.close()}
          title="トレイに格納して常駐 (完全終了はトレイメニューから)"
          style={{
            width: "44px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: "var(--text2)",
            cursor: "pointer",
            transition: "background-color 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#ef4444";
            e.currentTarget.style.color = "#ffffff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--text2)";
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
