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

  const chatService = new ChatService();

  useEffect(() => {
    if (isOpen && step === 2) {
      setCheckingGpu(true);
      // Check backend PyTorch CUDA status
      chatService
        .getGpuStatus()
        .then((res) => {
          if (res.has_gpu) {
            setGpuInfo({ has_gpu: true, gpu_name: res.gpu_name || 'NVIDIA GPU' });
          } else {
            // Check browser WebGL hardware renderer as secondary signal
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

            const isNvidia = webglGpu && /nvidia|geforce|rtx|gtx|quadro/i.test(webglGpu);
            if (isNvidia) {
              setGpuInfo({ has_gpu: true, gpu_name: webglGpu || 'NVIDIA GPU' });
            } else {
              setGpuInfo({ has_gpu: false, gpu_name: webglGpu || 'CPU / 内蔵グラフィックス' });
            }
          }
        })
        .catch(() => {
          setGpuInfo({ has_gpu: false });
        })
        .finally(() => {
          setCheckingGpu(false);
        });
    }
  }, [isOpen, step]);

  if (!isOpen) return null;

  const handleFinish = () => {
    const isVoiceReady = Boolean(gpuInfo?.has_gpu);
    onComplete(isVoiceReady);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 13, 0.88)',
        backdropFilter: 'blur(16px)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(145deg, #131722, #0d1017)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '600px',
          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Step Indicator */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)' }}>
              HomeSpark GeMo
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>初期セットアップ</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <div
              style={{
                width: '24px',
                height: '4px',
                borderRadius: '2px',
                background: step === 1 ? 'var(--accent)' : 'rgba(255, 255, 255, 0.2)',
                transition: 'background 0.3s ease',
              }}
            />
            <div
              style={{
                width: '24px',
                height: '4px',
                borderRadius: '2px',
                background: step === 2 ? 'var(--accent)' : 'rgba(255, 255, 255, 0.2)',
                transition: 'background 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* STEP 1: Catchphrase & Sign-In */}
        {step === 1 && (
          <div style={{ padding: '36px 32px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* GeMo Avatar Badge */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '-6px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  boxShadow: '0 8px 24px rgba(99, 102, 241, 0.35)',
                }}
              >
                ✨
              </div>
            </div>

            {/* Catchphrase */}
            <div>
              <h1
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: '#ffffff',
                  margin: '0 0 10px 0',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.35,
                  background: 'linear-gradient(135deg, #ffffff, #c7d2fe)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                あなたのデスクに、最高の知性と萌えを。
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: 'var(--text2)',
                  lineHeight: 1.6,
                }}
              >
                HomeSpark GeMo — 専属AI秘書 <strong>GeMo（ジェモ）</strong> が、<br />
                あなたのタスク管理、議事録要約、名刺整理、日常の対話を全力サポートします。
              </p>
            </div>

            {/* Login Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              {/* Google Sign In Button */}
              <button
                onClick={() => {
                  onLoginGoogle();
                  setStep(2);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '13px 20px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #4285F4, #2563eb)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '14px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                  transition: 'transform 0.15s ease, filter 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1.0)'; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#ffffff" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#ffffff" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#ffffff" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#ffffff" />
                </svg>
                Google でサインイン
              </button>

              {/* Skip Sign-in Button */}
              <button
                onClick={() => {
                  onLoginQuick();
                  setStep(2);
                }}
                style={{
                  width: '100%',
                  padding: '9px 16px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: 'var(--text2)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  borderRadius: '10px',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
              >
                サインインせずに続ける (ローカル利用)
              </button>

              {/* Limitation Notice */}
              <span style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', lineHeight: 1.4 }}>
                ※ サインインしない場合、GoogleカレンダーやGmail等の外部連携機能が制限されます。
              </span>
            </div>
          </div>
        )}

        {/* STEP 2: Hardware & GPU Speech Suitability Check */}
        {step === 2 && (
          <div style={{ padding: '36px 32px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🎙️ ＆ ⚡</div>
              <h2 style={{ fontSize: '19px', fontWeight: 700, color: '#ffffff', margin: '0 0 6px 0' }}>
                音声会話・ハードウェア適性チェック
              </h2>
              <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.5 }}>
                GeMoのローカル音声合成（Irodori-TTS）とリアルタイム通話は、<br />
                PC内の <strong>GPU（NVIDIA CUDA等）</strong> を前提とした高速システムです。
              </p>
            </div>

            {/* Check Results Box */}
            <div
              style={{
                padding: '20px',
                borderRadius: '16px',
                background: checkingGpu
                  ? 'rgba(255, 255, 255, 0.03)'
                  : gpuInfo?.has_gpu
                  ? 'rgba(16, 185, 129, 0.08)'
                  : 'rgba(239, 68, 68, 0.08)',
                border: `1.5px solid ${
                  checkingGpu
                    ? 'rgba(255, 255, 255, 0.1)'
                    : gpuInfo?.has_gpu
                    ? 'rgba(16, 185, 129, 0.35)'
                    : 'rgba(239, 68, 68, 0.35)'
                }`,
              }}
            >
              {checkingGpu ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--accent)', fontSize: '13px' }}>
                  <span>⏳</span> ハードウェア（GPU環境）を診断しています...
                </div>
              ) : gpuInfo?.has_gpu ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>✅</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#10B981' }}>
                      GPU（ハードウェアアクセラレーション）検出完了！
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
                    検出デバイス: <code>{gpuInfo.gpu_name || 'NVIDIA GPU'}</code><br />
                    ローカル超高速音声会話AI（Irodori-TTS）および通話機能をご利用いただけます。
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#EF4444' }}>
                      GPU（NVIDIA CUDA）が検出されませんでした
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
                    検出環境: <code>{gpuInfo?.gpu_name || 'CPU / 内蔵グラフィックス'}</code><br />
                    ローカル音声推論の要件を満たさないため、<strong>音声会話AI（音声通話・TTS）は自動的に完全無効化</strong>されます。
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text3)', borderTop: '1px solid rgba(239,68,68,0.2)', paddingTop: '6px', marginTop: '2px' }}>
                    ※ テキストチャット、長期記憶（Skills）、名刺管理、外部メール連携など、その他の全機能はそのまま快適にご利用いただけます。
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  padding: '11px 18px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'transparent',
                  color: 'var(--text2)',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                戻る
              </button>

              <button
                onClick={handleFinish}
                disabled={checkingGpu}
                style={{
                  flex: 1,
                  padding: '11px 20px',
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  fontSize: '14px',
                  fontWeight: 700,
                  borderRadius: '12px',
                  cursor: checkingGpu ? 'wait' : 'pointer',
                  boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
                }}
              >
                🚀 HomeSpark GeMo を始める
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
