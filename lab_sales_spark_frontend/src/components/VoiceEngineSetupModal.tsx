'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChatService, VoiceCapability, VoiceInstallStatus } from '../services/ChatService';

interface VoiceEngineSetupModalProps {
  isOpen: boolean;
  capability: VoiceCapability | null;
  /** Called when the user dismisses without installing. `never` = do not ask again. */
  onDismiss: (never: boolean) => void;
}

type Phase = 'prompt' | 'installing' | 'success' | 'error';

/**
 * Offers the local Irodori-TTS engine to machines that can actually run it.
 *
 * The engine is a multi-gigabyte download, so the installer cannot ship it. This
 * asks first, then runs the install with live progress rather than sending the
 * user hunting through settings.
 */
export const VoiceEngineSetupModal: React.FC<VoiceEngineSetupModalProps> = ({
  isOpen,
  capability,
  onDismiss,
}) => {
  const [phase, setPhase] = useState<Phase>('prompt');
  const [status, setStatus] = useState<VoiceInstallStatus | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const chatServiceRef = useRef<ChatService | null>(null);
  if (!chatServiceRef.current) chatServiceRef.current = new ChatService();
  const chatService = chatServiceRef.current;

  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [status?.logs]);

  // Poll while the install runs. The backend owns the job, so closing and
  // reopening this modal never loses progress.
  useEffect(() => {
    if (phase !== 'installing') return;
    const timer = setInterval(async () => {
      try {
        const s = await chatService.getVoiceEngineInstallStatus();
        setStatus(s);
        if (s.state === 'success') setPhase('success');
        if (s.state === 'error') setPhase('error');
      } catch {
        // Transient poll failure: keep the last known state and retry.
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [phase, chatService]);

  if (!isOpen || !capability) return null;

  const handleInstall = async () => {
    setStartError(null);
    setPhase('installing');
    try {
      await chatService.installVoiceEngine('tts');
      setStatus(await chatService.getVoiceEngineInstallStatus());
    } catch (e: any) {
      setStartError(e?.message || '導入を開始できませんでした');
      setPhase('error');
    }
  };

  const handleRestart = () => {
    if (typeof window !== 'undefined' && window.electronAPI?.restartApp) {
      window.electronAPI.restartApp();
    } else {
      window.location.reload();
    }
  };

  const percent =
    status && status.step_total > 0
      ? Math.round(((status.step_index - 1) / status.step_total) * 100)
      : 0;

  const profile = capability.profiles?.tts;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        background: 'rgba(0,0,0,0.66)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '620px',
          maxWidth: '100%',
          maxHeight: '86vh',
          overflowY: 'auto',
          background: 'var(--panel)',
          border: '1px solid var(--border3)',
          borderRadius: '18px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          padding: '28px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #6366F1 0%, #2DD4BF 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>
              {phase === 'success'
                ? 'ローカル音声合成の準備ができました'
                : phase === 'error'
                ? '音声エンジンの導入に失敗しました'
                : phase === 'installing'
                ? 'ローカル音声エンジンを導入しています'
                : 'GeMo の声をこの PC で合成できます'}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text3)' }}>
              {capability.gpu.gpu_name}
              {capability.gpu.vram ? ` (${capability.gpu.vram})` : ''} を検出しました
            </p>
          </div>
        </div>

        {/* Phase: prompt */}
        {phase === 'prompt' && (
          <>
            <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.75 }}>
              お使いの PC には対応 GPU が搭載されていますが、ローカル音声合成エンジン
              <strong> Irodori-TTS </strong>がまだ導入されていません。
              現在はブラウザ内蔵の Web Speech API で発話しています。
              <br />
              導入すると次が変わります:
            </div>

            <ul
              style={{
                margin: 0,
                paddingLeft: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                fontSize: '12.5px',
                color: 'var(--text2)',
                lineHeight: 1.6,
              }}
            >
              <li>GeMo 専用の自然な音声で発話します（機械音声ではなくなります）</li>
              <li>音声認識も GPU で動作し、オフラインでも会話できます</li>
              <li>クラウドへ音声を送らずに済みます</li>
            </ul>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'var(--panel2)',
                border: '1px solid var(--border2)',
                fontSize: '11.5px',
                color: 'var(--text3)',
                lineHeight: 1.65,
              }}
            >
              ダウンロードサイズ: <strong>{profile?.size_hint || '約 3.5 GB'}</strong>
              （回線速度により 10〜30 分ほどかかります）
              <br />
              導入先はアプリ同梱の Python 環境のみで、PC の他の環境には影響しません。
              失敗しても Web Speech API での発話に自動で戻るため、アプリが使えなくなることはありません。
            </div>

            {startError && (
              <div style={{ fontSize: '12px', color: '#ef4444' }}>{startError}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => onDismiss(true)}
                style={{
                  padding: '9px 14px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text3)',
                  background: 'transparent',
                  border: '1px solid var(--border2)',
                  borderRadius: '9px',
                  cursor: 'pointer',
                }}
              >
                今後表示しない
              </button>
              <button
                onClick={() => onDismiss(false)}
                style={{
                  padding: '9px 16px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: 'var(--text2)',
                  background: 'var(--panel2)',
                  border: '1px solid var(--border2)',
                  borderRadius: '9px',
                  cursor: 'pointer',
                }}
              >
                あとで
              </button>
              <button
                onClick={handleInstall}
                style={{
                  padding: '9px 22px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: '#fff',
                  background: 'linear-gradient(135deg, #6366f1, #2dd4bf)',
                  border: 'none',
                  borderRadius: '9px',
                  cursor: 'pointer',
                }}
              >
                導入する
              </button>
            </div>
          </>
        )}

        {/* Phase: installing / success / error */}
        {phase !== 'prompt' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  borderRadius: '4px',
                  background: 'var(--panel2)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${phase === 'success' ? 100 : phase === 'error' ? 100 : percent}%`,
                    borderRadius: '4px',
                    background:
                      phase === 'error'
                        ? 'linear-gradient(90deg, #ef4444, #f87171)'
                        : 'linear-gradient(90deg, #6366f1, #2dd4bf)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 600 }}>
                {phase === 'success'
                  ? 'すべてのコンポーネントを導入しました。アプリを再起動すると有効になります。'
                  : phase === 'error'
                  ? startError || status?.error || '不明なエラー'
                  : status
                  ? `[${status.step_index}/${status.step_total}] ${status.step_label}`
                  : '準備中...'}
              </div>
              {phase === 'installing' && (
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  この画面を閉じても導入は続きます。設定 &gt; 音声 から進捗を確認できます。
                </div>
              )}
            </div>

            <div
              ref={logRef}
              style={{
                height: '190px',
                overflowY: 'auto',
                padding: '9px 12px',
                borderRadius: '10px',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid var(--border2)',
                fontFamily: '"Consolas", "Courier New", monospace',
                fontSize: '10.5px',
                lineHeight: 1.55,
                color: '#94a3b8',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                userSelect: 'text',
              }}
            >
              {status?.logs?.length ? status.logs.join('\n') : 'ログを待機中...'}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              {phase === 'installing' && (
                <button
                  onClick={() => onDismiss(false)}
                  style={{
                    padding: '9px 18px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: 'var(--text2)',
                    background: 'var(--panel2)',
                    border: '1px solid var(--border2)',
                    borderRadius: '9px',
                    cursor: 'pointer',
                  }}
                >
                  バックグラウンドで続ける
                </button>
              )}
              {phase === 'error' && (
                <>
                  <button
                    onClick={() => onDismiss(false)}
                    style={{
                      padding: '9px 18px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: 'var(--text2)',
                      background: 'var(--panel2)',
                      border: '1px solid var(--border2)',
                      borderRadius: '9px',
                      cursor: 'pointer',
                    }}
                  >
                    Web Speech API のまま使う
                  </button>
                  <button
                    onClick={handleInstall}
                    style={{
                      padding: '9px 20px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: '#fff',
                      background: '#4285F4',
                      border: 'none',
                      borderRadius: '9px',
                      cursor: 'pointer',
                    }}
                  >
                    再試行
                  </button>
                </>
              )}
              {phase === 'success' && (
                <>
                  <button
                    onClick={() => onDismiss(true)}
                    style={{
                      padding: '9px 18px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: 'var(--text2)',
                      background: 'var(--panel2)',
                      border: '1px solid var(--border2)',
                      borderRadius: '9px',
                      cursor: 'pointer',
                    }}
                  >
                    あとで再起動する
                  </button>
                  <button
                    onClick={handleRestart}
                    style={{
                      padding: '9px 22px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: '#fff',
                      background: 'linear-gradient(135deg, #6366f1, #2dd4bf)',
                      border: 'none',
                      borderRadius: '9px',
                      cursor: 'pointer',
                    }}
                  >
                    今すぐ再起動
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
