import React, { useState, useEffect, useRef } from 'react';
import { ChatService } from '../services/ChatService';

interface OnboardingModalProps {
  isOpen: boolean;
  onLoginGoogle: () => void;
  onLoginQuick: () => void;
  onComplete: (voiceEnabled: boolean) => void;
}

type ProviderType = 'custom_vllm' | 'gemini' | 'openai' | 'local_vllm';

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onLoginGoogle,
  onLoginQuick,
  onComplete,
}) => {
  // Step 1: Authentication, Step 2: LLM Model Setup, Step 3: Hardware Diagnostics
  const [step, setStep] = useState<number>(1);
  const [checkingGpu, setCheckingGpu] = useState<boolean>(true);
  const [gpuInfo, setGpuInfo] = useState<{ has_gpu: boolean; gpu_name?: string } | null>(null);
  const [showButtons, setShowButtons] = useState<boolean>(false);

  // LLM Provider States
  const [activeProvider, setActiveProvider] = useState<ProviderType>('custom_vllm');
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>('gemini-2.5-flash');
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [openaiModel, setOpenaiModel] = useState<string>('gpt-4o-mini');
  const [customVllmUrl, setCustomVllmUrl] = useState<string>('https://jp-01.bytecompute.ai/v1');
  const [customVllmKey, setCustomVllmKey] = useState<string>('');
  const [customVllmModel, setCustomVllmModel] = useState<string>('gemma-4-31B-it');
  const [hfToken, setHfToken] = useState<string>('');
  const [localModel, setLocalModel] = useState<string>('google/gemma-4-31B-it');

  const [testingLlm, setTestingLlm] = useState<boolean>(false);
  const [savingLlm, setSavingLlm] = useState<boolean>(false);
  const [llmMsg, setLlmMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const chatServiceRef = useRef<ChatService | null>(null);
  if (!chatServiceRef.current) {
    chatServiceRef.current = new ChatService();
  }
  const chatService = chatServiceRef.current;

  const phrase = "あなたのデスクに、最高の知性と萌えを。";

  // Step 1 Animation timer
  useEffect(() => {
    if (isOpen && step === 1) {
      const timer = setTimeout(() => {
        setShowButtons(true);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [isOpen, step]);

  const handleSkipAnimation = () => {
    setShowButtons(true);
  };

  // Load existing LLM config when entering Step 2
  useEffect(() => {
    if (isOpen && step === 2) {
      chatService.getLlmConfig().then((cfg) => {
        if (cfg) {
          if (cfg.active_provider) {
            setActiveProvider(cfg.active_provider as ProviderType);
          }
          if (cfg.providers) {
            if (cfg.providers.gemini?.model_name) setGeminiModel(cfg.providers.gemini.model_name);
            if (cfg.providers.openai?.model_name) setOpenaiModel(cfg.providers.openai.model_name);
            if (cfg.providers.custom_vllm?.base_url) setCustomVllmUrl(cfg.providers.custom_vllm.base_url);
            if (cfg.providers.custom_vllm?.model_name) setCustomVllmModel(cfg.providers.custom_vllm.model_name);
            if (cfg.providers.local_vllm?.model_name) setLocalModel(cfg.providers.local_vllm.model_name);
          }
        }
      }).catch(() => {});
    }
  }, [isOpen, step]);

  // Step 3 Hardware Diagnostics
  useEffect(() => {
    if (isOpen && step === 3) {
      setCheckingGpu(true);
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
            } catch {}

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

  // Handle LLM Connection Test
  const handleTestConnection = async () => {
    if (testingLlm) return;
    setTestingLlm(true);
    setLlmMsg(null);

    let testPayload: any = { provider: activeProvider };
    if (activeProvider === 'gemini') {
      testPayload.api_key = geminiKey || undefined;
      testPayload.model_name = geminiModel;
    } else if (activeProvider === 'openai') {
      testPayload.api_key = openaiKey || undefined;
      testPayload.model_name = openaiModel;
    } else if (activeProvider === 'custom_vllm') {
      testPayload.api_key = customVllmKey || undefined;
      testPayload.base_url = customVllmUrl;
      testPayload.model_name = customVllmModel;
    } else if (activeProvider === 'local_vllm') {
      testPayload.hf_token = hfToken || undefined;
      testPayload.model_name = localModel;
    }

    try {
      const res = await chatService.testLlmConnection(testPayload);
      if (res.success) {
        setLlmMsg({ type: 'success', text: `✅ 接続成功: ${res.message || '正常に応答を受信しました'}` });
      } else {
        setLlmMsg({ type: 'error', text: `❌ 接続失敗: ${res.message}` });
      }
    } catch (e: any) {
      setLlmMsg({ type: 'error', text: `❌ 接続テストエラー: ${e.message || 'サーバー未応答'}` });
    } finally {
      setTestingLlm(false);
    }
  };

  // Save LLM Config and proceed to Step 3
  const handleSaveLlmAndNext = async () => {
    if (savingLlm) return;
    setSavingLlm(true);
    setLlmMsg(null);

    const payload = {
      active_provider: activeProvider,
      gemini: {
        api_key: geminiKey || undefined,
        model_name: geminiModel,
      },
      openai: {
        api_key: openaiKey || undefined,
        model_name: openaiModel,
      },
      custom_vllm: {
        api_key: customVllmKey || undefined,
        base_url: customVllmUrl,
        model_name: customVllmModel,
      },
      local_vllm: {
        hf_token: hfToken || undefined,
        model_name: localModel,
      },
    };

    try {
      await chatService.saveLlmConfig(payload);
      setStep(3);
    } catch (e: any) {
      setLlmMsg({ type: 'error', text: `設定保存警告: ${e.message || '保存に失敗しましたが次へ進めます'}` });
      setTimeout(() => setStep(3), 800);
    } finally {
      setSavingLlm(false);
    }
  };

  const handleFinish = () => {
    const isVoiceReady = Boolean(gpuInfo?.has_gpu);
    onComplete(isVoiceReady);
  };

  const getStepTitle = () => {
    if (step === 1) return 'Authentication';
    if (step === 2) return 'AI Model Setup';
    return 'Hardware Diagnostics';
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
        overflowY: 'auto',
      }}
    >
      {/* Top Brand Indicator */}
      <div
        style={{
          position: 'absolute',
          top: '28px',
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
        <span style={{ fontSize: '12px', color: '#818cf8', letterSpacing: '0.04em', fontWeight: 500 }}>
          Step {step} / 3: {getStepTitle()}
        </span>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          width: '100%',
          maxWidth: step === 2 ? '680px' : '620px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          transition: 'max-width 0.3s ease',
        }}
      >
        {/* ============================================================ */}
        {/* STEP 1: Catchphrase & Sign-in Selection                      */}
        {/* ============================================================ */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
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

            <p
              style={{
                margin: '0 0 36px 0',
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLoginGoogle();
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
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  borderRadius: '12px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#4285F4';
                  e.currentTarget.style.background = 'rgba(66, 133, 244, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
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

        {/* ============================================================ */}
        {/* STEP 2: LLM Model Type & Provider Setup (NEW)                */}
        {/* ============================================================ */}
        {step === 2 && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', textAlign: 'left' }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a8 8 0 0 0-8 8c0 3.36 2.07 6.24 5 7.42V20a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2.58c2.93-1.18 5-4.06 5-7.42a8 8 0 0 0-8-8z"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
                <line x1="10" y1="13" x2="14" y2="13"/>
              </svg>
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', margin: '0 0 6px 0', textAlign: 'center', width: '100%' }}>
              AI 対話モデルタイプの設定
            </h2>
            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, textAlign: 'center', width: '100%' }}>
              GeMo の対話推論に使用する AI プロバイダを選択してください。（後からいつでも環境設定で変更可能です）
            </p>

            {/* Provider Selection Cards Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                gap: '10px',
                width: '100%',
                marginBottom: '18px',
              }}
            >
              {/* 1. Custom vLLM */}
              <div
                onClick={() => { setActiveProvider('custom_vllm'); setLlmMsg(null); }}
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  border: `1.5px solid ${activeProvider === 'custom_vllm' ? '#6366f1' : 'rgba(255, 255, 255, 0.08)'}`,
                  background: activeProvider === 'custom_vllm' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>Custom vLLM</span>
                  <span style={{ fontSize: '9.5px', background: 'rgba(99, 102, 241, 0.25)', color: '#818cf8', padding: '1px 5px', borderRadius: '6px', fontWeight: 600 }}>推奨</span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>自前GPU / ByteCompute</span>
              </div>

              {/* 2. Google Gemini */}
              <div
                onClick={() => { setActiveProvider('gemini'); setLlmMsg(null); }}
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  border: `1.5px solid ${activeProvider === 'gemini' ? '#4285F4' : 'rgba(255, 255, 255, 0.08)'}`,
                  background: activeProvider === 'gemini' ? 'rgba(66, 133, 244, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>Google Gemini</span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Gemini 2.5 Flash</span>
              </div>

              {/* 3. OpenAI */}
              <div
                onClick={() => { setActiveProvider('openai'); setLlmMsg(null); }}
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  border: `1.5px solid ${activeProvider === 'openai' ? '#10a37f' : 'rgba(255, 255, 255, 0.08)'}`,
                  background: activeProvider === 'openai' ? 'rgba(16, 163, 127, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>OpenAI</span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>GPT-4o / GPT-4o-mini</span>
              </div>

              {/* 4. Local vLLM */}
              <div
                onClick={() => { setActiveProvider('local_vllm'); setLlmMsg(null); }}
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  border: `1.5px solid ${activeProvider === 'local_vllm' ? '#eab308' : 'rgba(255, 255, 255, 0.08)'}`,
                  background: activeProvider === 'local_vllm' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>Local vLLM</span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>ローカルPC推論</span>
              </div>
            </div>

            {/* Provider Configuration Form Panel */}
            <div
              style={{
                width: '100%',
                padding: '18px 20px',
                borderRadius: '14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Custom vLLM Inputs */}
              {activeProvider === 'custom_vllm' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      エンドポイント URL (Base URL)
                    </label>
                    <input
                      type="text"
                      value={customVllmUrl}
                      onChange={(e) => setCustomVllmUrl(e.target.value)}
                      placeholder="https://jp-01.bytecompute.ai/v1"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        background: '#0d1117',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                        API キー (任意)
                      </label>
                      <input
                        type="password"
                        value={customVllmKey}
                        onChange={(e) => setCustomVllmKey(e.target.value)}
                        placeholder="環境変数または未設定時は空白"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          background: '#0d1117',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontSize: '12.5px',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                        モデル名
                      </label>
                      <input
                        type="text"
                        value={customVllmModel}
                        onChange={(e) => setCustomVllmModel(e.target.value)}
                        placeholder="gemma-4-31B-it"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          background: '#0d1117',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontSize: '12.5px',
                          fontFamily: 'monospace',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Google Gemini Inputs */}
              {activeProvider === 'gemini' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      Gemini API キー (Google AI Studio)
                    </label>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        background: '#0d1117',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      モデル名
                    </label>
                    <input
                      type="text"
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      placeholder="gemini-2.5-flash"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        background: '#0d1117',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                  </div>
                </>
              )}

              {/* OpenAI Inputs */}
              {activeProvider === 'openai' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      OpenAI API キー
                    </label>
                    <input
                      type="password"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        background: '#0d1117',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      モデル名
                    </label>
                    <input
                      type="text"
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                      placeholder="gpt-4o-mini"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        background: '#0d1117',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                  </div>
                </>
              )}

              {/* Local vLLM Inputs */}
              {activeProvider === 'local_vllm' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      Hugging Face トークン (任意)
                    </label>
                    <input
                      type="password"
                      value={hfToken}
                      onChange={(e) => setHfToken(e.target.value)}
                      placeholder="hf_..."
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        background: '#0d1117',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      ローカルモデル名
                    </label>
                    <input
                      type="text"
                      value={localModel}
                      onChange={(e) => setLocalModel(e.target.value)}
                      placeholder="gemma-4-31B-it"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        background: '#0d1117',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                  </div>
                </>
              )}

              {/* Connection Test Button & Message */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                <button
                  onClick={handleTestConnection}
                  disabled={testingLlm}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: testingLlm ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                >
                  {testingLlm ? (
                    <>
                      <div className="spinner" style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      テスト中...
                    </>
                  ) : (
                    <>⚡ 接続テスト</>
                  )}
                </button>

                {llmMsg && (
                  <span
                    style={{
                      fontSize: '11.5px',
                      color: llmMsg.type === 'success' ? '#34A853' : (llmMsg.type === 'error' ? '#EA4335' : '#818cf8'),
                      fontWeight: 500,
                    }}
                  >
                    {llmMsg.text}
                  </span>
                )}
              </div>
            </div>

            {/* Navigation Buttons for Step 2 */}
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  padding: '12px 20px',
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
                onClick={handleSaveLlmAndNext}
                disabled={savingLlm}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  border: 'none',
                  background: '#6366f1',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  borderRadius: '10px',
                  cursor: savingLlm ? 'wait' : 'pointer',
                  boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#4f46e5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#6366f1'; }}
              >
                {savingLlm ? '保存中...' : 'モデル設定を保存して次へ (診断) →'}
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP 3: Professional Hardware Diagnostics                    */}
        {/* ============================================================ */}
        {step === 3 && (
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
                onClick={() => setStep(2)}
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

