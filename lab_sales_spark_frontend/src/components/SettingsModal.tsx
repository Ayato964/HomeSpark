import React, { useState, useEffect, useRef } from 'react';
import { ChatService } from '../services/ChatService';
import { isDesktopApp, getBackendBaseUrl } from '../utils/platform';
import { UpdateStatusData } from '../types/electron';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'llm' | 'audio' | 'storage' | 'system';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('llm');

  // Storage state
  const [storageMode, setStorageMode] = useState<'cloud' | 'local'>('cloud');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [storageMsg, setStorageMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  // Auto-updater state
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusData | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [currentVersion, setCurrentVersion] = useState<string>('3.2.0');

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

  // Show/Hide password toggle
  const [showKey, setShowKey] = useState<boolean>(false);

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

  // Audio Devices & Voice State
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>('');
  const [selectedOutputId, setSelectedOutputId] = useState<string>('');
  const [micTesting, setMicTesting] = useState<boolean>(false);
  const [micVolume, setMicVolume] = useState<number>(0);
  const [speakerTesting, setSpeakerTesting] = useState<boolean>(false);
  const [voiceChecking, setVoiceChecking] = useState<boolean>(false);
  const [voiceSupported, setVoiceSupported] = useState<boolean>(false);
  const [voiceCheckResult, setVoiceCheckResult] = useState<{ isSupported: boolean; message: string } | null>(null);

  // End-to-End Voice AI Diagnostics State
  const [voiceDiagRunning, setVoiceDiagRunning] = useState<boolean>(false);
  const [voiceDiagLogs, setVoiceDiagLogs] = useState<string[]>([]);
  const [voiceDiagResult, setVoiceDiagResult] = useState<any | null>(null);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micAnimIdRef = useRef<number | null>(null);
  const micTestSessionIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const chatService = new ChatService();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopMicTest();
    };
  }, []);

  // Load Audio Devices
  const loadAudioDevices = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      // If devices have empty labels, prompt permission once to reveal full device names
      if (devices.some((d) => d.kind.startsWith('audio') && !d.label)) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
        } catch {
          // ignore
        }
      }
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      setInputDevices(inputs);
      setOutputDevices(outputs);

      const savedIn = localStorage.getItem('homespark_audio_input_device');
      if (savedIn && inputs.some((d) => d.deviceId === savedIn)) {
        setSelectedInputId(savedIn);
      } else if (inputs.length > 0) {
        setSelectedInputId(inputs[0].deviceId);
      }

      const savedOut = localStorage.getItem('homespark_audio_output_device');
      if (savedOut && outputs.some((d) => d.deviceId === savedOut)) {
        setSelectedOutputId(savedOut);
      } else if (outputs.length > 0) {
        setSelectedOutputId(outputs[0].deviceId);
      }
    } catch (e) {
      console.warn('[Audio Devices] Enumerate failed:', e);
    }
  };

  // Mic Volume VU Meter Test with concurrency & race guards
  const startMicTest = async () => {
    stopMicTest();
    const currentSessionId = ++micTestSessionIdRef.current;
    setMicTesting(true);

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedInputId ? { deviceId: { exact: selectedInputId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Guard against component unmount or rapid re-clicks during pending promise
      if (!isMountedRef.current || !isOpen || micTestSessionIdRef.current !== currentSessionId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      micStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      micAudioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const updateVolume = () => {
        if (!isMountedRef.current || micTestSessionIdRef.current !== currentSessionId) {
          return;
        }
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicVolume(normalized);
        micAnimIdRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (e) {
      console.error('[Mic Test] Error:', e);
      if (micTestSessionIdRef.current === currentSessionId) {
        stopMicTest();
      }
    }
  };

  const stopMicTest = () => {
    micTestSessionIdRef.current++;
    if (micAnimIdRef.current) {
      cancelAnimationFrame(micAnimIdRef.current);
      micAnimIdRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micAudioCtxRef.current) {
      micAudioCtxRef.current.close().catch(() => {});
      micAudioCtxRef.current = null;
    }
    setMicTesting(false);
    setMicVolume(0);
  };

  // Speaker Sound Test (Pleasant 3-tone chime)
  const playSpeakerTest = async () => {
    if (speakerTesting) return;
    setSpeakerTesting(true);
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (selectedOutputId && typeof (audioCtx as any).setSinkId === 'function') {
        try {
          await (audioCtx as any).setSinkId(selectedOutputId);
        } catch {}
      }

      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      const startTime = audioCtx.currentTime;
      notes.forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0, startTime + index * 0.14);
        gain.gain.linearRampToValueAtTime(0.25, startTime + index * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + index * 0.14 + 0.28);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(startTime + index * 0.14);
        osc.stop(startTime + index * 0.14 + 0.3);
      });

      setTimeout(() => {
        setSpeakerTesting(false);
        audioCtx.close().catch(() => {});
      }, 750);
    } catch (e) {
      console.error('[Speaker Test] Error:', e);
      setSpeakerTesting(false);
    }
  };

  // Voice Capability Re-check
  const handleRecheckVoice = async () => {
    if (voiceChecking) return;
    setVoiceChecking(true);
    setVoiceCheckResult(null);

    try {
      const [gpuRes, healthRes] = await Promise.all([
        chatService.getGpuStatus().catch(() => ({ has_gpu: false, gpu_name: '' })),
        fetch(`${getBackendBaseUrl()}/api/health`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);

      let detectedGpuName = gpuRes.gpu_name || '';
      let hasGpu = gpuRes.has_gpu;

      if (!hasGpu && typeof window !== 'undefined') {
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (gl) {
            const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
              const webglGpu = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
              if (webglGpu && /nvidia|geforce|rtx|gtx|quadro|radeon/i.test(webglGpu)) {
                hasGpu = true;
                detectedGpuName = webglGpu;
              }
            }
          }
        } catch {}
      }

      const isHealthy = healthRes?.status === 'ok';
      const isReady = hasGpu || isHealthy;

      setVoiceSupported(isReady);
      localStorage.setItem('homespark_voice_supported', isReady ? 'true' : 'false');
      if (window.electronAPI?.setOnboardingComplete) {
        window.electronAPI.setOnboardingComplete(isReady).catch(() => {});
      }

      setVoiceCheckResult({
        isSupported: isReady,
        message: isReady
          ? `音声会話機能は使用可能です (${detectedGpuName ? `GPU: ${detectedGpuName}` : 'FastAPI + 音声API連動'})`
          : '音声サーバーに接続できませんでした。バックエンドの稼働状態を確認してください。',
      });
    } catch (e: any) {
      setVoiceCheckResult({
        isSupported: false,
        message: `判定エラー: ${e.message || '不明なエラー'}`,
      });
    } finally {
      setVoiceChecking(false);
    }
  };

  // Run comprehensive end-to-end voice AI diagnostics
  const handleRunVoiceDiagnostics = async () => {
    if (voiceDiagRunning) return;
    setVoiceDiagRunning(true);
    setVoiceDiagLogs([
      "==================================================================",
      "🚀 [音声対話AI エンドツーエンド深層診断] 診断プロセスを開始しました...",
      "==================================================================",
    ]);
    setVoiceDiagResult(null);

    try {
      const res = await chatService.runVoiceDiagnostics();
      setVoiceDiagLogs(res.logs || []);
      setVoiceDiagResult(res);

      // Play synthesized sample audio through browser audio pipeline
      if (res.tts?.pass && res.tts?.details?.endpoint) {
        try {
          const ttsUrl = `${res.tts.details.endpoint}/tts?text=${encodeURIComponent("診断テスト完了です！GeMoの音声対話システムは正常に稼働していますよっ！")}&steps=6`;
          const audio = new Audio(ttsUrl);
          audio.volume = 0.8;
          audio.play().catch(() => {});
        } catch {}
      }
    } catch (e: any) {
      setVoiceDiagLogs((prev) => [
        ...prev,
        `❌ 診断API通信エラー: ${e.message || 'サーバー未応答'}`,
        `⚠️ FastAPI バックエンド (${getBackendBaseUrl()}) が起動しているかご確認ください。`
      ]);
      setVoiceDiagResult({
        overall_pass: false,
        status: "error",
        error: e.message || '通信エラー'
      });
    } finally {
      setVoiceDiagRunning(false);
    }
  };

  const handleCopyDiagLogs = () => {
    if (voiceDiagLogs.length === 0) return;
    const fullLogText = voiceDiagLogs.join("\n");
    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullLogText).then(() => {
        setCopiedLogs(true);
        setTimeout(() => setCopiedLogs(false), 2000);
      }).catch(() => {});
    }
  };

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
      setVoiceCheckResult(null);
      setLoading(true);

      const savedVoice = localStorage.getItem('homespark_voice_supported');
      setVoiceSupported(savedVoice === 'true');

      loadAudioDevices();

      Promise.all([
        chatService.getStorageMode().catch(() => 'cloud' as const),
        chatService.getLlmConfig().catch(() => null),
      ]).then(([mode, llmConfig]) => {
        setStorageMode(mode);
        let detectedGpu: any = llmConfig?.gpu || { has_gpu: false };
        if (!detectedGpu.has_gpu && typeof window !== 'undefined') {
          try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
              const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
              if (debugInfo) {
                const webglGpu = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                if (webglGpu && /nvidia|geforce|rtx|gtx|quadro|radeon/i.test(webglGpu)) {
                  detectedGpu = { has_gpu: true, gpu_name: webglGpu };
                }
              }
            }
          } catch {
            // ignore
          }
        }
        setGpuInfo(detectedGpu);
        if (llmConfig) {
          setActiveProvider(llmConfig.active_provider);
          setProviderStatus(llmConfig.providers);
          if (llmConfig.providers.gemini?.model_name) setGeminiModel(llmConfig.providers.gemini.model_name);
          if (llmConfig.providers.openai?.model_name) setOpenaiModel(llmConfig.providers.openai.model_name);
          if (llmConfig.providers.custom_vllm?.base_url) setCustomVllmUrl(llmConfig.providers.custom_vllm.base_url);
          if (llmConfig.providers.custom_vllm?.model_name) setCustomVllmModel(llmConfig.providers.custom_vllm.model_name);
          if (llmConfig.providers.local_vllm?.model_name) setLocalModel(llmConfig.providers.local_vllm.model_name);
        }
      }).finally(() => {
        setLoading(false);
      });
    } else {
      stopMicTest();
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
      await chatService.saveLlmConfig(payload);
      const updated = await chatService.getLlmConfig();
      if (updated) {
        setProviderStatus(updated.providers);
      }
      setGeminiKey('');
      setOpenaiKey('');
      setCustomVllmKey('');
      setHfToken('');
      setLlmMsg({
        type: 'success',
        text: `LLM 設定（${getProviderDisplayName(activeProvider)}）を保存し、即座に有効化しました。`
      });
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
        setLlmMsg({ type: 'success', text: `接続成功: ${res.message} (返答: "${res.response}")` });
      } else {
        setLlmMsg({ type: 'error', text: `接続失敗: ${res.message}` });
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
      case 'local_vllm': return 'ローカル推論 (Local vLLM)';
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
      onClick={() => {
        stopMicTest();
        onClose();
      }}
    >
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border3)',
          borderRadius: '18px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          color: 'var(--text)',
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
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              background: 'rgba(66, 133, 244, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4285F4'
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                システム環境設定
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                HomeSpark GeMo 設定センター
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              stopMicTest();
              onClose();
            }}
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
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tab Navigation Segmented Bar (4 Tabs) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 20px',
          background: 'var(--panel2)',
          borderBottom: '1px solid var(--border2)',
          overflowX: 'auto',
        }}>
          {/* Tab 1: AI LLM */}
          <button
            onClick={() => {
              stopMicTest();
              setActiveTab('llm');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'llm' ? 'var(--panel)' : 'transparent',
              color: activeTab === 'llm' ? 'var(--text)' : 'var(--text3)',
              fontSize: '12px',
              fontWeight: activeTab === 'llm' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: activeTab === 'llm' ? '0 2px 6px rgba(0,0,0,0.12)' : 'none',
              borderBottom: activeTab === 'llm' ? '2px solid #4285F4' : '2px solid transparent',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'llm' ? '#4285F4' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <span>AI推論モデル</span>
          </button>

          {/* Tab 2: Voice & Audio Devices [NEW] */}
          <button
            onClick={() => setActiveTab('audio')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'audio' ? 'var(--panel)' : 'transparent',
              color: activeTab === 'audio' ? 'var(--text)' : 'var(--text3)',
              fontSize: '12px',
              fontWeight: activeTab === 'audio' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: activeTab === 'audio' ? '0 2px 6px rgba(0,0,0,0.12)' : 'none',
              borderBottom: activeTab === 'audio' ? '2px solid #FBBC05' : '2px solid transparent',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'audio' ? '#FBBC05' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <span>音声・オーディオ</span>
          </button>

          {/* Tab 3: Storage */}
          <button
            onClick={() => {
              stopMicTest();
              setActiveTab('storage');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'storage' ? 'var(--panel)' : 'transparent',
              color: activeTab === 'storage' ? 'var(--text)' : 'var(--text3)',
              fontSize: '12px',
              fontWeight: activeTab === 'storage' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: activeTab === 'storage' ? '0 2px 6px rgba(0,0,0,0.12)' : 'none',
              borderBottom: activeTab === 'storage' ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'storage' ? 'var(--accent)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            <span>記憶・保存先</span>
          </button>

          {/* Tab 4: System */}
          <button
            onClick={() => {
              stopMicTest();
              setActiveTab('system');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'system' ? 'var(--panel)' : 'transparent',
              color: activeTab === 'system' ? 'var(--text)' : 'var(--text3)',
              fontSize: '12px',
              fontWeight: activeTab === 'system' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: activeTab === 'system' ? '0 2px 6px rgba(0,0,0,0.12)' : 'none',
              borderBottom: activeTab === 'system' ? '2px solid #34A853' : '2px solid transparent',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'system' ? '#34A853' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <span>システム・更新</span>
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '22px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            flex: 1,
          }}
        >
          {/* TAB 1: AI MODEL & LLM PROVIDER */}
          {activeTab === 'llm' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                    推論エンジン・プロバイダー設定
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
                    チャットおよび秘書エージェントの推論エンジンを選択します。
                  </p>
                </div>

                {/* Hardware Status Badge */}
                <div>
                  {gpuInfo.has_gpu ? (
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '10.5px',
                        fontWeight: 600,
                        background: 'rgba(52, 168, 83, 0.12)',
                        color: '#34A853',
                        border: '1px solid rgba(52, 168, 83, 0.3)',
                        padding: '3px 9px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34A853' }} />
                      GPU: {gpuInfo.gpu_name || 'CUDA 有効'}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '10.5px',
                        fontWeight: 600,
                        background: 'rgba(234, 67, 53, 0.08)',
                        color: '#EA4335',
                        border: '1px solid rgba(234, 67, 53, 0.25)',
                        padding: '3px 9px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EA4335' }} />
                      CPU 環境 (API推奨)
                    </span>
                  )}
                </div>
              </div>

              {/* Provider Selection Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* 1. Google Gemini */}
                <div
                  onClick={() => setActiveProvider('gemini')}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: `1.5px solid ${activeProvider === 'gemini' ? '#4285F4' : 'var(--border2)'}`,
                    background: activeProvider === 'gemini' ? 'rgba(66, 133, 244, 0.08)' : 'var(--panel2)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: `2px solid ${activeProvider === 'gemini' ? '#4285F4' : 'var(--muted)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {activeProvider === 'gemini' && (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4285F4' }} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Google Gemini</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Gemini 2.5 Flash / Pro (推奨)</div>
                  </div>
                </div>

                {/* 2. OpenAI */}
                <div
                  onClick={() => setActiveProvider('openai')}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: `1.5px solid ${activeProvider === 'openai' ? '#4285F4' : 'var(--border2)'}`,
                    background: activeProvider === 'openai' ? 'rgba(66, 133, 244, 0.08)' : 'var(--panel2)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: `2px solid ${activeProvider === 'openai' ? '#4285F4' : 'var(--muted)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {activeProvider === 'openai' && (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4285F4' }} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>OpenAI</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>GPT-4o / GPT-4o-mini</div>
                  </div>
                </div>

                {/* 3. Custom vLLM */}
                <div
                  onClick={() => setActiveProvider('custom_vllm')}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: `1.5px solid ${activeProvider === 'custom_vllm' ? '#4285F4' : 'var(--border2)'}`,
                    background: activeProvider === 'custom_vllm' ? 'rgba(66, 133, 244, 0.08)' : 'var(--panel2)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: `2px solid ${activeProvider === 'custom_vllm' ? '#4285F4' : 'var(--muted)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {activeProvider === 'custom_vllm' && (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4285F4' }} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>独自の vLLM サーバー</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>ByteCompute / 自社GPU</div>
                  </div>
                </div>

                {/* 4. Local vLLM */}
                <div
                  onClick={() => {
                    if (gpuInfo.has_gpu) setActiveProvider('local_vllm');
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: `1.5px solid ${activeProvider === 'local_vllm' ? '#4285F4' : 'var(--border2)'}`,
                    background: activeProvider === 'local_vllm'
                      ? 'rgba(66, 133, 244, 0.08)'
                      : (!gpuInfo.has_gpu ? 'var(--hover)' : 'var(--panel2)'),
                    cursor: gpuInfo.has_gpu ? 'pointer' : 'not-allowed',
                    opacity: gpuInfo.has_gpu ? 1 : 0.55,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: `2px solid ${activeProvider === 'local_vllm' ? '#4285F4' : 'var(--muted)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {activeProvider === 'local_vllm' && (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4285F4' }} />
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>ローカル推論</span>
                      {!gpuInfo.has_gpu && (
                        <span style={{ fontSize: '9px', background: 'var(--border2)', color: 'var(--text3)', padding: '1px 5px', borderRadius: '4px' }}>GPU必須</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Local Gemma / HuggingFace</div>
                  </div>
                </div>
              </div>

              {/* Provider Config Box */}
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '14px',
                  background: 'var(--panel2)',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Gemini Form */}
                {activeProvider === 'gemini' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                          Google Gemini API キー
                        </label>
                        {providerStatus.gemini.has_key && (
                          <span style={{ color: '#34A853', fontSize: '11px', fontWeight: 500 }}>
                            ● 設定済み ({providerStatus.gemini.preview})
                          </span>
                        )}
                      </div>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type={showKey ? 'text' : 'password'}
                          placeholder="AIzaSy... (Gemini API キーを入力)"
                          value={geminiKey}
                          onChange={(e) => setGeminiKey(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '9px 36px 9px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border3)',
                            background: 'var(--panel)',
                            color: 'var(--text)',
                            fontSize: '12.5px',
                            fontFamily: "'IBM Plex Mono', monospace",
                            outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(prev => !prev)}
                          style={{
                            position: 'absolute',
                            right: '8px',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text3)',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {showKey ? (
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                        モデル名
                      </label>
                      <input
                        type="text"
                        placeholder="gemini-2.5-flash または gemini-2.5-pro"
                        value={geminiModel}
                        onChange={(e) => setGeminiModel(e.target.value)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border3)',
                          background: 'var(--panel)',
                          color: 'var(--text)',
                          fontSize: '12.5px',
                          fontFamily: "'IBM Plex Mono', monospace",
                          outline: 'none',
                        }}
                      />
                    </div>
                  </>
                )}

                {/* OpenAI Form */}
                {activeProvider === 'openai' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                          OpenAI API キー
                        </label>
                        {providerStatus.openai.has_key && (
                          <span style={{ color: '#34A853', fontSize: '11px', fontWeight: 500 }}>
                            ● 設定済み ({providerStatus.openai.preview})
                          </span>
                        )}
                      </div>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type={showKey ? 'text' : 'password'}
                          placeholder="sk-proj-... (OpenAI API キーを入力)"
                          value={openaiKey}
                          onChange={(e) => setOpenaiKey(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '9px 36px 9px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border3)',
                            background: 'var(--panel)',
                            color: 'var(--text)',
                            fontSize: '12.5px',
                            fontFamily: "'IBM Plex Mono', monospace",
                            outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(prev => !prev)}
                          style={{
                            position: 'absolute',
                            right: '8px',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text3)',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {showKey ? (
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                        モデル名
                      </label>
                      <input
                        type="text"
                        placeholder="gpt-4o-mini, gpt-4o など"
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border3)',
                          background: 'var(--panel)',
                          color: 'var(--text)',
                          fontSize: '12.5px',
                          fontFamily: "'IBM Plex Mono', monospace",
                          outline: 'none',
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Custom vLLM Form */}
                {activeProvider === 'custom_vllm' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                        サーバーエンドポイント (Base URL)
                      </label>
                      <input
                        type="text"
                        placeholder="https://jp-01.bytecompute.ai/v1 または http://192.168.1.100:8000/v1"
                        value={customVllmUrl}
                        onChange={(e) => setCustomVllmUrl(e.target.value)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border3)',
                          background: 'var(--panel)',
                          color: 'var(--text)',
                          fontSize: '12.5px',
                          fontFamily: "'IBM Plex Mono', monospace",
                          outline: 'none',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                          API キー (オプション)
                        </label>
                        {providerStatus.custom_vllm.has_key && (
                          <span style={{ color: '#34A853', fontSize: '11px', fontWeight: 500 }}>
                            ● 設定済み ({providerStatus.custom_vllm.preview})
                          </span>
                        )}
                      </div>
                      <input
                        type="password"
                        placeholder="bytecompute_... または空欄"
                        value={customVllmKey}
                        onChange={(e) => setCustomVllmKey(e.target.value)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border3)',
                          background: 'var(--panel)',
                          color: 'var(--text)',
                          fontSize: '12.5px',
                          fontFamily: "'IBM Plex Mono', monospace",
                          outline: 'none',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                        モデル名
                      </label>
                      <input
                        type="text"
                        placeholder="gemma-4-31B-it または Qwen/Qwen2.5-72B-Instruct"
                        value={customVllmModel}
                        onChange={(e) => setCustomVllmModel(e.target.value)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border3)',
                          background: 'var(--panel)',
                          color: 'var(--text)',
                          fontSize: '12.5px',
                          fontFamily: "'IBM Plex Mono', monospace",
                          outline: 'none',
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Local vLLM Form */}
                {activeProvider === 'local_vllm' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                          Hugging Face API Token
                        </label>
                        {providerStatus.local_vllm.has_key && (
                          <span style={{ color: '#34A853', fontSize: '11px', fontWeight: 500 }}>
                            ● 設定済み ({providerStatus.local_vllm.preview})
                          </span>
                        )}
                      </div>
                      <input
                        type="password"
                        placeholder="hf_... (Gated Model 認証用)"
                        value={hfToken}
                        onChange={(e) => setHfToken(e.target.value)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border3)',
                          background: 'var(--panel)',
                          color: 'var(--text)',
                          fontSize: '12.5px',
                          fontFamily: "'IBM Plex Mono', monospace",
                          outline: 'none',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                        モデル名
                      </label>
                      <input
                        type="text"
                        placeholder="google/gemma-4-31B-it または unsloth/gemma-2-2b-it"
                        value={localModel}
                        onChange={(e) => setLocalModel(e.target.value)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border3)',
                          background: 'var(--panel)',
                          color: 'var(--text)',
                          fontSize: '12.5px',
                          fontFamily: "'IBM Plex Mono', monospace",
                          outline: 'none',
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Actions */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '4px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border2)',
                }}>
                  <button
                    onClick={handleTestConnection}
                    disabled={testingLlm}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--border3)',
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: testingLlm ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--panel)'; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    {testingLlm ? 'テスト中...' : '接続テスト'}
                  </button>

                  <button
                    onClick={handleSaveLlmConfig}
                    disabled={savingLlm}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#4285F4',
                      color: '#fff',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: savingLlm ? 'wait' : 'pointer',
                      boxShadow: '0 2px 8px rgba(66, 133, 244, 0.3)',
                    }}
                  >
                    {savingLlm ? '保存中...' : '設定を保存して適用'}
                  </button>
                </div>

                {/* Message Banner */}
                {llmMsg && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: llmMsg.type === 'success' ? 'rgba(52, 168, 83, 0.1)' : 'rgba(234, 67, 53, 0.1)',
                      border: `1px solid ${llmMsg.type === 'success' ? 'rgba(52, 168, 83, 0.25)' : 'rgba(234, 67, 53, 0.25)'}`,
                      color: llmMsg.type === 'success' ? '#34A853' : '#EA4335',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      {llmMsg.type === 'success' ? (
                        <polyline points="20 6 9 17 4 12"/>
                      ) : (
                        <>
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </>
                      )}
                    </svg>
                    <span>{llmMsg.text}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VOICE & AUDIO DEVICES [NEW] */}
          {activeTab === 'audio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  音声対話 & オーディオデバイス設定
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
                  音声会話機能の稼働状況の再確認、および入力マイク・出力スピーカーの選択と動作テストを行います。
                </p>
              </div>

              {/* 1. Voice Capability Re-check Card */}
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '14px',
                  background: 'var(--panel2)',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: voiceSupported ? 'rgba(52, 168, 83, 0.12)' : 'rgba(234, 67, 53, 0.1)',
                      color: voiceSupported ? '#34A853' : '#EA4335',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                          音声会話機能ステータス
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: '12px',
                            background: voiceSupported ? 'rgba(52, 168, 83, 0.12)' : 'rgba(234, 67, 53, 0.1)',
                            color: voiceSupported ? '#34A853' : '#EA4335',
                            border: `1px solid ${voiceSupported ? 'rgba(52, 168, 83, 0.3)' : 'rgba(234, 67, 53, 0.3)'}`,
                          }}
                        >
                          {voiceSupported ? '利用可能' : '無効 / 未確認'}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
                        GPU / Irodori-TTS / Faster-Whisper エンジンの稼働判定
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleRecheckVoice}
                    disabled={voiceChecking}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border3)',
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: voiceChecking ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--panel)'; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: voiceChecking ? 'spin 1s linear infinite' : 'none' }}>
                      <path d="M23 4v6h-6"/>
                      <path d="M1 20v-6h6"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    {voiceChecking ? '判定中...' : '音声機能の再チェック'}
                  </button>
                </div>

                {voiceCheckResult && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: voiceCheckResult.isSupported ? 'rgba(52, 168, 83, 0.1)' : 'rgba(234, 67, 53, 0.1)',
                      border: `1px solid ${voiceCheckResult.isSupported ? 'rgba(52, 168, 83, 0.25)' : 'rgba(234, 67, 53, 0.25)'}`,
                      color: voiceCheckResult.isSupported ? '#34A853' : '#EA4335',
                      fontSize: '11.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      {voiceCheckResult.isSupported ? (
                        <polyline points="20 6 9 17 4 12"/>
                      ) : (
                        <circle cx="12" cy="12" r="10"/>
                      )}
                    </svg>
                    <span>{voiceCheckResult.message}</span>
                  </div>
                )}
              </div>

              {/* 2. End-to-End Voice AI Deep Diagnostics & Terminal Log Viewer [NEW] */}
              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: '14px',
                  background: 'var(--panel2)',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, rgba(66, 133, 244, 0.2), rgba(52, 168, 83, 0.2))',
                      color: '#4285F4',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                          リアルタイム音声会話・AI対話 エンドツーエンド診断テスト
                        </span>
                        {voiceDiagResult && (
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: voiceDiagResult.overall_pass ? 'rgba(52, 168, 83, 0.15)' : 'rgba(234, 67, 53, 0.15)',
                              color: voiceDiagResult.overall_pass ? '#34A853' : '#EA4335',
                              border: `1px solid ${voiceDiagResult.overall_pass ? 'rgba(52, 168, 83, 0.3)' : 'rgba(234, 67, 53, 0.3)'}`,
                            }}
                          >
                            {voiceDiagResult.overall_pass ? '✅ 総合判定: 合格 (PASS)' : '⚠️ 総合判定: 要確認'}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11.5px', color: 'var(--text3)' }}>
                        GPU VRAM常駐、Irodori-TTS音声合成、Faster-Whisper文字起こし、LLM対話推論を1クリックで実機検証します
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {voiceDiagLogs.length > 0 && (
                      <button
                        onClick={handleCopyDiagLogs}
                        style={{
                          padding: '7px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border3)',
                          background: 'var(--panel)',
                          color: 'var(--text2)',
                          fontSize: '11.5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        {copiedLogs ? 'コピー完了！' : 'ログをコピー'}
                      </button>
                    )}

                    <button
                      onClick={handleRunVoiceDiagnostics}
                      disabled={voiceDiagRunning}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: voiceDiagRunning ? 'var(--text3)' : 'linear-gradient(135deg, #4285F4 0%, #34A853 100%)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: voiceDiagRunning ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(66, 133, 244, 0.3)',
                        transition: 'opacity 0.2s ease',
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ animation: voiceDiagRunning ? 'spin 1s linear infinite' : 'none' }}
                      >
                        {voiceDiagRunning ? (
                          <>
                            <path d="M23 4v6h-6"/>
                            <path d="M1 20v-6h6"/>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                          </>
                        ) : (
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        )}
                      </svg>
                      {voiceDiagRunning ? '診断テスト実行中...' : '診断テストを開始'}
                    </button>
                  </div>
                </div>

                {/* Sub-component quick cards */}
                {voiceDiagResult && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '2px' }}>GPU / VRAM</div>
                      <div style={{ fontSize: '11.5px', fontWeight: 600, color: voiceDiagResult.gpu?.pass ? '#34A853' : '#EA4335' }}>
                        {voiceDiagResult.gpu?.pass ? `✅ ${voiceDiagResult.gpu.details?.vram_gb || 0} GB` : '❌ 未検出'}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '2px' }}>TTS 音声合成</div>
                      <div style={{ fontSize: '11.5px', fontWeight: 600, color: voiceDiagResult.tts?.pass ? '#34A853' : '#EA4335' }}>
                        {voiceDiagResult.tts?.pass ? `✅ ${voiceDiagResult.tts.details?.latency_ms || 0} ms` : '❌ オフライン'}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '2px' }}>STT 文字起こし</div>
                      <div style={{ fontSize: '11.5px', fontWeight: 600, color: voiceDiagResult.stt?.pass ? '#34A853' : '#EA4335' }}>
                        {voiceDiagResult.stt?.pass ? `✅ ${voiceDiagResult.stt.details?.latency_ms || 0} ms` : '❌ 失敗'}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '2px' }}>LLM 対話推論</div>
                      <div style={{ fontSize: '11.5px', fontWeight: 600, color: voiceDiagResult.llm?.pass ? '#34A853' : '#EA4335' }}>
                        {voiceDiagResult.llm?.pass ? `✅ ${voiceDiagResult.llm.details?.latency_ms || 0} ms` : '❌ エラー'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Terminal Log Viewer */}
                <div
                  style={{
                    background: '#0a0c10',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
                    fontSize: '11px',
                    lineHeight: '1.6',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)',
                  }}
                >
                  {voiceDiagLogs.length === 0 ? (
                    <span style={{ color: '#64748b', fontStyle: 'italic' }}>
                      「診断テストを開始」ボタンをクリックすると、ここに各ステップの詳細な実行ログとレイテンシが表示されます。
                    </span>
                  ) : (
                    voiceDiagLogs.map((line, idx) => {
                      let color = '#94a3b8';
                      if (line.includes('✅') || line.includes('🎉') || line.includes('合格')) color = '#4ade80';
                      else if (line.includes('❌') || line.includes('FAIL') || line.includes('エラー') || line.includes('失敗')) color = '#f87171';
                      else if (line.includes('⚠️') || line.includes('WARNING') || line.includes('要確認')) color = '#facc15';
                      else if (line.includes('🚀') || line.includes('📊') || line.includes('===') || line.includes('[')) color = '#60a5fa';

                      return (
                        <div key={idx} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {line}
                        </div>
                      );
                    })
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>

              {/* 2. Microphone Input Selection & VU Meter Test */}
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '14px',
                  background: 'var(--panel2)',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    マイク入力デバイス (Microphone)
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <select
                    value={selectedInputId}
                    onChange={(e) => {
                      setSelectedInputId(e.target.value);
                      localStorage.setItem('homespark_audio_input_device', e.target.value);
                      if (micTesting) {
                        stopMicTest();
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border3)',
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      fontSize: '12.5px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {inputDevices.length === 0 ? (
                      <option value="">既定のマイク (Default)</option>
                    ) : (
                      inputDevices.map((d, idx) => (
                        <option key={d.deviceId || idx} value={d.deviceId}>
                          {d.label || `マイク ${idx + 1} (${d.deviceId.slice(0, 8)})`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Mic Test Section with VU Meter */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                        マイク入力音量テスト
                      </span>
                      {micTesting && (
                        <span style={{ fontSize: '10px', color: '#34A853', fontWeight: 600, animation: 'pulse 1s infinite' }}>
                          ● テスト中 ({micVolume}%)
                        </span>
                      )}
                    </div>

                    <button
                      onClick={micTesting ? stopMicTest : startMicTest}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        background: micTesting ? '#EA4335' : '#4285F4',
                        color: '#fff',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        {micTesting ? (
                          <rect x="6" y="6" width="12" height="12" fill="currentColor"/>
                        ) : (
                          <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
                        )}
                      </svg>
                      {micTesting ? 'テスト停止' : 'マイクテスト開始'}
                    </button>
                  </div>

                  {/* Level meter bar */}
                  <div style={{ width: '100%', height: '8px', background: 'var(--border2)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${micVolume}%`,
                        height: '100%',
                        background: micVolume > 75 ? '#EA4335' : (micVolume > 40 ? '#34A853' : '#4285F4'),
                        transition: 'width 0.08s ease',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* 3. Speaker Output Selection & Chime Test */}
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '14px',
                  background: 'var(--panel2)',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#34A853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    スピーカー出力デバイス (Speaker / Headphone)
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <select
                    value={selectedOutputId}
                    onChange={(e) => {
                      setSelectedOutputId(e.target.value);
                      localStorage.setItem('homespark_audio_output_device', e.target.value);
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border3)',
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      fontSize: '12.5px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {outputDevices.length === 0 ? (
                      <option value="">既定のスピーカー (Default)</option>
                    ) : (
                      outputDevices.map((d, idx) => (
                        <option key={d.deviceId || idx} value={d.deviceId}>
                          {d.label || `スピーカー ${idx + 1} (${d.deviceId.slice(0, 8)})`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Speaker Test Section */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                      スピーカー音声テスト
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
                      選択中の出力デバイスからメロディチャイム（テスト音）を再生します。
                    </span>
                  </div>

                  <button
                    onClick={playSpeakerTest}
                    disabled={speakerTesting}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '6px',
                      border: '1px solid var(--border3)',
                      background: speakerTesting ? 'rgba(52, 168, 83, 0.15)' : 'var(--panel2)',
                      color: speakerTesting ? '#34A853' : 'var(--text)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: speakerTesting ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = speakerTesting ? 'rgba(52, 168, 83, 0.15)' : 'var(--panel2)'; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    </svg>
                    {speakerTesting ? '再生中...' : 'テスト音を再生 🔔'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STORAGE ENGINE */}
          {activeTab === 'storage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  長期記憶・データベース保存先
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
                  会話履歴、AI秘書の長期記憶（Skills・議事録）、デジタル名刺、外部メール設定の保存先を管理します。
                </p>
              </div>

              {isDesktop ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Option 1: SQLite (Local) */}
                  <div
                    onClick={() => handleModeChange('local')}
                    style={{
                      padding: '16px 18px',
                      borderRadius: '14px',
                      border: `1.5px solid ${storageMode === 'local' ? '#4285F4' : 'var(--border2)'}`,
                      background: storageMode === 'local' ? 'rgba(66, 133, 244, 0.08)' : 'var(--panel2)',
                      cursor: saving ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: `2px solid ${storageMode === 'local' ? '#4285F4' : 'var(--muted)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexShrink: 0,
                    }}>
                      {storageMode === 'local' && (
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#4285F4' }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                          ローカル保存 (SQLite)
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            color: '#34A853',
                            background: 'rgba(52, 168, 83, 0.12)',
                            border: '1px solid rgba(52, 168, 83, 0.25)',
                            padding: '2px 7px',
                            borderRadius: '12px',
                            fontWeight: 600,
                          }}
                        >
                          推奨・完全プライベート
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text2)', lineHeight: 1.6 }}>
                        すべての記憶と会話データをこのPC内のローカル SQLite データベース（<code>homespark_local.db</code>）に完全保存します。クラウドへ一切送信されず、高速・安全に動作します。
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Cloud PostgreSQL */}
                  <div
                    onClick={() => handleModeChange('cloud')}
                    style={{
                      padding: '16px 18px',
                      borderRadius: '14px',
                      border: `1.5px solid ${storageMode === 'cloud' ? '#4285F4' : 'var(--border2)'}`,
                      background: storageMode === 'cloud' ? 'rgba(66, 133, 244, 0.08)' : 'var(--panel2)',
                      cursor: saving ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: `2px solid ${storageMode === 'cloud' ? '#4285F4' : 'var(--muted)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexShrink: 0,
                    }}>
                      {storageMode === 'cloud' && (
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#4285F4' }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                          クラウド保存 (Neon PostgreSQL)
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text2)', lineHeight: 1.6 }}>
                        Neon クラウドデータベースに保存し、複数の端末やWebブラウザ版との間で記憶・会話履歴・名刺データを同期します。
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    background: 'var(--panel2)',
                    border: '1px solid var(--border2)',
                    fontSize: '12.5px',
                    color: 'var(--text2)',
                    lineHeight: 1.6,
                  }}
                >
                  Webブラウザ版ではクラウド保存（PostgreSQL）が適用されています。ローカルSQLite保存への切り替えはデスクトップアプリ版（HomeSpark GeMo）をご利用ください。
                </div>
              )}

              {/* Message Banner */}
              {storageMsg && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: storageMsg.type === 'success' ? 'rgba(52, 168, 83, 0.1)' : 'rgba(234, 67, 53, 0.1)',
                    border: `1px solid ${storageMsg.type === 'success' ? 'rgba(52, 168, 83, 0.25)' : 'rgba(234, 67, 53, 0.25)'}`,
                    color: storageMsg.type === 'success' ? '#34A853' : '#EA4335',
                    fontSize: '12px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                  <span>{storageMsg.text}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SYSTEM & UPDATES */}
          {activeTab === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  システム診断 & 自動アップデート
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
                  アプリの稼働バージョンおよびハードウェア・ランタイム診断情報を確認します。
                </p>
              </div>

              {/* Version & Update Card */}
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '14px',
                  background: 'var(--panel2)',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                        HomeSpark GeMo
                      </span>
                      <span style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '11px',
                        fontWeight: 600,
                        background: 'rgba(66, 133, 244, 0.1)',
                        color: '#4285F4',
                        border: '1px solid rgba(66, 133, 244, 0.25)',
                        padding: '1px 7px',
                        borderRadius: '4px',
                      }}>
                        v{currentVersion}
                      </span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: 'var(--text3)' }}>
                      Desktop Runtime (Electron + FastAPI + IrodoriTTS)
                    </span>
                  </div>

                  {isDesktop && (
                    <button
                      onClick={handleCheckUpdate}
                      disabled={checkingUpdate || updateStatus?.status === 'downloading'}
                      style={{
                        padding: '8px 16px',
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
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--panel)'; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: checkingUpdate ? 'spin 1s linear infinite' : 'none' }}>
                        <path d="M23 4v6h-6"/>
                        <path d="M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                      </svg>
                      {checkingUpdate ? '確認中...' : '更新を確認'}
                    </button>
                  )}
                </div>

                {/* Updater status feedback */}
                {updateStatus?.status === 'checking' && (
                  <div style={{ fontSize: '12px', color: '#4285F4', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    GitHub Releases から最新バージョンを確認しています...
                  </div>
                )}

                {updateStatus?.status === 'not-available' && (
                  <div style={{ fontSize: '12px', color: '#34A853', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    お使いのバージョン（v{currentVersion}）は最新です。
                  </div>
                )}

                {updateStatus?.status === 'dev-mode' && (
                  <div style={{ fontSize: '12px', color: '#F2994A', display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'rgba(242, 153, 74, 0.08)', border: '1px solid rgba(242, 153, 74, 0.25)', padding: '10px 14px', borderRadius: '8px' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F2994A" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span>開発・ローカルモードで稼働中です。</span>
                      <button
                        onClick={() => window.electronAPI?.openExternal('https://github.com/Ayato964/HomeSpark/releases/latest')}
                        style={{ background: 'transparent', border: 'none', color: '#4285F4', padding: 0, cursor: 'pointer', textAlign: 'left', fontSize: '11.5px', textDecoration: 'underline' }}
                      >
                        GitHub Releases から最新版インストーラを確認 ↗
                      </button>
                    </div>
                  </div>
                )}

                {updateStatus?.status === 'downloading' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text2)' }}>
                      <span>更新パッケージをダウンロード中...</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{updateStatus.percent || 0}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'var(--border2)', borderRadius: '3px', overflow: 'hidden' }}>
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
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'rgba(52, 168, 83, 0.1)',
                      border: '1px solid rgba(52, 168, 83, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#34A853" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span style={{ fontSize: '12.5px', color: '#34A853', fontWeight: 600 }}>
                        v{updateStatus.version || '最新版'} の更新準備が完了しました
                      </span>
                    </div>
                    <button
                      onClick={handleRestartUpdate}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#34A853',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      今すぐ再起動して更新
                    </button>
                  </div>
                )}
              </div>

              {/* Hardware Diagnostics Summary */}
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '14px',
                  background: 'var(--panel2)',
                  border: '1px solid var(--border2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  ハードウェア・ランタイム診断
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                  <div style={{ padding: '10px 12px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border3)' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '11px', marginBottom: '2px' }}>GPU デバイス</div>
                    <div style={{ color: 'var(--text)', fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {gpuInfo.gpu_name || (gpuInfo.has_gpu ? 'CUDA 有効' : '未検出 (CPU)')}
                    </div>
                  </div>

                  <div style={{ padding: '10px 12px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border3)' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '11px', marginBottom: '2px' }}>VRAM 容量</div>
                    <div style={{ color: 'var(--text)', fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {gpuInfo.vram_gb ? `${gpuInfo.vram_gb} GB` : (gpuInfo.has_gpu ? '検出済み' : 'N/A')}
                    </div>
                  </div>
                </div>
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
            onClick={() => {
              stopMicTest();
              onClose();
            }}
            style={{
              padding: '8px 22px',
              borderRadius: '8px',
              border: 'none',
              background: '#4285F4',
              color: '#fff',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
