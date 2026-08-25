import React, { useState, useEffect } from 'react';
import { ChatService } from '../services/ChatService';

interface OnboardingModalProps {
  isOpen: boolean;
  onLoginGoogle: () => void;
  onLoginQuick: () => void;
  onComplete: (voiceEnabled: boolean) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onLoginGoogle,
  onLoginQuick,
  onComplete,
}) => {
  const [step, setStep] = useState<number>(1);
  const [checkingGpu, setCheckingGpu] = useState<boolean>(true);
  const [gpuInfo, setGpuInfo] = useState<{ has_gpu: boolean; gpu_name?: string } | null>(null);
  const [showButtons, setShowButtons] = useState<boolean>(false);

  const chatService = new ChatService();

  const phrase = "あなたのデスクに、最高の知性と萌えを。";

  useEffect(() => {
    if (isOpen && step === 1) {
      const timer = setTimeout(() => {
        setShowButtons(true);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [isOpen, step]);

  // Click to skip animation instantly
  const handleSkipAnimation = () => {
    setShowButtons(true);
  };

  useEffect(() => {
    if (isOpen && step === 2) {
      setCheckingGpu(true);

      // 4-second safety timeout guard to prevent infinite loading hang
      const timeoutId = setTimeout(() => {
        setGpuInfo((prev) => prev || { has_gpu: false, gpu_name: 'Standard CPU' });
        setCheckingGpu(false);
      }, 4000);

      chatService
        .getGpuStatus()
        .then((res) => {
          clearTimeout(timeoutId);
          if (res.has_gpu) {
            setGpuInfo({ has_gpu: true, gpu_name: res.gpu_name || 'NVIDIA Accelerated GPU' });
          } else {
            let webglGpu: string | null = null;
            try {
              const canvas = document.createElement('canvas');
              const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
              if (gl) {
                const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                  webglGpu = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
              }
            } catch {
              // ignore
            }

            const isNvidia = webglGpu && /nvidia|geforce|rtx|gtx|quadro|radeon/i.test(webglGpu);
            if (isNvidia) {
              setGpuInfo({ has_gpu: true, gpu_name: webglGpu || 'NVIDIA GPU' });
            } else {
              setGpuInfo({ has_gpu: false, gpu_name: webglGpu || 'Standard CPU / Integrated Graphics' });
            }
          }
        })
        .catch(() => {
          clearTimeout(timeoutId);
          setGpuInfo({ has_gpu: false, gpu_name: 'Standard CPU' });
        })
        .finally(() => {
          setCheckingGpu(false);
        });

      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, step]);

  if (!isOpen) return null;

  const handleFinish = () => {
    const isVoiceReady = Boolean(gpuInfo?.has_gpu);
    onComplete(isVoiceReady);
  };

  return (
    <div
      onClick={handleSkipAnimation}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#07090e',
        backgroundImage: 'radial-gradient(circle at 50% 25%, rgba(99, 102, 241, 0.14) 0%, transparent 65%)',
        zIndex: 100000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        animation: 'fadeInScreen 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
      }}
    >
      {/* Top Brand Indicator */}
      <div
        style={{
          position: 'absolute',
          top: '36px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          opacity: 0.85,
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#6366f1',
            boxShadow: '0 0 12px #6366f1',
          }}
        />
        <span style={{ fontSize: '13px', letterSpacing: '0.12em', fontWeight: 600, color: '#e2e8f0', textTransform: 'uppercase' }}>
          HomeSpark GeMo
        </span>
        <span style={{ fontSize: '12px', color: '#475569' }}>|</span>
        <span style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.04em' }}>
          {step === 1 ? 'Authentication' : 'Hardware Diagnostics'}
        </span>
      </div>

      {/* Main Content Area (Centering with max width constraint) */}
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* STEP 1: Professional Streamed Typography & Auth */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            {/* Streamed Left-to-Right Animated Catchphrase */}
            <h1
              style={{
                fontSize: '30px',
                fontWeight: 700,
                color: '#ffffff',
                margin: '0 0 18px 0',
                letterSpacing: '-0.03em',
                lineHeight: 1.4,
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '1px',
              }}
            >
              {phrase.split('').map((char, index) => (
                <span
                  key={index}
                  style={{
                    display: 'inline-block',
                    opacity: 0,
                    transform: 'translateY(10px)',
                    animation: `charStream 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                    animationDelay: `${index * 25}ms`,
                    background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {char}
                </span>
              ))}
            </h1>

            {/* Sub-description */}
            <p
              style={{
                margin: '0 0 40px 0',
                fontSize: '13.5px',
                color: '#94a3b8',
                lineHeight: 1.7,
                maxWidth: '500px',
                opacity: showButtons ? 1 : 0,
                transform: showButtons ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.5s ease, transform 0.5s ease',
              }}
            >
              次世代AI秘書 GeMo が、日常のタスク管理、議事録要約、名刺整理、知的対話をシームレスに統合サポートします。
            </p>

            {/* Authentication Buttons (Fades in smoothly) */}
            <div
              style={{
                width: '100%',
                maxWidth: '380px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                opacity: showButtons ? 1 : 0,
                transform: showButtons ? 'translateY(0)' : 'translateY(14px)',
                transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
              }}
            >
              {/* Google Sign-in (Direct local auth setup & proceed) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLoginQuick();
                  setStep(2);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '14px 24px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'linear-gradient(180deg, #1e2433 0%, #131722 100%)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  borderRadius: '12px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.background = 'linear-gradient(180deg, #283044 0%, #1a1f2e 100%)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.background = 'linear-gradient(180deg, #1e2433 0%, #131722 100%)';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                </svg>
                Google アカウントでサインイン
              </button>

              {/* Local Continue */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLoginQuick();
                  setStep(2);
                }}
                style={{
                  width: '100%',
                  padding: '11px 20px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  borderRadius: '10px',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#e2e8f0';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#94a3b8';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                サインインせずに続ける (ローカル利用)
              </button>

              <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
                ※ サインインを行わない場合、Google カレンダーおよび Gmail 等のクラウド外部連携が無効化されます。
              </span>
            </div>
          </div>
        )}

        {/* STEP 2: Professional Hardware Diagnostics */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '540px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" />
                <line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" />
                <line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" />
                <line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" />
                <line x1="1" y1="14" x2="4" y2="14" />
              </svg>
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', margin: '0 0 10px 0', letterSpacing: '-0.02em' }}>
              ハードウェア環境診断
            </h2>
            <p style={{ margin: '0 0 30px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>
              ローカル高速音声対話エンジン（Irodori-TTS）は、GPU（NVIDIA CUDA等）アクセラレーションを前提としています。
            </p>

            {/* Diagnostic Status Box */}
            <div
              style={{
                width: '100%',
                padding: '24px',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${
                  checkingGpu
                    ? 'rgba(255, 255, 255, 0.08)'
                    : gpuInfo?.has_gpu
                    ? 'rgba(16, 185, 129, 0.3)'
                    : 'rgba(245, 158, 11, 0.3)'
                }`,
                marginBottom: '32px',
                textAlign: 'left',
              }}
            >
              {checkingGpu ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8', fontSize: '13px' }}>
                  <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  ハードウェア構成を診断しています...
                </div>
              ) : gpuInfo?.has_gpu ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#10b981' }}>
                      GPU アクセラレーションが有効です
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>
                    検出デバイス: <code style={{ color: '#cbd5e1' }}>{gpuInfo.gpu_name}</code><br />
                    ローカル高速音声合成およびリアルタイム通話機能をご利用いただけます。
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#f59e0b' }}>
                      専用 GPU（CUDA）が検出されませんでした
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>
                    検出環境: <code style={{ color: '#cbd5e1' }}>{gpuInfo?.gpu_name || 'CPU / Integrated Graphics'}</code><br />
                    音声対話機能は安全のため自動的に無効化されます。テキストチャット、長期記憶、名刺管理、メール連携等はすべて完全にご利用いただけます。
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  padding: '12px 24px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontSize: '13px',
                  fontWeight: 500,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                戻る
              </button>

              <button
                onClick={handleFinish}
                disabled={checkingGpu}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  border: 'none',
                  background: '#6366f1',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  borderRadius: '10px',
                  cursor: checkingGpu ? 'wait' : 'pointer',
                  boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#4f46e5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#6366f1'; }}
              >
                HomeSpark GeMo を開始する
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeInScreen {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes charStream {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
