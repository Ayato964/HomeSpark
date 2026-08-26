'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getBackendBaseUrl, isDesktopApp } from '../utils/platform';
import { ChatService, VoiceCapability } from '../services/ChatService';

interface StartupLoadingScreenProps {
  onComplete: (status: { voiceSupported: boolean }) => void;
}

interface StepStatus {
  id: number;
  label: string;
  subLabel: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'error';
  errorDetail?: string;
}

export const StartupLoadingScreen: React.FC<StartupLoadingScreenProps> = ({ onComplete }) => {
  const [steps, setSteps] = useState<StepStatus[]>([
    { id: 1, label: '環境設定 & システム初期化', subLabel: '環境変数と設定ファイルを検証中...', status: 'running' },
    { id: 2, label: 'FastAPI バックエンド & データベース', subLabel: 'サーバーの接続とDB初期化を確認中...', status: 'pending' },
    { id: 3, label: 'ハードウェア (GPU/CUDA) & 音声合成', subLabel: 'Irodori-TTS 音声合成エンジンを待機中...', status: 'pending' },
    { id: 4, label: '音声認識 (Whisper) & LLM 対話', subLabel: 'STTモデルと推論エンドポイントを検証中...', status: 'pending' },
    { id: 5, label: '専属秘書 GeMo の起動準備', subLabel: 'デスクトップ環境を最適化しています...', status: 'pending' },
  ]);

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [progressPercent, setProgressPercent] = useState<number>(15);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);
  const [voiceSupported, setVoiceSupported] = useState<boolean>(false);
  const [capability, setCapability] = useState<VoiceCapability | null>(null);
  const [ttsPending, setTtsPending] = useState<boolean>(false);

  const logRef = useRef<HTMLDivElement>(null);
  // `runStartupDiagnostics` finishes inside a timeout, after which the state
  // snapshot it closed over is stale - read the latest value through a ref.
  const voiceSupportedRef = useRef<boolean>(false);

  useEffect(() => {
    voiceSupportedRef.current = voiceSupported;
  }, [voiceSupported]);

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    const formatted = `[${ts}] ${msg}`;
    setLogs((prev) => [...prev, formatted]);
  };

  const updateStep = (index: number, update: Partial<StepStatus>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...update } : s))
    );
  };

  const runStartupDiagnostics = async () => {
    setHasError(false);
    setErrorMessage('');
    setProgressPercent(15);
    setCurrentStepIndex(0);
    setLogs([]);

    addLog('🚀 HomeSpark GeMo システム初期化シーケンスを開始します');

    // Step 1: Environment & Platform
    updateStep(0, { status: 'running', subLabel: '環境設定とプラットフォーム情報を取得中...' });
    const isDesktop = isDesktopApp();
    addLog(`実行プラットフォーム: ${isDesktop ? 'Electron Desktop アプリ' : 'Web ブラウザ'}`);

    let electronLogs: string[] = [];
    if (isDesktop && window.electronAPI?.getStartupLogs) {
      try {
        electronLogs = await window.electronAPI.getStartupLogs();
        if (electronLogs.length > 0) {
          addLog(`Electron プロセスログ (${electronLogs.length}件) をインポートしました`);
        }
      } catch (e) {
        console.warn('Failed to get startup logs from Electron:', e);
      }
    }

    const backendUrl = getBackendBaseUrl();
    addLog(`バックエンド接続先 URL: ${backendUrl}`);
    updateStep(0, { status: 'success', subLabel: '環境設定のロード完了' });
    setProgressPercent(30);

    // Step 2: Backend Health & Database check
    setCurrentStepIndex(1);
    updateStep(1, { status: 'running', subLabel: `FastAPI サーバー (${backendUrl}) への接続を待機中...` });

    let backendReady = false;
    let backendErrorMsg = '';
    const maxRetries = 15;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      addLog(`FastAPI ヘルスチェック試行 [${attempt}/${maxRetries}]...`);
      try {
        const res = await fetch(`${backendUrl}/api/health`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          addLog(`✅ FastAPI バックエンド接続成功! (モデル設定: ${data.model || '標準'})`);
          backendReady = true;
          break;
        } else {
          backendErrorMsg = `HTTP ステータス ${res.status}`;
        }
      } catch (err: any) {
        backendErrorMsg = err?.message || '接続拒否 / タイムアウト';
      }
      await new Promise((r) => setTimeout(r, 600));
    }

    if (!backendReady) {
      const fullError = `バックエンドサーバー (${backendUrl}) の起動を確認できませんでした: ${backendErrorMsg}`;
      addLog(`❌ エラー: ${fullError}`);
      updateStep(1, { status: 'error', subLabel: fullError, errorDetail: fullError });
      setHasError(true);
      setErrorMessage(fullError);
      return;
    }

    updateStep(1, { status: 'success', subLabel: 'バックエンド & データベース正常稼働中' });
    setProgressPercent(55);

    // Step 3 & 4: Voice Diagnostics Suite (GPU, TTS, STT, LLM)
    setCurrentStepIndex(2);
    updateStep(2, { status: 'running', subLabel: 'Irodori-TTS & GPU 音声診断を実行中...' });
    setCurrentStepIndex(3);
    updateStep(3, { status: 'running', subLabel: 'Whisper STT & LLM 接続を検証中...' });

    const chatService = new ChatService();
    try {
      addLog('音声対話 AI (GPU / TTS / STT / LLM) のエンドツーエンド深層診断を実行します...');
      const diag = await chatService.runVoiceDiagnostics();

      if (diag.logs && Array.isArray(diag.logs)) {
        for (const l of diag.logs) {
          addLog(l);
        }
      }

      // Check GPU & TTS. `skipped` means this machine is not expected to run a
      // local engine at all (no GPU / engine not installed) - that is a
      // supported configuration, not a fault, so it must not read as a warning.
      if (diag.tts?.pass) {
        updateStep(2, { status: 'success', subLabel: `Irodori-TTS 合成成功 (${diag.tts.details?.latency_ms || 0}ms)` });
      } else if (diag.tts?.pending) {
        // The engine holds its port shut for ~1 minute while loading models.
        // That is startup, not breakage - say so, and let the poll below flip
        // this to success once it is actually ready.
        updateStep(2, {
          status: 'running',
          subLabel: 'モデル読み込み中 (1〜2分) - 完了までは Web Speech API で発話します',
        });
        addLog('⏳ ローカル音声エンジンはモデルを読み込み中です。準備でき次第、自動で切り替わります。');
        setTtsPending(true);
      } else if (diag.tts?.skipped) {
        updateStep(2, {
          status: 'success',
          subLabel: diag.tts.details?.reason === 'no_gpu'
            ? 'GPU非搭載構成: Web Speech API で発話します'
            : 'ローカルTTS未導入: Web Speech API で発話します',
        });
      } else {
        updateStep(2, {
          status: 'warning',
          subLabel: 'ローカルTTS未起動 (Web Speech Synthesis フォールバックで動作)',
          errorDetail: diag.tts?.details?.error,
        });
        addLog('ℹ️ ローカル TTS エンジンはオフラインです。Web Speech API / テキスト字幕モードで動作します。');
      }

      // Check STT & LLM
      const sttNote = diag.stt?.pass
        ? 'ローカルWhisper常駐'
        : diag.stt?.skipped
        ? 'クラウドSTT'
        : 'STT要確認';
      if (diag.llm?.pass) {
        updateStep(3, {
          status: 'success',
          subLabel: `${sttNote} / LLM 接続確認完了 (${diag.llm.details?.provider || 'API'})`,
        });
      } else {
        updateStep(3, {
          status: 'warning',
          subLabel: 'LLM 接続に問題あり (設定を確認してください)',
          errorDetail: diag.llm?.details?.error,
        });
      }

      if (diag.capability) {
        setCapability(diag.capability);
      }
      // Voice conversation only truly needs the LLM: synthesis falls back to
      // Web Speech and recognition falls back to cloud STT.
      setVoiceSupported(Boolean(diag.llm?.pass));
    } catch (diagErr: any) {
      addLog(`⚠️ 音声診断 API エラー (${diagErr?.message || diagErr})。基本テキストモードで初期化を継続します。`);
      updateStep(2, { status: 'warning', subLabel: '音声エンジン診断スキップ' });
      updateStep(3, { status: 'warning', subLabel: 'LLM 直接通信モード' });
      setVoiceSupported(false);
    }

    setProgressPercent(90);

    // Step 5: Ready
    setCurrentStepIndex(4);
    updateStep(4, { status: 'running', subLabel: 'GeMo 秘書インターフェースを構成中...' });
    await new Promise((r) => setTimeout(r, 400));
    updateStep(4, { status: 'success', subLabel: '準備完了！まもなく開始します...' });
    setProgressPercent(100);
    addLog('🎉 すべての初期化シーケンスが正常に完了しました！GeMo を起動します。');

    // Finish after a short delay
    setTimeout(() => {
      setIsFinishing(true);
      setTimeout(() => {
        onComplete({ voiceSupported: voiceSupportedRef.current });
      }, 500);
    }, 600);
  };

  useEffect(() => {
    runStartupDiagnostics();
  }, []);

  // The startup check necessarily runs seconds after launch, long before the
  // engine finishes loading. Keep watching so the report ends up truthful
  // instead of frozen on "loading".
  useEffect(() => {
    if (!ttsPending) return;
    const chatService = new ChatService();
    const timer = setInterval(async () => {
      try {
        const st = await chatService.getVoiceEngineStatus();
        if (st.state === 'ready') {
          updateStep(2, { status: 'success', subLabel: 'ローカル音声エンジン起動完了' });
          addLog('✅ ローカル音声エンジンの読み込みが完了しました。');
          setTtsPending(false);
        } else if (st.state === 'error') {
          updateStep(2, {
            status: 'warning',
            subLabel: '音声エンジンの初期化に失敗 (Web Speech API で継続)',
            errorDetail: st.error,
          });
          addLog(`⚠️ 音声エンジンの初期化に失敗しました: ${st.error || '不明なエラー'}`);
          setTtsPending(false);
        }
      } catch {
        // Best-effort: a failed poll just means we try again.
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [ttsPending]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopyLogs = () => {
    const diagnosticSummary = [
      '========================================',
      'HomeSpark GeMo 起動診断レポート (Diagnostic Log)',
      `日時: ${new Date().toISOString()}`,
      `プラットフォーム: ${isDesktopApp() ? 'Electron Desktop' : 'Web Browser'}`,
      `バックエンド URL: ${getBackendBaseUrl()}`,
      '----------------------------------------',
      '【ステップ状況】',
      ...steps.map((s) => `[${s.status.toUpperCase()}] ${s.label}: ${s.subLabel} ${s.errorDetail ? `(${s.errorDetail})` : ''}`),
      '----------------------------------------',
      '【詳細ログ】',
      ...logs,
      '========================================',
    ].join('\n');

    navigator.clipboard.writeText(diagnosticSummary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'radial-gradient(circle at 50% 30%, #171b26 0%, #0a0c10 100%)',
        color: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        opacity: isFinishing ? 0 : 1,
        transition: 'opacity 0.5s ease',
        userSelect: 'none',
      }}
    >
      {/* Background glow sphere */}
      <div
        style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, rgba(45, 212, 191, 0.1) 60%, transparent 70%)',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '640px',
          maxWidth: '92vw',
          background: 'rgba(18, 22, 34, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          padding: '32px 36px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        {/* Logo and Header */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #6366F1 0%, #2DD4BF 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '30px',
            boxShadow: '0 12px 28px rgba(99, 102, 241, 0.4)',
            marginBottom: '16px',
          }}
        >
          ✨
        </div>

        <h1
          style={{
            fontSize: '22px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #ffffff 0%, #c7d2fe 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: '0 0 4px 0',
          }}
        >
          HomeSpark GeMo
        </h1>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 12px 0' }}>
          専属秘書 GeMo - システム初期化 & 音声機能チェック
        </p>

        {/* Which voice configuration this machine resolved to */}
        {capability && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 12px',
              marginBottom: '20px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 600,
              color: capability.mode === 'local_gpu' ? '#2dd4bf' : '#c7d2fe',
              background: capability.mode === 'local_gpu' ? 'rgba(45, 212, 191, 0.12)' : 'rgba(99, 102, 241, 0.14)',
              border: `1px solid ${capability.mode === 'local_gpu' ? 'rgba(45,212,191,0.3)' : 'rgba(99,102,241,0.3)'}`,
            }}
          >
            {capability.mode === 'local_gpu'
              ? `ローカルGPU構成 - ${capability.gpu.gpu_name || 'CUDA'}`
              : capability.mode === 'local_stt'
              ? 'ハイブリッド構成 - ローカル音声認識 / Web Speech 発話'
              : 'クラウド構成 - Web Speech 発話 / クラウド音声認識'}
          </div>
        )}

        {/* Progress Bar */}
        <div style={{ width: '100%', marginBottom: '24px' }}>
          <div
            style={{
              width: '100%',
              height: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: hasError
                  ? 'linear-gradient(90deg, #ef4444, #f87171)'
                  : 'linear-gradient(90deg, #6366f1, #2dd4bf)',
                borderRadius: '4px',
                transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '6px',
              fontSize: '11px',
              color: '#64748b',
            }}
          >
            <span>{hasError ? '⚠️ 初期化エラー' : steps[currentStepIndex]?.label || '初期化中...'}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: hasError ? '#ef4444' : '#2dd4bf' }}>
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Steps List */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          {steps.map((s) => {
            const isCurrent = s.status === 'running';
            const isDone = s.status === 'success';
            const isWarn = s.status === 'warning';
            const isErr = s.status === 'error';

            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: isCurrent
                    ? 'rgba(99, 102, 241, 0.12)'
                    : isErr
                    ? 'rgba(239, 68, 68, 0.12)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: isCurrent
                    ? '1px solid rgba(99, 102, 241, 0.3)'
                    : isErr
                    ? '1px solid rgba(239, 68, 68, 0.35)'
                    : '1px solid transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Status Icon */}
                <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isCurrent && (
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        border: '2px solid #6366f1',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                  )}
                  {isDone && <span style={{ color: '#2dd4bf', fontSize: '14px' }}>✓</span>}
                  {isWarn && <span style={{ color: '#fbbf24', fontSize: '13px' }}>⚠️</span>}
                  {isErr && <span style={{ color: '#ef4444', fontSize: '13px' }}>❌</span>}
                  {s.status === 'pending' && <span style={{ color: '#475569', fontSize: '12px' }}>○</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: isErr ? '#f87171' : isDone ? '#e2e8f0' : '#cbd5e1' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: '11px', color: isErr ? '#fca5a5' : '#94a3b8' }}>
                    {s.subLabel}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Details & Log Console */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
              リアルタイム診断ログ
            </span>
            <button
              onClick={handleCopyLogs}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#ffffff',
                background: copied ? '#10b981' : '#4f46e5',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {copied ? '✅ コピー完了！' : '📋 ログをコピー'}
            </button>
          </div>

          <div
            ref={logRef}
            style={{
              width: '100%',
              height: '110px',
              background: 'rgba(0, 0, 0, 0.45)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '8px 12px',
              fontFamily: '"Consolas", "Courier New", monospace',
              fontSize: '10.5px',
              color: '#94a3b8',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              userSelect: 'text',
            }}
          >
            {logs.length > 0 ? (
              logs.map((logLine, idx) => (
                <div
                  key={idx}
                  style={{
                    color: logLine.includes('❌') || logLine.includes('エラー') || logLine.includes('Error')
                      ? '#f87171'
                      : logLine.includes('✅')
                      ? '#34d399'
                      : logLine.includes('⚠️')
                      ? '#fbbf24'
                      : '#94a3b8',
                    lineHeight: '1.45',
                  }}
                >
                  {logLine}
                </div>
              ))
            ) : (
              <div style={{ color: '#475569' }}>ログを待機中...</div>
            )}
          </div>
        </div>

        {/* Error Actions */}
        {hasError && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <button
              onClick={() => onComplete({ voiceSupported: false })}
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#cbd5e1',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              ⚠️ 通常モードで続行
            </button>
            <button
              onClick={runStartupDiagnostics}
              style={{
                padding: '8px 18px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#ffffff',
                background: 'linear-gradient(135deg, #6366f1, #2dd4bf)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              🔄 再試行
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
