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
  const [currentVersion, setCurrentVersion] = useState<string>('3.1.13');

  // Multi-Provider LLM state
  const [activeProvider, setActiveProvider] = useState<'gemini' | 'openai' | 'custom_vllm' | 'local_vllm'>('custom_vllm');
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>('gemini-2.5-flash');
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [openaiModel, setOpenaiModel] = useState<string>('gpt-4o-mini');
  const [customVllmUrl, setCustomVllmUrl] = useState<string>('https://jp-01.bytecompute.ai/v1');
  const [customVllmKey, setCustomVllmKey] = useState<string>('');
  const [customVllmModel, setCustomVllmModel] = useState<string>('gemma-4-31B-it');
  const [hfToken, setHfToken] = useState<string>('');
  const [localModel, setLocalModel] = useState<string>('google/gemma-4-31B-it');
  
  // Provider preview / status
  const [providerStatus, setProviderStatus] = useState<{
    gemini: { has_key: boolean; preview: string; base_url: string; model_name: string };
    openai: { has_key: boolean; preview: string; base_url: string; model_name: string };
    custom_vllm: { has_key: boolean; preview: string; base_url: string; model_name: string };
    local_vllm: { has_key: boolean; preview: string; base_url: string; model_name: string };
  }>({
    gemini: { has_key: false, preview: '', base_url: '', model_name: 'gemini-2.5-flash' },
    openai: { has_key: false, preview: '', base_url: '', model_name: 'gpt-4o-mini' },
    custom_vllm: { has_key: false, preview: '', base_url: '', model_name: 'gemma-4-31B-it' },
    local_vllm: { has_key: false, preview: '', base_url: '', model_name: 'google/gemma-4-31B-it' },
  });

  // Hardware state
  const [gpuInfo, setGpuInfo] = useState<{ has_gpu: boolean; gpu_name?: string | null; vram_gb?: number | null }>({
    has_gpu: false,
    gpu_name: null,
    vram_gb: null,
  });

  const [savingLlm, setSavingLlm] = useState<boolean>(false);
  const [testingLlm, setTestingLlm] = useState<boolean>(false);
  const [llmMsg, setLlmMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const chatService = new ChatService();

  useEffect(() => {
    const desktop = isDesktopApp();
    setIsDesktop(desktop);

    if (desktop && window.electronAPI) {
      if (window.electronAPI.getAppVersion) {
        window.electronAPI.getAppVersion().then((v) => {
          if (v) setCurrentVersion(v);
        }).catch(() => {});
      }

      if (window.electronAPI.onUpdateStatus) {
        const unsub = window.electronAPI.onUpdateStatus((data) => {
          setUpdateStatus(data);
          if (data.status !== 'checking') {
            setCheckingUpdate(false);
          }
        });
        return () => unsub();
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStorageMsg(null);
      setLlmMsg(null);
      setLoading(true);

      Promise.all([
        chatService.getStorageMode().catch(() => 'cloud' as const),
        chatService.getLlmConfig().catch(() => null),
      ]).then(([mode, llmConfig]) => {
        setStorageMode(mode);
        if (llmConfig) {
          setActiveProvider(llmConfig.active_provider);
          setProviderStatus(llmConfig.providers);
          setGpuInfo(llmConfig.gpu);
          if (llmConfig.providers.gemini?.model_name) setGeminiModel(llmConfig.providers.gemini.model_name);
          if (llmConfig.providers.openai?.model_name) setOpenaiModel(llmConfig.providers.openai.model_name);
          if (llmConfig.providers.custom_vllm?.base_url) setCustomVllmUrl(llmConfig.providers.custom_vllm.base_url);
          if (llmConfig.providers.custom_vllm?.model_name) setCustomVllmModel(llmConfig.providers.custom_vllm.model_name);
          if (llmConfig.providers.local_vllm?.model_name) setLocalModel(llmConfig.providers.local_vllm.model_name);
        }
      }).finally(() => {
        setLoading(false);
      });
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

  const handleSaveLlmConfig = async () => {
    if (savingLlm) return;
    setSavingLlm(true);
    setLlmMsg(null);

    const payload: any = {
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
      const res = await chatService.saveLlmConfig(payload);
      const updated = await chatService.getLlmConfig();
      if (updated) {
        setProviderStatus(updated.providers);
      }
      setGeminiKey('');
      setOpenaiKey('');
      setCustomVllmKey('');
      setHfToken('');
      setLlmMsg({ type: 'success', text: `LLM 設定（${getProviderDisplayName(activeProvider)}）を保存し、即座に有効化しました！` });
    } catch (e: any) {
      setLlmMsg({ type: 'error', text: `設定保存エラー: ${e.message || '不明なエラー'}` });
    } finally {
      setSavingLlm(false);
    }
  };

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
        setLlmMsg({ type: 'success', text: `${res.message} (モデル返答: "${res.response}")` });
      } else {
        setLlmMsg({ type: 'error', text: res.message });
      }
    } catch (e: any) {
      setLlmMsg({ type: 'error', text: `接続テスト失敗: ${e.message || 'エラー'}` });
    } finally {
      setTestingLlm(false);
    }
  };

  function getProviderDisplayName(p: string): string {
    switch (p) {
      case 'gemini': return 'Google Gemini';
      case 'openai': return 'OpenAI';
      case 'custom_vllm': return '独自の vLLM サーバー';
      case 'local_vllm': return 'ローカルで動かす (Local vLLM)';
      default: return p;
    }
  }

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
          {/* Section 1: Models & LLM Provider Configuration */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  Models / LLM プロバイダー設定
                </span>
              </div>

              {/* Hardware / GPU Status Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {gpuInfo.has_gpu ? (
                  <span
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '10px',
                      fontWeight: 600,
                      background: 'rgba(52, 168, 83, 0.12)',
                      color: '#34A853',
                      border: '1px solid rgba(52, 168, 83, 0.3)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    GPU: {gpuInfo.gpu_name || 'NVIDIA CUDA'} ({gpuInfo.vram_gb ? `${gpuInfo.vram_gb}GB VRAM` : '有効'})
                  </span>
                ) : (
                  <span
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '10px',
                      fontWeight: 600,
                      background: 'rgba(234, 67, 53, 0.08)',
                      color: '#EA4335',
                      border: '1px solid rgba(234, 67, 53, 0.25)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    CPU 環境 (GPU 未検出)
                  </span>
                )}
              </div>
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>
              対話・タスク推論エンジンを選択します。環境に GPU がない場合はクローズド API を推奨します。
            </p>

            {/* Provider Selection Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              {/* Option 1: Google Gemini */}
              <div
                onClick={() => setActiveProvider('gemini')}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: `1.5px solid ${activeProvider === 'gemini' ? '#4285F4' : 'var(--border2)'}`,
                  background: activeProvider === 'gemini' ? 'rgba(66, 133, 244, 0.08)' : 'var(--bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="radio"
                  checked={activeProvider === 'gemini'}
                  onChange={() => setActiveProvider('gemini')}
                  style={{ accentColor: '#4285F4', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>Google Gemini</span>
                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>公式 API / Flash & Pro</span>
                </div>
              </div>

              {/* Option 2: OpenAI */}
              <div
                onClick={() => setActiveProvider('openai')}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: `1.5px solid ${activeProvider === 'openai' ? '#4285F4' : 'var(--border2)'}`,
                  background: activeProvider === 'openai' ? 'rgba(66, 133, 244, 0.08)' : 'var(--bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="radio"
                  checked={activeProvider === 'openai'}
                  onChange={() => setActiveProvider('openai')}
                  style={{ accentColor: '#4285F4', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>OpenAI</span>
                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>GPT-4o / GPT-4o-mini</span>
                </div>
              </div>

              {/* Option 3: 独自の vLLM サーバー */}
              <div
                onClick={() => setActiveProvider('custom_vllm')}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: `1.5px solid ${activeProvider === 'custom_vllm' ? '#4285F4' : 'var(--border2)'}`,
                  background: activeProvider === 'custom_vllm' ? 'rgba(66, 133, 244, 0.08)' : 'var(--bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="radio"
                  checked={activeProvider === 'custom_vllm'}
                  onChange={() => setActiveProvider('custom_vllm')}
                  style={{ accentColor: '#4285F4', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>独自の vLLM サーバー</span>
                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>ByteCompute / 自社 GPU</span>
                </div>
              </div>

              {/* Option 4: ローカルで動かす (GPU連動) */}
              <div
                onClick={() => {
                  if (gpuInfo.has_gpu) setActiveProvider('local_vllm');
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: `1.5px solid ${activeProvider === 'local_vllm' ? '#4285F4' : 'var(--border2)'}`,
                  background: activeProvider === 'local_vllm'
                    ? 'rgba(66, 133, 244, 0.08)'
                    : (!gpuInfo.has_gpu ? 'rgba(0, 0, 0, 0.03)' : 'var(--bg)'),
                  cursor: gpuInfo.has_gpu ? 'pointer' : 'not-allowed',
                  opacity: gpuInfo.has_gpu ? 1 : 0.55,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="radio"
                  checked={activeProvider === 'local_vllm'}
                  disabled={!gpuInfo.has_gpu}
                  onChange={() => {
                    if (gpuInfo.has_gpu) setActiveProvider('local_vllm');
                  }}
                  style={{ accentColor: '#4285F4', cursor: gpuInfo.has_gpu ? 'pointer' : 'not-allowed' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>ローカルで動かす</span>
                    {!gpuInfo.has_gpu && (
                      <span style={{ fontSize: '9px', background: 'var(--border2)', color: 'var(--text3)', padding: '0 4px', borderRadius: '3px' }}>GPU必須</span>
                    )}
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Local vLLM / HuggingFace</span>
                </div>
              </div>
            </div>

            {/* GPU Disabled Warning if local_vllm is unavailable */}
            {!gpuInfo.has_gpu && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(242, 153, 74, 0.08)', border: '1px solid rgba(242, 153, 74, 0.25)', fontSize: '11px', color: '#F2994A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F2994A" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                GPU が検出されなかったため、ローカル推論は無効化されています。クローズド API をご利用ください。
              </div>
            )}

            {/* Active Provider Input Details Panel */}
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
              {/* Google Gemini Panel */}
              {activeProvider === 'gemini' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text)' }}>
                      Google Gemini API キー
                      {providerStatus.gemini.has_key && (
                        <span style={{ marginLeft: '6px', fontWeight: 400, color: '#34A853', fontSize: '10.5px' }}>
                          (設定済み: {providerStatus.gemini.preview})
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      placeholder="AIzaSy... (Gemini API キーを入力)"
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border3)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text)' }}>モデル名 (Model Name)</label>
                    <input
                      type="text"
                      placeholder="gemini-2.5-flash または gemini-2.5-pro"
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border3)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* OpenAI Panel */}
              {activeProvider === 'openai' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text)' }}>
                      OpenAI API キー
                      {providerStatus.openai.has_key && (
                        <span style={{ marginLeft: '6px', fontWeight: 400, color: '#34A853', fontSize: '10.5px' }}>
                          (設定済み: {providerStatus.openai.preview})
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      placeholder="sk-proj-... (OpenAI API キーを入力)"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border3)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text)' }}>モデル名 (Model Name)</label>
                    <input
                      type="text"
                      placeholder="gpt-4o-mini, gpt-4o, gpt-4.5-preview など"
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border3)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 独自の vLLM サーバー Panel */}
              {activeProvider === 'custom_vllm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text)' }}>サーバーエンドポイント (Base URL)</label>
                    <input
                      type="text"
                      placeholder="https://jp-01.bytecompute.ai/v1 または http://192.168.1.100:8000/v1"
                      value={customVllmUrl}
                      onChange={(e) => setCustomVllmUrl(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border3)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text)' }}>
                      API キー (オプション)
                      {providerStatus.custom_vllm.has_key && (
                        <span style={{ marginLeft: '6px', fontWeight: 400, color: '#34A853', fontSize: '10.5px' }}>
                          (設定済み: {providerStatus.custom_vllm.preview})
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      placeholder="bytecompute_... または空欄"
                      value={customVllmKey}
                      onChange={(e) => setCustomVllmKey(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border3)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text)' }}>モデル名 (Model Name)</label>
                    <input
                      type="text"
                      placeholder="gemma-4-31B-it または Qwen/Qwen2.5-72B-Instruct"
                      value={customVllmModel}
                      onChange={(e) => setCustomVllmModel(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border3)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* ローカルで動かす Panel */}
              {activeProvider === 'local_vllm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text)' }}>
                      Hugging Face API Token
                      {providerStatus.local_vllm.has_key && (
                        <span style={{ marginLeft: '6px', fontWeight: 400, color: '#34A853', fontSize: '10.5px' }}>
                          (設定済み: {providerStatus.local_vllm.preview})
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      placeholder="hf_... (Gated Model 認証用トークン)"
                      value={hfToken}
                      onChange={(e) => setHfToken(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border3)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text)' }}>モデル名 (Model Name)</label>
                    <input
                      type="text"
                      placeholder="google/gemma-4-31B-it または unsloth/gemma-2-2b-it"
                      value={localModel}
                      onChange={(e) => setLocalModel(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border3)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons: Test Connection & Save */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', paddingTop: '10px', borderTop: '1px solid var(--border2)' }}>
                <button
                  onClick={handleTestConnection}
                  disabled={testingLlm}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border3)',
                    background: 'var(--panel)',
                    color: 'var(--text)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: testingLlm ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                  {testingLlm ? 'テスト中...' : '接続テスト'}
                </button>

                <button
                  onClick={handleSaveLlmConfig}
                  disabled={savingLlm}
                  style={{
                    padding: '7px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#4285F4',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: savingLlm ? 'wait' : 'pointer',
                  }}
                >
                  {savingLlm ? '保存中...' : '設定を保存して有効化'}
                </button>
              </div>

              {/* Result Message */}
              {llmMsg && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: llmMsg.type === 'success' ? 'rgba(52, 168, 83, 0.1)' : 'rgba(234, 67, 53, 0.1)',
                    border: `1px solid ${llmMsg.type === 'success' ? 'rgba(52, 168, 83, 0.25)' : 'rgba(234, 67, 53, 0.25)'}`,
                    color: llmMsg.type === 'success' ? '#34A853' : '#EA4335',
                    fontSize: '11.5px',
                  }}
                >
                  {llmMsg.text}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Storage Engine */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
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
                  v{currentVersion}
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
                      現在のバージョン: <strong>v{currentVersion}</strong>
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
                    お使いのバージョン（v{currentVersion}）は最新です
                  </div>
                )}

                {updateStatus?.status === 'dev-mode' && (
                  <div style={{ fontSize: '11.5px', color: '#F2994A', display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'rgba(242, 153, 74, 0.08)', border: '1px solid rgba(242, 153, 74, 0.25)', padding: '8px 12px', borderRadius: '8px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F2994A" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span>{updateStatus.message || '開発モードで稼働中のため、自動更新は無効です。'}</span>
                      <button
                        onClick={() => window.electronAPI?.openExternal('https://github.com/Ayato964/HomeSpark/releases/latest')}
                        style={{ background: 'transparent', border: 'none', color: '#4285F4', padding: 0, cursor: 'pointer', textAlign: 'left', fontSize: '11px', textDecoration: 'underline' }}
                      >
                        GitHub Releases から最新版インストーラを確認 ↗
                      </button>
                    </div>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: 'rgba(234, 67, 53, 0.08)', border: '1px solid rgba(234, 67, 53, 0.25)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11.5px', color: '#EA4335', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <span>{updateStatus.error || '更新の確認中にエラーが発生しました。'}</span>
                    </div>
                    <button
                      onClick={() => window.electronAPI?.openExternal('https://github.com/Ayato964/HomeSpark/releases/latest')}
                      style={{
                        alignSelf: 'flex-start',
                        padding: '5px 10px',
                        fontSize: '11px',
                        background: 'var(--panel)',
                        border: '1px solid var(--border3)',
                        color: '#4285F4',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      GitHub Releases から直接ダウンロード ↗
                    </button>
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
