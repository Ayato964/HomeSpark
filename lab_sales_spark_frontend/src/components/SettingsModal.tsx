import React, { useState, useEffect } from 'react';
import { ChatService } from '../services/ChatService';
import { isDesktopApp } from '../utils/platform';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [storageMode, setStorageMode] = useState<'cloud' | 'local'>('cloud');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  const chatService = new ChatService();

  useEffect(() => {
    setIsDesktop(isDesktopApp());
  }, []);

  useEffect(() => {
    if (isOpen) {
      setMessage(null);
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
    setMessage(null);
    try {
      await chatService.setStorageMode(newMode);
      setStorageMode(newMode);
      setMessage(
        newMode === 'local'
          ? '✅ 保存先を「ローカル保存 (SQLite)」に切り替えました。'
          : '✅ 保存先を「クラウド保存 (PostgreSQL)」に切り替えました。'
      );
    } catch (e: any) {
      setMessage(`❌ 切替エラー: ${e.message || '不明なエラーが発生しました'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(10px)',
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
          borderRadius: '20px',
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
            padding: '20px 24px',
            borderBottom: '1px solid var(--border2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⚙️</span>
            <span
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text)',
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            >
              環境設定 (Settings)
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text3)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
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
          {/* Section: Storage Engine (Desktop Only) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '15px' }}>💾</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                記憶・データの保存先 (Storage Provider)
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
                {isDesktop ? 'デスクトップ版専用' : 'Web版'}
              </span>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: 'var(--text3)', lineHeight: 1.5 }}>
              会話履歴、AI秘書の長期記憶（Skills・議事録）、デジタル名刺、外部メール設定の保存場所を選択できます。
            </p>

            {isDesktop ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Local Option (SQLite) */}
                <div
                  onClick={() => handleModeChange('local')}
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    border: `1.5px solid ${storageMode === 'local' ? 'var(--accent)' : 'var(--border2)'}`,
                    background: storageMode === 'local' ? 'rgba(45, 212, 191, 0.08)' : 'var(--bg)',
                    cursor: saving ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '14px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <input
                    type="radio"
                    checked={storageMode === 'local'}
                    onChange={() => handleModeChange('local')}
                    style={{ marginTop: '3px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                        💻 ローカル保存 (SQLite)
                      </span>
                      <span
                        style={{
                          fontSize: '9.5px',
                          color: '#10B981',
                          background: 'rgba(16, 185, 129, 0.12)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        推奨・プライベート
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
                      すべての記憶とデータをこのPC内のローカル SQLite データベース（<code>homespark_local.db</code>）に完全保存します。超高速で動作し、クラウドへデータが送信されません。
                    </p>
                  </div>
                </div>

                {/* Cloud Option (PostgreSQL) */}
                <div
                  onClick={() => handleModeChange('cloud')}
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    border: `1.5px solid ${storageMode === 'cloud' ? 'var(--accent)' : 'var(--border2)'}`,
                    background: storageMode === 'cloud' ? 'rgba(45, 212, 191, 0.08)' : 'var(--bg)',
                    cursor: saving ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '14px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <input
                    type="radio"
                    checked={storageMode === 'cloud'}
                    onChange={() => handleModeChange('cloud')}
                    style={{ marginTop: '3px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                        ☁️ クラウド保存 (PostgreSQL / Neon)
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
                      クラウドデータベースに保存し、複数のPCやWebブラウザ版との間で記憶・会話履歴・名刺を同期します。
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span>☁️</span>
                <span style={{ fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.5 }}>
                  Webブラウザ版ではクラウド保存（PostgreSQL）が適用されています。ローカルSQLite保存への切り替えは**デスクトップアプリ版（HomeSpark GeMo）**でご利用いただけます。
                </span>
              </div>
            )}

            {/* Notification / Feedback Message */}
            {message && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: message.startsWith('✅') ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  border: `1px solid ${message.startsWith('✅') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  fontSize: '12.5px',
                  color: message.startsWith('✅') ? '#10B981' : '#EF4444',
                  fontWeight: 500,
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                {message}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border2)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--topbar)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              fontSize: '13px',
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
