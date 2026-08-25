import React, { useState, useEffect } from 'react';
import { ChatService } from '../services/ChatService';
import { isDesktopApp } from '../utils/platform';
import { UpdateStatusData } from '../types/electron';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [storageMode, setStorageMode] = useState<'cloud' | 'local'>('cloud');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [storageMsg, setStorageMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  // Auto-updater state
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusData | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);

  const chatService = new ChatService();

  useEffect(() => {
    const desktop = isDesktopApp();
    setIsDesktop(desktop);

    if (desktop && window.electronAPI?.onUpdateStatus) {
      const unsub = window.electronAPI.onUpdateStatus((data) => {
        setUpdateStatus(data);
        if (data.status !== 'checking') {
          setCheckingUpdate(false);
        }
      });
      return () => unsub();
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStorageMsg(null);
      setLoading(true);
      chatService
        .getStorageMode()
        .then((mode) => setStorageMode(mode))
        .catch(() => setStorageMode('cloud'))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleModeChange = async (newMode: 'cloud' | 'local') => {
    if (newMode === storageMode || saving) return;
    setSaving(true);
    setStorageMsg(null);
    try {
      await chatService.setStorageMode(newMode);
      setStorageMode(newMode);
      setStorageMsg({
        type: 'success',
        text: newMode === 'local'
          ? '保存先を「ローカル保存 (SQLite)」に切り替えました。'
          : '保存先を「クラウド保存 (PostgreSQL)」に切り替えました。'
      });
    } catch (e: any) {
      setStorageMsg({
        type: 'error',
        text: `切替エラー: ${e.message || '不明なエラーが発生しました'}`
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCheckUpdate = () => {
    if (!isDesktop) return;
    setCheckingUpdate(true);
    setUpdateStatus({ status: 'checking' });
    window.electronAPI?.checkForUpdates();
  };

  const handleRestartUpdate = () => {
    window.electronAPI?.restartAndInstallUpdate();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(12px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border3)',
          borderRadius: '18px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--topbar)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(66, 133, 244, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4285F4'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <span
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text)',
                fontFamily: "'IBM Plex Sans', sans-serif",
                letterSpacing: '-0.01em'
              }}
            >
              環境設定
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text3)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          {/* Section 1: Storage Engine */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                記憶・データの保存先 (Storage Engine)
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: 'var(--accent)',
                  border: '1px solid var(--border3)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: 'var(--surface)',
                }}
              >
                {isDesktop ? 'デスクトップ版' : 'Web版'}
              </span>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>
              会話履歴、AI秘書の長期記憶（Skills・議事録）、デジタル名刺、外部メール設定の保存場所を選択できます。
            </p>

            {isDesktop ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Local Option (SQLite) */}
                <div
                  onClick={() => handleModeChange('local')}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: `1.5px solid ${storageMode === 'local' ? '#4285F4' : 'var(--border2)'}`,
                    background: storageMode === 'local' ? 'rgba(66, 133, 244, 0.06)' : 'var(--bg)',
                    cursor: saving ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <input
                    type="radio"
                    checked={storageMode === 'local'}
                    onChange={() => handleModeChange('local')}
                    style={{ marginTop: '3px', accentColor: '#4285F4', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                        ローカル保存 (SQLite)
                      </span>
                      <span
                        style={{
                          fontSize: '9.5px',
                          color: '#34A853',
                          background: 'rgba(52, 168, 83, 0.1)',
                          border: '1px solid rgba(52, 168, 83, 0.2)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        推奨・プライベート
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text2)', lineHeight: 1.5 }}>
                      すべての記憶とデータをこのPC内のローカル SQLite データベース（<code>homespark_local.db</code>）に完全保存します。高速で動作し、クラウドへデータが送信されません。
                    </p>
                  </div>
                </div>

                {/* Cloud Option (PostgreSQL) */}
                <div
                  onClick={() => handleModeChange('cloud')}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: `1.5px solid ${storageMode === 'cloud' ? '#4285F4' : 'var(--border2)'}`,
                    background: storageMode === 'cloud' ? 'rgba(66, 133, 244, 0.06)' : 'var(--bg)',
                    cursor: saving ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <input
                    type="radio"
                    checked={storageMode === 'cloud'}
                    onChange={() => handleModeChange('cloud')}
                    style={{ marginTop: '3px', accentColor: '#4285F4', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                        クラウド保存 (PostgreSQL)
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text2)', lineHeight: 1.5 }}>
                      クラウドデータベースに保存し、複数のPCやWebブラウザ版との間で記憶・会話履歴・名刺を同期します。
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
                  Webブラウザ版ではクラウド保存（PostgreSQL）が適用されています。ローカルSQLite保存への切り替えはデスクトップアプリ版（HomeSpark GeMo）でご利用いただけます。
                </span>
              </div>
            )}

            {/* Storage Message */}
            {storageMsg && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: storageMsg.type === 'success' ? 'rgba(52, 168, 83, 0.1)' : 'rgba(234, 67, 53, 0.1)',
                  border: `1px solid ${storageMsg.type === 'success' ? 'rgba(52, 168, 83, 0.25)' : 'rgba(234, 67, 53, 0.25)'}`,
                  fontSize: '12px',
                  color: storageMsg.type === 'success' ? '#34A853' : '#EA4335',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {storageMsg.type === 'success' ? (
                    <polyline points="20 6 9 17 4 12"/>
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </>
                  )}
                </svg>
                {storageMsg.text}
              </div>
            )}
          </div>

          {/* Section 2: Auto-Update (Desktop Only) */}
          {isDesktop && (
            <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                  自動アップデート (Auto-Update)
                </span>
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'rgba(66, 133, 244, 0.1)',
                    color: '#4285F4',
                    border: '1px solid rgba(66, 133, 244, 0.25)',
                    padding: '1px 7px',
                    borderRadius: '4px',
                  }}
                >
                  v3.1.6
                </span>
              </div>
              <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>
                GitHub Releases と連携し、常に最新バージョンの機能や改善をワンクリックで自動更新します。
              </p>

              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text)' }}>
                      HomeSpark GeMo (デスクトップ版)
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
                      現在のバージョン: <strong>v3.1.6</strong>
                    </span>
                  </div>

                  <button
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate || updateStatus?.status === 'downloading'}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border3)',
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: checkingUpdate ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: checkingUpdate ? 'spin 1s linear infinite' : 'none' }}>
                      <path d="M23 4v6h-6"/>
                      <path d="M1 20v-6h6"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    {checkingUpdate ? '確認中...' : 'アップデートを確認'}
                  </button>
                </div>

                {/* Status displays */}
                {updateStatus?.status === 'checking' && (
                  <div style={{ fontSize: '11.5px', color: '#4285F4', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    GitHub から最新リリース情報を取得しています...
                  </div>
                )}

                {updateStatus?.status === 'not-available' && (
                  <div style={{ fontSize: '11.5px', color: '#34A853', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    お使いのバージョンは最新です
                  </div>
                )}

                {updateStatus?.status === 'available' && (
                  <div style={{ fontSize: '11.5px', color: '#4285F4', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    新バージョン <strong>v{updateStatus.version}</strong> が見つかりました。ダウンロードを開始します...
                  </div>
                )}

                {updateStatus?.status === 'downloading' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text2)' }}>
                      <span>更新ファイルをダウンロード中...</span>
                      <span>{updateStatus.percent || 0}%</span>
                    </div>
                    <div style={{ width: '100%', height: '5px', background: 'var(--border2)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${updateStatus.percent || 0}%`,
                          height: '100%',
                          background: '#4285F4',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                )}

                {updateStatus?.status === 'downloaded' && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(52, 168, 83, 0.1)',
                      border: '1px solid rgba(52, 168, 83, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34A853" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span style={{ fontSize: '12px', color: '#34A853', fontWeight: 600 }}>
                        v{updateStatus.version || '最新版'} の準備が完了しました
                      </span>
                    </div>
                    <button
                      onClick={handleRestartUpdate}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#34A853',
                        color: '#fff',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      今すぐ再起動して更新
                    </button>
                  </div>
                )}

                {updateStatus?.status === 'error' && (
                  <div style={{ fontSize: '11.5px', color: '#EA4335', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {updateStatus.error || '更新の確認中にエラーが発生しました。'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border2)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--topbar)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '7px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#4285F4',
              color: '#fff',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
