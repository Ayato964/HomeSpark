"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChat } from "../hooks/useChat";
import { Sidebar } from "../components/Sidebar";
import { ChatArea } from "../components/ChatArea";
import { CanvasArea } from "../components/CanvasArea";
import { SparkDesk } from "../components/SparkDesk";
import { DigitalBusinessCardView } from "../components/spark/DigitalBusinessCardView";
import { ReleaseNotesModal } from "../components/ReleaseNotesModal";
import { ImapSettingsModal } from "../components/ImapSettingsModal";
import { SettingsModal } from "../components/SettingsModal";
import { OnboardingModal } from "../components/OnboardingModal";
import { isDesktopApp, getBackendBaseUrl } from "../utils/platform";
import { UserProfile } from "../types/chat";
import { ChatService } from "../services/ChatService";
import { getToken, loginQuick, getUser } from "../services/auth";
import { sendSubtitleToOverlay } from "../utils/electron";


// Re-expose the parser utility locally or import it. We can define it here.
function parseMarkdown(markdown: string) {
  const sections = [];
  const parts = markdown.split(/(?=^\s*## )/m);

  for (const part of parts) {
    const lines = part.trim().split('\n');
    if (lines.length === 0 || !lines[0].trim()) continue;

    const headerLine = lines[0].trim();
    if (!headerLine.startsWith('## ')) continue;

    const tagMatch = headerLine.match(/^##\s+([A-Z0-9]+(?:\.[0-9]+)?)\s*[\-—.:]?\s*(.*)$/i);
    let tag = '## Section';
    let label = '';

    if (tagMatch) {
      tag = `## ${tagMatch[1]}`;
      label = tagMatch[2].trim();
    } else {
      tag = '## Section';
      label = headerLine.replace(/^##\s*/, '').trim();
    }

    let headline = '';
    const bodyLines: string[] = [];
    let cta = '';
    let cta2 = '';

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (!headline) {
        headline = line;
      } else if (line.startsWith('>') || line.startsWith('&gt;')) {
        bodyLines.push(line.replace(/^>\s*/, ''));
      } else if (line.startsWith('[') && line.endsWith(']') && !line.includes('](')) {
        const ctas = line.match(/\[([^\]]+)\]/g);
        if (ctas && ctas.length > 0) {
          cta = ctas[0].replace(/[\[\]]/g, '');
          if (ctas.length > 1) {
            cta2 = ctas[1].replace(/[\[\]]/g, '');
          }
        }
      } else {
        bodyLines.push(line);
      }
    }

    const isJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(markdown);
    const bodyText = bodyLines.join(isJapanese ? '' : ' ');

    sections.push({
      tag,
      label: label.toUpperCase() || 'INFO',
      headline: headline || label || 'No Headline',
      body: bodyText || 'No content',
      cta: cta || undefined,
      cta2: cta2 || undefined
    });
  }

  if (sections.length === 0 && markdown.trim().length > 0) {
    sections.push({
      tag: '## DOC',
      label: 'DOCUMENT',
      headline: '生成されたドキュメント',
      body: markdown,
    });
  }

  return sections;
}

export default function Home() {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [modelId, setModelId] = useState<string>('spark-pro');
  const [isThemeChanging, setIsThemeChanging] = useState<boolean>(false);
  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState<boolean>(false);
  const [isImapSettingsOpen, setIsImapSettingsOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // User Profile States
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [isProfileSetupRequired, setIsProfileSetupRequired] = useState<boolean>(false);

  // Profile Editor Fields
  const [profName, setProfName] = useState<string>('');
  const [profCompany, setProfCompany] = useState<string>('');
  const [profRole, setProfRole] = useState<string>('');
  const [profEmail, setProfEmail] = useState<string>('');
  const [profPhone, setProfPhone] = useState<string>('');
  const [profAddress, setProfAddress] = useState<string>('');
  const [profPostalCode, setProfPostalCode] = useState<string>('');
  const [profHobbies, setProfHobbies] = useState<string>('');
  const [profNotes, setProfNotes] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);


  // Voice Call & Realtime Call States
  const [isVoiceCallActive, setIsVoiceCallActive] = useState<boolean>(false);
  const [realtimeCallEnabled, setRealtimeCallEnabled] = useState<boolean>(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const [isConvActive, setIsConvActive] = useState<boolean>(false); // is_conv flag
  const [subtitle, setSubtitle] = useState<{ text: string; sender: 'user' | 'ai' | 'status' } | null>(null);

  // Onboarding & Platform states
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [isVoiceCallSupported, setIsVoiceCallSupported] = useState<boolean>(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [backendError, setBackendError] = useState<string | null>(null);

  const isVoiceMutedRef = useRef<boolean>(false);
  const realtimeCallEnabledRef = useRef<boolean>(false);
  const isConvActiveRef = useRef<boolean>(false);
  const lastAssistantResponseRef = useRef<string>('');

  // Monitor backend health
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const checkHealth = async () => {
      try {
        const baseUrl = getBackendBaseUrl();
        const res = await fetch(`${baseUrl}/api/health`, { method: 'GET', cache: 'no-store' });
        if (res.ok) {
          setBackendStatus('connected');
          setBackendError(null);
        } else {
          setBackendStatus('error');
          setBackendError(`バックエンドサーバーが HTTP ${res.status} を返しました`);
        }
      } catch (err: any) {
        setBackendStatus('error');
        setBackendError(err?.message || 'バックエンドサーバー (8080) に接続できません');
      }
    };

    checkHealth();
    interval = setInterval(checkHealth, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const desktop = isDesktopApp();
    if (desktop) {
      const done = localStorage.getItem('homespark_gemo_onboarding_done');
      const voiceSupported = localStorage.getItem('homespark_voice_supported');
      if (done !== 'true') {
        setIsOnboardingOpen(true);
      } else {
        setIsVoiceCallSupported(voiceSupported === 'true');
      }
    } else {
      // Web browser: voice AI is disabled by default
      setIsVoiceCallSupported(false);
      setIsVoiceCallActive(false);
      setRealtimeCallEnabled(false);
    }
  }, []);

  useEffect(() => {
    isConvActiveRef.current = isConvActive;
  }, [isConvActive]);

  useEffect(() => {
    isVoiceMutedRef.current = isVoiceMuted;
  }, [isVoiceMuted]);

  useEffect(() => {
    realtimeCallEnabledRef.current = realtimeCallEnabled;
  }, [realtimeCallEnabled]);

  // Sync subtitle state with Electron floating desktop overlay HUD
  useEffect(() => {
    sendSubtitleToOverlay(subtitle);
  }, [subtitle]);

  // Load persisted realtime call preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('spark_realtime_call');
      if (saved === 'true') {
        setRealtimeCallEnabled(true);
        setIsVoiceCallActive(true);
      }
    }
  }, []);

  const handleToggleRealtimeCall = () => {
    setRealtimeCallEnabled(prev => {
      const next = !prev;
      setIsConvActive(false);
      isConvActiveRef.current = false;
      if (typeof window !== 'undefined') {
        localStorage.setItem('spark_realtime_call', String(next));
      }
      if (next) {
        setIsVoiceCallActive(true);
        setIsVoiceMuted(false);
        setSubtitle({ text: '🎙️ リアルタイム通話を開始しました（常時待機中）', sender: 'status' });
      } else {
        setIsVoiceCallActive(false);
        setIsVoiceMuted(false);
        setSubtitle(null);
      }
      return next;
    });
  };

  const accent = "#2DD4BF";
  const bloom = 0.6;
  const rootRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Initialize modular state & operations from custom hook
  const {
    appMode,
    convos,
    activeId,
    activeConvo,
    thinking,
    isGenerating,
    view,
    canvasTab,
    token,
    sparkSubView,
    previousSparkSubView,
    selectedPersonForCard,
    switchSparkSubView,
    navigateToPersonCard,
    returnToPreviousSparkSubView,
    switchAppMode,
    setView,
    setCanvasTab,
    createNewChat,
    selectConversation,
    deleteConversation,
    sendPrompt,
    user,
    googleLinked,
    googleConfigured,
    login,
    logout,
    connectGoogle,
    disconnectGoogle
  } = useChat(parseMarkdown);

  // Load and check User Profile on login
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      setIsProfileSetupRequired(false);
      return;
    }

    const checkProfile = async () => {
      try {
        const chatService = new ChatService();
        const profile = await chatService.getUserProfile(token);
        if (profile) {
          setUserProfile(profile);
          setIsProfileSetupRequired(false);
        } else {
          // No profile found, force setup modal view
          setIsProfileSetupRequired(true);
          // Set initial fields from Google account details if available
          setProfName(user.displayName || '');
          setProfEmail(user.email || '');
          setProfCompany('');
          setProfRole('');
          setProfPhone('');
          setProfAddress('');
          setProfPostalCode('');
          setProfHobbies('');
          setProfNotes('');
        }
      } catch (err) {
        console.error("Failed to fetch user profile:", err);
      }
    };

    checkProfile();
  }, [user, token]);

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profName.trim()) {
      alert("名前は必須項目です。");
      return;
    }

    setSavingProfile(true);
    try {
      const chatService = new ChatService();
      const updated = await chatService.updateUserProfile(token, {
        name: profName,
        company: profCompany,
        role: profRole,
        email: profEmail,
        phone: profPhone,
        address: profAddress,
        postal_code: profPostalCode,
        hobbies: profHobbies,
        notes: profNotes
      });
      setUserProfile(updated);
      setIsProfileSetupRequired(false);
      setProfileModalOpen(false);
    } catch (err) {
      console.error("Failed to save user profile:", err);
      alert("プロフィールの保存に失敗しました。");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleOpenProfileEditor = () => {
    if (userProfile) {
      setProfName(userProfile.name || '');
      setProfCompany(userProfile.company || '');
      setProfRole(userProfile.role || '');
      setProfEmail(userProfile.email || '');
      setProfPhone(userProfile.phone || '');
      setProfAddress(userProfile.address || '');
      setProfPostalCode(userProfile.postal_code || '');
      setProfHobbies(userProfile.hobbies || '');
      setProfNotes(userProfile.notes || '');
    } else if (user) {
      setProfName(user.displayName || '');
      setProfEmail(user.email || '');
    }
    setProfileModalOpen(true);
  };


  // Types & Refs for Voice Call control
  interface VoiceSegment {
    index: number;
    text: string;
    blob: Blob | null;
    status: 'pending' | 'ready' | 'played';
  }

  const recognitionRef = useRef<any>(null);
  const voiceSegmentsRef = useRef<Map<number, VoiceSegment>>(new Map());
  const nextPlayIndexRef = useRef<number>(0);
  const currentSegmentCountRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const isVoiceCallActiveRef = useRef<boolean>(false);
  const isVoiceProcessingRef = useRef<boolean>(false);
  const voiceHistoryRef = useRef<any[]>([]);
  const activeVoiceAbortControllerRef = useRef<AbortController | null>(null);
  const hasSpokenToolAcknowledgeRef = useRef<boolean>(false);
  const lastVoiceActivityTimestampRef = useRef<number>(Date.now());
  const isSummarizingMemoryRef = useRef<boolean>(false);
  const speechAccumulatorRef = useRef<string>('');
  const speechSilenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-summarize subagent execution on 30-minute inactivity
  const triggerAutoSummarizeMinutes = async () => {
    if (isSummarizingMemoryRef.current || voiceHistoryRef.current.length === 0) {
      return;
    }
    isSummarizingMemoryRef.current = true;
    const historyToSummarize = [...voiceHistoryRef.current];
    console.log(`[Auto-Summarize] 30m idle elapsed. Triggering conversation summary subagent for ${historyToSummarize.length} messages...`);
    try {
      const chatService = new ChatService();
      const res = await chatService.summarizeVoiceMemory(token, historyToSummarize);
      console.log("[Auto-Summarize] Successfully generated minutes and archived old skills into database:", res);
      // Clean up ephemeral raw conversation history to avoid token limits
      voiceHistoryRef.current = [];
    } catch (e) {
      console.error("[Auto-Summarize] Failed to summarize voice memory:", e);
    } finally {
      isSummarizingMemoryRef.current = false;
    }
  };

  // Idle timer effect: checks for 20s conversation reset and 30m silence auto-summarize
  useEffect(() => {
    const CONV_TIMEOUT_MS = 20 * 1000; // 20 seconds
    const SUMMARY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastVoiceActivityTimestampRef.current;

      // 1. Auto-reset active conversation state if user stops speaking for 20s
      if (
        isConvActiveRef.current &&
        elapsed >= CONV_TIMEOUT_MS &&
        !isVoiceProcessingRef.current &&
        !isPlayingRef.current
      ) {
        console.log("[Classifier] Inactivity timeout (20s). Safely resetting is_conv = false");
        setIsConvActive(false);
        isConvActiveRef.current = false;
      }

      // 2. Auto-summarize minutes if 30m elapsed
      if (
        elapsed >= SUMMARY_TIMEOUT_MS &&
        voiceHistoryRef.current.length > 0 &&
        !isVoiceProcessingRef.current &&
        !isPlayingRef.current
      ) {
        triggerAutoSummarizeMinutes();
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, [token]);

  // Smooth Fade-out & Stop Audio (Barge-in support)
  const fadeOutAndStopVoice = (immediately: boolean = false) => {
    // 1. Abort any ongoing LLM generation immediately
    if (activeVoiceAbortControllerRef.current) {
      try {
        activeVoiceAbortControllerRef.current.abort();
      } catch (_) {}
      activeVoiceAbortControllerRef.current = null;
    }

    // 2. Clear all pending queued voice segments
    voiceSegmentsRef.current.clear();
    nextPlayIndexRef.current = 0;
    currentSegmentCountRef.current = 0;
    isVoiceProcessingRef.current = false;

    const currentAudio = audioRef.current;
    if (!currentAudio) {
      isPlayingRef.current = false;
      return;
    }

    if (immediately) {
      currentAudio.pause();
      currentAudio.src = "";
      audioRef.current = null;
      isPlayingRef.current = false;
      return;
    }

    // 3. Smooth Volume Fade-out (~140ms)
    const startVolume = currentAudio.volume || 1.0;
    const fadeSteps = 7;
    const stepIntervalMs = 20; // 20ms * 7 = 140ms
    let currentStep = 0;

    const fadeTimer = setInterval(() => {
      currentStep++;
      if (!audioRef.current || audioRef.current !== currentAudio) {
        clearInterval(fadeTimer);
        return;
      }

      const nextVol = Math.max(0, startVolume * (1 - currentStep / fadeSteps));
      currentAudio.volume = nextVol;

      if (currentStep >= fadeSteps || nextVol <= 0) {
        clearInterval(fadeTimer);
        currentAudio.pause();
        currentAudio.src = "";
        if (audioRef.current === currentAudio) {
          audioRef.current = null;
        }
        isPlayingRef.current = false;
      }
    }, stepIntervalMs);
  };

  // Sequential Ordered Voice Playback
  const playNextOrderedVoiceSegment = () => {
    if (isPlayingRef.current) return;

    const nextIdx = nextPlayIndexRef.current;
    const segment = voiceSegmentsRef.current.get(nextIdx);

    // If next segment is still fetching, wait (guarantees strict 100% in-order playback)
    if (!segment || segment.status === 'pending') {
      return;
    }

    if (segment.status === 'played') {
      nextPlayIndexRef.current++;
      playNextOrderedVoiceSegment();
      return;
    }

    if (segment.status === 'ready' && segment.blob) {
      isPlayingRef.current = true;
      segment.status = 'played';
      nextPlayIndexRef.current++;

      setSubtitle({ text: `AI: ${segment.text}`, sender: 'ai' });

      const url = URL.createObjectURL(segment.blob);
      const audio = new Audio(url);
      audio.volume = 1.0;
      audioRef.current = audio;

      const onSegmentFinished = () => {
        URL.revokeObjectURL(url);
        isPlayingRef.current = false;
        audioRef.current = null;

        // Check if there are further segments to play
        const hasNext = voiceSegmentsRef.current.has(nextPlayIndexRef.current);
        if (hasNext) {
          playNextOrderedVoiceSegment();
        } else if (!isVoiceProcessingRef.current) {
          // All generated voice segments have completed playback
          setSubtitle({ text: 'お話しください...', sender: 'status' });
          if (isVoiceCallActiveRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.error("Failed to restart speech recognition:", e);
            }
          }
        }
      };

      audio.onended = onSegmentFinished;
      audio.onerror = onSegmentFinished;
      audio.play().catch(e => {
        console.error("Playback error:", e);
        onSegmentFinished();
      });
    }
  };

  // Pure Emoji Regex (strictly excludes ASCII digits 0-9, #, and *)
  const EMOJI_REGEX = /(?:(?!\d|#|\*)[\p{Extended_Pictographic}\p{Emoji_Presentation}])/gu;
  const LEADING_EMOJI_REGEX = /^(?:(?!\d|#|\*)[\p{Extended_Pictographic}\p{Emoji_Presentation}])+/u;
  const TRAILING_EMOJI_REGEX = /(?:(?!\d|#|\*)[\p{Extended_Pictographic}\p{Emoji_Presentation}])+$/u;

  // Queue and fetch TTS with indexed sequence number
  const queueVoiceSegment = (text: string) => {
    const rawText = text.replace(/[*`#]/g, '').trim();
    if (!rawText) return;

    // Sanitize text for TTS synthesis (strip only emojis, strictly preserving numbers and text)
    const ttsText = rawText.replace(EMOJI_REGEX, '').trim();
    if (!ttsText) return;

    const index = currentSegmentCountRef.current++;
    const segment: VoiceSegment = {
      index,
      text: rawText, // Keep emojis in display text for subtitle
      blob: null,
      status: 'pending'
    };
    voiceSegmentsRef.current.set(index, segment);

    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    fetch(`${backendUrl}/api/tts?text=${encodeURIComponent(ttsText)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`TTS server returned ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const target = voiceSegmentsRef.current.get(index);
        if (target) {
          target.blob = blob;
          target.status = 'ready';
          playNextOrderedVoiceSegment();
        }
      })
      .catch((err) => {
        console.error(`Failed to fetch TTS for segment ${index} ("${rawText}"):`, err);
        const target = voiceSegmentsRef.current.get(index);
        if (target) {
          target.status = 'played'; // Skip errored segment so playback does not stall
          playNextOrderedVoiceSegment();
        }
      });
  };

  // Tool display name mapper for friendly voice status subtitles
  const getToolDisplayName = (name: string): string => {
    const map: Record<string, string> = {
      'get_calendar_events': 'カレンダー予定の確認',
      'create_calendar_event': 'カレンダー予定の作成',
      'list_messages': 'Gmailメールの確認',
      'search_messages': 'Gmailメールの検索',
      'send_message': 'Gmailメールの送信',
      'get_digital_business_cards': 'デジタル名刺の取得',
      'search_digital_business_cards': '名刺・顧客情報の検索',
      'create_digital_business_card': 'デジタル名刺の登録',
      'delete_digital_business_card': 'デジタル名刺の削除',
      'get_weather': '天気予報の確認',
      'search_past_memories': '過去の会話記録・記憶の照会',
      'search_web': 'インターネット検索',
      'list_external_emails': '外部メール(会社メール等)の確認',
      'send_external_email': '外部メール(会社メール等)の送信',
    };
    return map[name] || name;
  };

  // Randomized preset acknowledgment phrases spoken immediately when a tool is called (Persona: Jenny)
  const getRandomToolAcknowledgePhrase = (toolName: string): string => {
    const calendarPhrases = [
      '😆はいっ！カレンダーを確認しますねっ♪',
      '😊お任せくださいっ！予定を見てみますね！',
      '🤔少々お待ちくださいね、スケジュールをお調べしますっ！',
    ];
    const mailPhrases = [
      '😆了解ですっ！メールを検索しますね♪',
      '😊はいっ！届いているメールを確認してみますね！',
      '🤔少々お待ちくださいね、メールボックスをチェックしますっ！',
    ];
    const externalMailPhrases = [
      '😆了解ですっ！会社・外部メールを確認しますね♪',
      '😊はいっ！外部メールボックスをチェックしてみますね！',
      '🤔少々お待ちくださいね、外部メールを照会しますっ！',
    ];
    const peoplePhrases = [
      '😆かしこまりましたっ！名刺の情報を探してみますね♪',
      '😊はいっ！顧客データを照会しますね！',
      '🤔名刺データを確認しますねっ！',
    ];
    const weatherPhrases = [
      '😆はいっ！お天気を調べてみますねっ♪',
      '😊お任せくださいっ！天気予報を確認しますね！',
      '🤔少々お待ちくださいね、最新の気象情報をチェックしますっ！',
    ];
    const memoryPhrases = [
      '😆はいっ！過去の記憶を調べてみますねっ♪',
      '😊お任せくださいっ！以前お話しした記録を探しますね！',
      '🤔少々お待ちくださいね、過去の会話ログを検索しますっ！',
    ];
    const webSearchPhrases = [
      '😆はいっ！ネットでお調べしますねっ♪',
      '😊お任せくださいっ！ウェブで最新情報を検索しますね！',
      '🤔少々お待ちくださいね、インターネットで検索してきますっ！',
    ];
    const genericPhrases = [
      '😆はいっ！確認してみますねっ♪',
      '😊わかりましたっ！少々お待ちくださいね！',
      '🤔ええとね、今お調べしていますよっ♪',
    ];

    let candidates = genericPhrases;
    if (toolName.includes('external_email') || toolName.includes('imap')) {
      candidates = externalMailPhrases;
    } else if (toolName.includes('web') || toolName.includes('search_web') || toolName.includes('internet')) {
      candidates = webSearchPhrases;
    } else if (toolName.includes('memory') || toolName.includes('skill') || toolName.includes('past')) {
      candidates = memoryPhrases;
    } else if (toolName.includes('weather') || toolName.includes('forecast') || toolName.includes('tenki')) {
      candidates = weatherPhrases;
    } else if (toolName.includes('calendar')) {
      candidates = calendarPhrases;
    } else if (toolName.includes('message') || toolName.includes('mail') || toolName.includes('gmail')) {
      candidates = mailPhrases;
    } else if (toolName.includes('business_card') || toolName.includes('people') || toolName.includes('card')) {
      candidates = peoplePhrases;
    }

    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
  };

  // Strip duplicate opening acknowledgment phrases from post-tool AI responses
  const stripDuplicateLeadingAcknowledge = (text: string): string => {
    const ACK_REGEX = /^(?:(?!\d|#|\*)[\p{Extended_Pictographic}\p{Emoji_Presentation}])*\s*(?:はい[！!、,。.]*|わかりました[！!、,。.]*|了解です[！!、,。.]*|承知しました[！!、,。.]*|かしこまりました[！!、,。.]*|確認しました[！!、,。.]*|お待たせしました[！!、,。.]*)+\s*/u;
    return text.replace(ACK_REGEX, '').trim();
  };

  // Helper to ensure each voice segment always starts with a facial expression emoji and NEVER ends with one
  const formatVoiceSentence = (raw: string): string => {
    let text = raw.replace(/[*`#]/g, '').trim();
    if (!text || text === 'thought') return '';

    // Extract actual speech text (excluding emojis, preserving all digits and words)
    const speechContent = text.replace(EMOJI_REGEX, '').trim();
    // If segment contains only emojis/symbols with no spoken content, discard it
    if (!speechContent) return '';

    // Detect any leading or trailing emojis in the raw text
    const leadingEmojiMatch = text.match(LEADING_EMOJI_REGEX);
    const trailingEmojiMatch = text.match(TRAILING_EMOJI_REGEX);

    let emoji = '';
    if (leadingEmojiMatch) {
      emoji = leadingEmojiMatch[0];
    } else if (trailingEmojiMatch) {
      emoji = trailingEmojiMatch[0];
    } else {
      // Infer natural expression from the phrase content
      if (/^(はい|ええ|わかりました|了解|承知|もちろん|任せて|こんにちは|おはよう|こんばんは)/.test(speechContent)) {
        emoji = '😆';
      } else if (/(\?|？|でしょうか|ですか|どう|確認)/.test(speechContent)) {
        emoji = '🤔';
      } else if (/(すみません|申し訳|失敗|エラー|できません|未連携)/.test(speechContent)) {
        emoji = '😅';
      } else if (/(完了|登録|送信|作成|できました|設定)/.test(speechContent)) {
        emoji = '✨';
      } else {
        emoji = '😊';
      }
    }

    // Always place the emoji strictly at the beginning and keep the body clean
    return `${emoji}${speechContent}`;
  };

  // Helper to accurately extract completed sentences in 2-sentence paired chunks for natural speech flow
  const extractSentences = (buffer: string, isFinal: boolean = false): { sentences: string[]; remaining: string } => {
    const PUNCTUATIONS = ["。", "！", "？", "!", "?", "…", "\n"];
    let sentenceBuffer = buffer;
    const singleSentences: string[] = [];

    while (PUNCTUATIONS.some(p => sentenceBuffer.includes(p))) {
      let earliestIdx = sentenceBuffer.length;
      let punctLen = 0;
      for (const p of PUNCTUATIONS) {
        const idx = sentenceBuffer.indexOf(p);
        if (idx !== -1 && idx < earliestIdx) {
          earliestIdx = idx;
          punctLen = p.length;
        }
      }

      const endIdx = earliestIdx + punctLen;
      const rawSentence = sentenceBuffer.slice(0, endIdx).trim();
      sentenceBuffer = sentenceBuffer.slice(endIdx).trimStart();

      const formatted = formatVoiceSentence(rawSentence);
      if (formatted) {
        singleSentences.push(formatted);
      }
    }

    // Pair up sentences (2 sentences per chunk)
    const pairedChunks: string[] = [];
    while (singleSentences.length >= 2) {
      const s1 = singleSentences.shift()!;
      const s2 = singleSentences.shift()!;
      pairedChunks.push(`${s1} ${s2}`);
    }

    // If finalized (turn complete), flush any single remaining sentence
    if (isFinal) {
      while (singleSentences.length > 0) {
        pairedChunks.push(singleSentences.shift()!);
      }
      if (sentenceBuffer.trim()) {
        const leftover = formatVoiceSentence(sentenceBuffer.trim());
        if (leftover) {
          pairedChunks.push(leftover);
        }
        sentenceBuffer = '';
      }
    } else if (singleSentences.length > 0) {
      // Put back the un-paired single sentence to remaining buffer so it pairs with the next sentence
      sentenceBuffer = (singleSentences.shift()! + ' ' + sentenceBuffer).trim();
    }

    return { sentences: pairedChunks, remaining: sentenceBuffer };
  };

  // Handle direct voice input with continuous context memory and tool calling support
  const handleVoiceInput = async (userSpeech: string) => {
    if (!userSpeech.trim()) return;

    // Update voice activity timestamp for idle detection
    lastVoiceActivityTimestampRef.current = Date.now();

    // Reset voice queue states and abort any prior ongoing request
    fadeOutAndStopVoice(true); // Stop any previous playback immediately for the new turn
    isVoiceProcessingRef.current = true;
    hasSpokenToolAcknowledgeRef.current = false;

    // Create fresh AbortController for this turn
    const abortController = new AbortController();
    activeVoiceAbortControllerRef.current = abortController;

    setSubtitle({ text: `あなた: ${userSpeech}`, sender: 'user' });

    let sentenceBuffer = "";
    let fullAssistantResponse = "";

    try {
      const chatService = new ChatService();
      const localToken = typeof window !== 'undefined' ? window.localStorage.getItem('spark_session') : null;
      const freshToken = getToken() || token || localToken;
      console.log("[handleVoiceInput] Auth token present:", !!freshToken);

      // Pass voice conversation history for multi-turn conversational context
      const historyPayload = voiceHistoryRef.current.map(h => ({
        role: h.role,
        content: h.content
      }));

      await chatService.streamChat(
        userSpeech,
        null, // No chat_id needed for ephemeral voice session
        freshToken,
        (event) => {
          if (abortController.signal.aborted) return;

          if (event.type === 'tool_start') {
            const rawToolName = event.name || '';
            // Only speak the preset acknowledgment ONCE per turn to prevent double voice / spamming
            if (!hasSpokenToolAcknowledgeRef.current) {
              hasSpokenToolAcknowledgeRef.current = true;
              const phrase = getRandomToolAcknowledgePhrase(rawToolName);
              queueVoiceSegment(phrase);
            }
          } else if (event.type === 'token' && event.content) {
            sentenceBuffer += event.content;
            fullAssistantResponse += event.content;

            // Remove any leading thought artifacts if present
            if (sentenceBuffer.startsWith("thought\n")) {
              sentenceBuffer = sentenceBuffer.slice("thought\n".length).trimStart();
            }

            // If a tool acknowledgment was spoken, strip duplicate leading "はい！" or "承知しました" from AI's post-tool response
            if (hasSpokenToolAcknowledgeRef.current) {
              const stripped = stripDuplicateLeadingAcknowledge(sentenceBuffer);
              if (stripped !== sentenceBuffer) {
                sentenceBuffer = stripped;
                hasSpokenToolAcknowledgeRef.current = false; // Successfully stripped leading duplicate
              }
            }

            const { sentences, remaining } = extractSentences(sentenceBuffer, false);
            for (const s of sentences) {
              queueVoiceSegment(s);
            }
            sentenceBuffer = remaining;
          } else if (event.type === 'done') {
            // Process and flush all remaining text with isFinal = true
            const { sentences } = extractSentences(sentenceBuffer, true);
            for (const s of sentences) {
              queueVoiceSegment(s);
            }
            sentenceBuffer = "";
            isVoiceProcessingRef.current = false;

            // Update in-memory multi-turn voice context history
            voiceHistoryRef.current.push({ role: 'user', content: userSpeech });
            voiceHistoryRef.current.push({ role: 'assistant', content: fullAssistantResponse });
            lastVoiceActivityTimestampRef.current = Date.now();
            lastAssistantResponseRef.current = fullAssistantResponse;
            // Cap in-memory history to last 10 turns (20 messages)
            if (voiceHistoryRef.current.length > 20) {
              voiceHistoryRef.current = voiceHistoryRef.current.slice(-20);
            }

            // Background async conversation end classification (zero user latency)
            if (isConvActiveRef.current && fullAssistantResponse.trim()) {
              const respToClassify = fullAssistantResponse.trim();
              (async () => {
                const chatService = new ChatService();
                const localToken = typeof window !== 'undefined' ? window.localStorage.getItem('spark_session') : null;
                const freshToken = getToken() || token || localToken;
                const isEnded = await chatService.checkIsConversationEnded(freshToken, respToClassify);
                console.log("[Classifier] Conversation end classification result:", isEnded);
                if (isEnded) {
                  console.log("[Classifier] Conversation topic concluded. Resetting is_conv = false");
                  setIsConvActive(false);
                  isConvActiveRef.current = false;
                }
              })();
            }

            // Check if ready segments can play immediately
            playNextOrderedVoiceSegment();
          } else if (event.type === 'error') {
            if (!abortController.signal.aborted) {
              console.error("Voice chat stream error:", event.error);
              isVoiceProcessingRef.current = false;
              setSubtitle({ text: `エラー: ${event.error}`, sender: 'status' });
            }
          }
        },
        {
          isVoice: true,
          saveToHistory: false, // Strictly ephemeral (do not save to chat history/DB)
          history: historyPayload,
          signal: abortController.signal
        }
      );
    } catch (err: any) {
      if (err.name !== 'AbortError' && !abortController.signal.aborted) {
        console.error("Failed voice conversation stream:", err);
        isVoiceProcessingRef.current = false;
        setSubtitle({ text: '通信エラーが発生しました', sender: 'status' });
      }
    }
  };

  // Initialize Speech Recognition with continuous listening & barge-in support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.lang = 'ja-JP';
        rec.continuous = true;
        rec.interimResults = true;

        const flushAccumulatedSpeech = () => {
          if (speechSilenceTimerRef.current) {
            clearTimeout(speechSilenceTimerRef.current);
            speechSilenceTimerRef.current = null;
          }

          const fullSpeech = speechAccumulatorRef.current.trim();
          speechAccumulatorRef.current = '';

          if (!fullSpeech) return;

          console.log("[SpeechRecognition] Finalized speech turn (accumulated):", fullSpeech);

          if (isConvActiveRef.current) {
            // Already in conversation: send immediately to AI
            handleVoiceInput(fullSpeech);
          } else {
            // Not in conversation: verify if addressing AI
            setSubtitle({ text: `あなた: ${fullSpeech}`, sender: 'user' });

            (async () => {
              const chatService = new ChatService();
              const localToken = typeof window !== 'undefined' ? window.localStorage.getItem('spark_session') : null;
              const freshToken = getToken() || token || localToken;

              const isAddressing = await chatService.checkIsAddressingAI(
                freshToken,
                fullSpeech,
                lastAssistantResponseRef.current
              );

              if (isAddressing) {
                console.log("[Classifier] User speech addresses AI! Setting is_conv = true");
                setIsConvActive(true);
                isConvActiveRef.current = true;
                handleVoiceInput(fullSpeech);
              } else {
                console.log("[Classifier] Speech ignored (not addressing AI):", fullSpeech);
                setTimeout(() => {
                  setSubtitle(prev => (prev && prev.text.includes(fullSpeech) ? null : prev));
                }, 1500);
              }
            })();
          }
        };

        rec.onstart = () => {
          if (!isPlayingRef.current && !isVoiceProcessingRef.current && !speechAccumulatorRef.current) {
            setSubtitle({ text: 'お話しください...', sender: 'status' });
          }
        };

        rec.onresult = (event: any) => {
          if (isVoiceMutedRef.current) {
            return;
          }

          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              speechAccumulatorRef.current += (speechAccumulatorRef.current ? ' ' : '') + transcript.trim();
            } else {
              interimTranscript += transcript;
            }
          }

          const currentLiveSpeech = (speechAccumulatorRef.current + (interimTranscript ? ' ' + interimTranscript : '')).trim();

          // Barge-in trigger: if AI is speaking/processing and user starts speaking, fade out and stop AI immediately
          if (currentLiveSpeech && (isPlayingRef.current || isVoiceProcessingRef.current)) {
            console.log("[Barge-in] User started talking while AI is active. Fading out AI voice...");
            fadeOutAndStopVoice(false); // Smooth fade-out in 140ms
          }

          if (currentLiveSpeech) {
            setSubtitle({ text: `あなた: ${currentLiveSpeech}`, sender: 'user' });

            // Debounce silence timer: wait 850ms of silence before finalizing and sending the turn
            if (speechSilenceTimerRef.current) {
              clearTimeout(speechSilenceTimerRef.current);
            }
            speechSilenceTimerRef.current = setTimeout(() => {
              flushAccumulatedSpeech();
            }, 850);
          }
        };

        rec.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            setSubtitle({ text: `マイク: ${event.error}`, sender: 'status' });
          }
        };

        rec.onend = () => {
          // Keep microphone continuously listening as long as voice call is active
          if (isVoiceCallActiveRef.current) {
            try {
              recognitionRef.current?.start();
            } catch (e) {
              // Ignore if already active
            }
          }
        };

        recognitionRef.current = rec;
      }
    }
  }, []);

  // Voice Call Active Switch
  useEffect(() => {
    isVoiceCallActiveRef.current = isVoiceCallActive;

    if (isVoiceCallActive) {
      voiceSegmentsRef.current.clear();
      nextPlayIndexRef.current = 0;
      currentSegmentCountRef.current = 0;
      isPlayingRef.current = false;
      isVoiceProcessingRef.current = false;

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error(e);
        }
      } else {
        alert("お使いのブラウザは音声認識に対応していません。Chrome等の主要なブラウザをご利用ください。");
        setIsVoiceCallActive(false);
      }
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      voiceSegmentsRef.current.clear();
      voiceHistoryRef.current = [];
      nextPlayIndexRef.current = 0;
      currentSegmentCountRef.current = 0;
      isPlayingRef.current = false;
      isVoiceProcessingRef.current = false;
      setSubtitle(null);
    }
  }, [isVoiceCallActive]);

  // Apply vars effect & HTML document level data-theme attribute
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty('--accent', accent);
    el.style.setProperty('--bloom', String(bloom));
    document.documentElement.setAttribute('data-theme', theme);

    // Skip the transition effect on initial render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    setIsThemeChanging(true);
    const timer = setTimeout(() => {
      setIsThemeChanging(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [theme, accent, bloom]);

  // Close user menu on clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);
  // Render full screen setup for first-time profile creation
  const renderProfileSetupScreen = () => {
    return (
      <main style={{
        position: 'relative',
        zIndex: 1,
        flex: 1,
        minWidth: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        overflowY: 'auto'
      }}>
        {/* Top Header to preserve layout & format */}
        <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', height: '54px', padding: '0 22px', borderBottom: '1px solid var(--border)', background: 'var(--topbar)', backdropFilter: 'blur(10px)' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>HomeSpark GeMo - 初期設定</span>
        </div>

        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          background: 'radial-gradient(circle at 80% 20%, rgba(45, 212, 191, 0.08) 0%, transparent 50%)'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '680px',
            padding: '40px',
            background: 'var(--panel)',
            border: '1px solid var(--border2)',
            borderRadius: '24px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '28px',
            animation: 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, var(--accent) 0%, #14b8a6 100%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px rgba(45, 212, 191, 0.3)',
                fontSize: '28px',
                color: '#fff',
                marginBottom: '16px'
              }}>
                👤
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', margin: '0 0 8px 0' }}>
                プロフィールを設定しましょう
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text2)', margin: 0 }}>
                初回ログインありがとうございます。デジタル名刺として機能する、あなたの基本情報を入力してください。
              </p>
            </div>

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Form Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>名前 <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    placeholder="山田 太郎"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>会社名</label>
                  <input
                    type="text"
                    value={profCompany}
                    onChange={(e) => setProfCompany(e.target.value)}
                    placeholder="株式会社スパーク証券"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>役職・部署</label>
                  <input
                    type="text"
                    value={profRole}
                    onChange={(e) => setProfRole(e.target.value)}
                    placeholder="営業部 主任"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>メールアドレス</label>
                  <input
                    type="email"
                    value={profEmail}
                    onChange={(e) => setProfEmail(e.target.value)}
                    placeholder="yamada@example.com"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>電話番号</label>
                  <input
                    type="text"
                    value={profPhone}
                    onChange={(e) => setProfPhone(e.target.value)}
                    placeholder="090-0000-0000"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>郵便番号</label>
                  <input
                    type="text"
                    value={profPostalCode}
                    onChange={(e) => setProfPostalCode(e.target.value)}
                    placeholder="100-0001"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>住所</label>
                <input
                  type="text"
                  value={profAddress}
                  onChange={(e) => setProfAddress(e.target.value)}
                  placeholder="東京都千代田区千代田1-1"
                  style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>趣味・関心</label>
                <input
                  type="text"
                  value={profHobbies}
                  onChange={(e) => setProfHobbies(e.target.value)}
                  placeholder="ゴルフ、投資、サウナ"
                  style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>メモ・自己紹介</label>
                <textarea
                  value={profNotes}
                  onChange={(e) => setProfNotes(e.target.value)}
                  placeholder="よろしくお願いします。主に大手製造業への資産運用コンサルティングを担当しています。"
                  rows={3}
                  style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  padding: '14px 20px',
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(45, 212, 191, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'opacity 0.2s, transform 0.1s'
                }}
              >
                {savingProfile ? (
                  <>
                    <span className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }}></span>
                    保存中...
                  </>
                ) : (
                  "保存してSparkを始める"
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  };

  // Render editing modal for existing profile
  const renderProfileModal = () => {
    if (!profileModalOpen) return null;
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '640px',
          background: 'var(--panel)',
          border: '1px solid var(--border2)',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 32px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>プロフィールを編集</h3>
            <button
              onClick={() => setProfileModalOpen(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: '20px', padding: '4px' }}
            >
              ×
            </button>
          </div>

          {/* Scrollable Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Form Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>名前 <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    required
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    placeholder="山田 太郎"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>会社名</label>
                  <input
                    type="text"
                    value={profCompany}
                    onChange={(e) => setProfCompany(e.target.value)}
                    placeholder="株式会社スパーク証券"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>役職・部署</label>
                  <input
                    type="text"
                    value={profRole}
                    onChange={(e) => setProfRole(e.target.value)}
                    placeholder="営業部 主任"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>メールアドレス</label>
                  <input
                    type="email"
                    value={profEmail}
                    onChange={(e) => setProfEmail(e.target.value)}
                    placeholder="yamada@example.com"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>電話番号</label>
                  <input
                    type="text"
                    value={profPhone}
                    onChange={(e) => setProfPhone(e.target.value)}
                    placeholder="090-0000-0000"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>郵便番号</label>
                  <input
                    type="text"
                    value={profPostalCode}
                    onChange={(e) => setProfPostalCode(e.target.value)}
                    placeholder="100-0001"
                    style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>住所</label>
                <input
                  type="text"
                  value={profAddress}
                  onChange={(e) => setProfAddress(e.target.value)}
                  placeholder="東京都千代田区千代田1-1"
                  style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>趣味・関心</label>
                <input
                  type="text"
                  value={profHobbies}
                  onChange={(e) => setProfHobbies(e.target.value)}
                  placeholder="ゴルフ、投資、サウナ"
                  style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>メモ・自己紹介</label>
                <textarea
                  value={profNotes}
                  onChange={(e) => setProfNotes(e.target.value)}
                  placeholder="自己紹介を入力してください"
                  rows={3}
                  style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border3)', borderRadius: '10px', color: 'var(--text)', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  style={{ padding: '10px 20px', border: '1px solid var(--border3)', background: 'transparent', color: 'var(--text)', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  style={{
                    padding: '10px 24px',
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(45, 212, 191, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {savingProfile ? '保存中...' : '変更を保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

  const isEmpty = activeConvo.messages.length === 0;
  const hasMessages = activeConvo.messages.length > 0;
  const canvasOk = !!activeConvo.doc;
  const showCanvas = view === 'split' && canvasOk;

  const docFile = activeConvo.doc ? activeConvo.doc.file : '';
  const source = activeConvo.doc ? activeConvo.doc.source : '';
  const sections = activeConvo.doc ? activeConvo.doc.sections : [];

  return (
    <div
      ref={rootRef}
      data-theme={theme}
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
        fontFamily: "'IBM Plex Sans',system-ui,sans-serif",
        color: 'var(--text)',
        display: 'flex',
      }}
    >
      {/* Background patterns */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none', zIndex: 0 }}></div>
      <div className={`bg-glow-container ${isGenerating ? 'generating' : ''} ${isThemeChanging ? 'theme-changing' : ''}`}>
        <div className="bg-glow bg-glow-1"></div>
        <div className="bg-glow bg-glow-2"></div>
        <div className="bg-glow bg-glow-3"></div>
      </div>

      {/* ============ SIDEBAR ============ */}
      <Sidebar
        appMode={appMode}
        onChangeAppMode={switchAppMode}
        sparkSubView={sparkSubView}
        onChangeSparkSubView={switchSparkSubView}
        convos={convos}
        activeId={activeId}
        onSelectConvo={selectConversation}
        onNewChat={createNewChat}
        onDeleteConvo={deleteConversation}
        user={user}
        onLogin={login}
        onLogout={logout}
        googleLinked={googleLinked}
        googleConfigured={googleConfigured}
        onConnectGoogle={connectGoogle}
        onDisconnectGoogle={disconnectGoogle}
        userMenuOpen={userMenuOpen}
        onToggleUserMenu={() => setUserMenuOpen(prev => !prev)}
        onOpenReleaseNotes={() => setReleaseNotesOpen(true)}
        onOpenProfile={handleOpenProfileEditor}
        onOpenImapSettings={() => setIsImapSettingsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        userMenuRef={userMenuRef}
        isVoiceCallActive={isVoiceCallActive}
        onToggleVoiceCall={() => setIsVoiceCallActive(prev => !prev)}
        realtimeCallEnabled={realtimeCallEnabled}
        onToggleRealtimeCall={handleToggleRealtimeCall}
        isVoiceCallSupported={isVoiceCallSupported}
      />

      {/* Backend Status Notification Banner */}
      {backendStatus === 'error' && (
        <div style={{
          position: 'fixed',
          top: '14px',
          right: '18px',
          zIndex: 99999,
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          backdropFilter: 'blur(12px)',
          padding: '10px 16px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          animation: 'fadeInScreen 0.3s ease'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#EF4444' }}>
              バックエンド未接続
            </span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {backendError || 'FastAPI サーバー (8080) を確認してください'}
            </span>
          </div>
          <button
            onClick={async () => {
              setBackendStatus('checking');
              try {
                const res = await fetch(`${getBackendBaseUrl()}/api/health`, { cache: 'no-store' });
                if (res.ok) {
                  setBackendStatus('connected');
                  setBackendError(null);
                } else {
                  setBackendStatus('error');
                  setBackendError(`HTTP ${res.status}`);
                }
              } catch (e: any) {
                setBackendStatus('error');
                setBackendError(e?.message || '接続できません');
              }
            }}
            style={{
              padding: '4px 8px',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#EF4444',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            再試行
          </button>
        </div>
      )}

      {/* ============ MAIN AREA ============ */}
      {user ? (
        isProfileSetupRequired ? (
          renderProfileSetupScreen()
        ) : appMode === 'spark' ? (
          sparkSubView === 'digital_business_card' ? (
            <DigitalBusinessCardView
              token={token}
              initialPerson={selectedPersonForCard}
              onBackToPreviousView={previousSparkSubView ? returnToPreviousSparkSubView : undefined}
              fromPreviousViewName={previousSparkSubView === 'home' ? '秘書デスク (日程詳細/ホーム)' : undefined}
            />
          ) : (
            <SparkDesk
              token={token}
              googleLinked={googleLinked}
              onConnectGoogle={connectGoogle}
              theme={theme}
              onSelectPerson={navigateToPersonCard}
              onTriggerAction={(actionText) => {
                switchAppMode('chat');
                sendPrompt(actionText);
              }}
            />
          )
        ) : (
          <>
            <ChatArea
              activeConvo={activeConvo}
              isEmpty={isEmpty}
              hasMessages={hasMessages}
              thinking={thinking}
              theme={theme}
              onChangeTheme={setTheme}
              view={view}
              onChangeView={setView}
              canvasOk={canvasOk}
              modelId={modelId}
              onChangeModel={setModelId}
              onSend={sendPrompt}
              onOpenCanvas={() => setView('split')}
            />
            {showCanvas && (
              <CanvasArea
                canvasTab={canvasTab}
                onSelectTab={setCanvasTab}
                docFile={docFile}
                sections={sections}
                source={source}
              />
            )}
          </>
        )
      ) : (
        <main style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Top Header to preserve layout & format */}
          <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', height: '54px', padding: '0 22px', borderBottom: '1px solid var(--border)', background: 'var(--topbar)', backdropFilter: 'blur(10px)' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>HomeSpark GeMo</span>
            <div style={{ marginLeft: 'auto', display: 'flex', border: '1px solid var(--border2)', borderRadius: '18px', overflow: 'hidden' }}>
              <button onClick={() => setTheme('light')} title="ライト" style={{ width: '34px', height: '30px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme === 'light' ? 'var(--accent)' : 'transparent', color: theme === 'light' ? 'var(--on-accent)' : 'var(--text3)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5"/>
                </svg>
              </button>
              <button onClick={() => setTheme('dark')} title="ダーク" style={{ width: '34px', height: '30px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid var(--border2)', background: theme === 'dark' ? 'var(--accent)' : 'transparent', color: theme === 'dark' ? 'var(--on-accent)' : 'var(--text3)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>
                </svg>
              </button>
            </div>
          </div>
          
          {/* Recommendation Message View */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center', position: 'relative', overflowY: 'auto' }}>
            <div style={{
              maxWidth: '480px',
              padding: '40px',
              background: 'var(--panel)',
              border: '1px solid var(--border2)',
              borderRadius: '24px',
              boxShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 8px 32px rgba(0, 0, 0, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
              animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
              {/* Premium Icon/Illustration with glow */}
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, var(--accent) 0%, #14b8a6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 30px rgba(45, 212, 191, 0.4)',
                fontSize: '36px',
                color: '#fff',
                marginBottom: '8px'
              }}>
                ✦
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
                  HomeSpark GeMo へようこそ
                </h1>
                <p style={{ fontSize: '13.5px', color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
                  HomeSpark GeMoは、専属秘書「GeMo（ジェモ）」がスケジュール管理、メール送受信、デジタル名刺管理、リアルタイムWeb検索などを全力でサポートする次世代型AIプラットフォームです。
                </p>
              </div>

              {/* Login Promotion Card features */}
              <div style={{
                width: '100%',
                background: 'var(--bg)',
                border: '1px solid var(--border3)',
                borderRadius: '16px',
                padding: '16px 20px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 500, color: 'var(--text2)' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>✓</span> GmailとGoogleカレンダーの自動スケジュール調整
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 500, color: 'var(--text2)' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>✓</span> AIによるLP構成案・API設計書のドキュメント生成
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 500, color: 'var(--text2)' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>✓</span> デュアル・キャンバスでのビジュアル・プレビュー
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                <button
                  onClick={login}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '13px 20px',
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    cursor: 'pointer',
                    fontFamily: "'IBM Plex Sans',system-ui,sans-serif",
                    fontSize: '14px',
                    fontWeight: 600,
                    borderRadius: '14px',
                    boxShadow: '0 4px 14px rgba(45, 212, 191, 0.3)',
                    transition: 'transform 0.2s, filter 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.filter = 'brightness(1.08)';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = 'none';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ background: '#fff', borderRadius: '50%', padding: '2px' }}>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  Google アカウントでログイン
                </button>

                {/* Instant Quick Login for desktop / local offline use */}
                <button
                  onClick={() => loginQuick("ayato.yofukashi@gmail.com", "Ayato")}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '11px 18px',
                    border: '1px solid var(--border2)',
                    background: 'var(--panel)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontFamily: "'IBM Plex Sans',system-ui,sans-serif",
                    fontSize: '13.5px',
                    fontWeight: 600,
                    borderRadius: '14px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.background = 'var(--activebg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border2)';
                    e.currentTarget.style.background = 'var(--panel)';
                  }}
                >
                  <span>⚡</span> ワンクリックですぐに始める (ローカルログイン)
                </button>

                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Googleログインまたはワンクリックログインで、すべての秘書機能・会話・設定をご利用いただけます。
                </span>
              </div>
            </div>
          </div>
        </main>
      )}


      {/* ============ RELEASE NOTES MODAL ============ */}
      <ReleaseNotesModal
        isOpen={releaseNotesOpen}
        onClose={() => setReleaseNotesOpen(false)}
      />

      {/* ============ FLOATING VOICE CALL SUBTITLE OVERLAY ============ */}
      {user && isVoiceCallActive && subtitle && (
        <div style={{
          position: 'fixed',
          bottom: '96px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '600px',
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(45, 212, 191, 0.25)',
          borderRadius: '20px',
          padding: '16px 24px',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5), 0 0 25px rgba(45, 212, 191, 0.25)',
          zIndex: 9998,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          color: '#fff',
          fontFamily: "'IBM Plex Sans',system-ui,sans-serif",
          animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {/* Status Indicator / Animation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '8px',
                height: '8px',
                background: subtitle.sender === 'user' ? '#F59E0B' : (subtitle.sender === 'ai' ? 'var(--accent)' : '#94A3B8'),
                borderRadius: '50%',
                display: 'inline-block',
                boxShadow: subtitle.sender === 'user' ? '0 0 10px #F59E0B' : (subtitle.sender === 'ai' ? '0 0 10px var(--accent)' : 'none'),
                animation: subtitle.sender !== 'status' ? 'pulse 1.5s infinite alternate' : 'none'
              }}></span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {subtitle.sender === 'user' ? 'あなた' : (subtitle.sender === 'ai' ? 'GeMo' : 'ステータス')}
              </span>
              {realtimeCallEnabled && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: isConvActive ? 'rgba(45, 212, 191, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                  color: isConvActive ? 'var(--accent)' : '#94A3B8',
                  border: isConvActive ? '1px solid rgba(45, 212, 191, 0.4)' : '1px solid rgba(148, 163, 184, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {isConvActive ? '🎙️ 対話中' : '👂 待機中'}
                </span>
              )}
            </div>
            
            {/* Visualizer Wave */}
            {subtitle.sender !== 'status' && (
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center', height: '12px' }}>
                <span className="wave-bar" style={{ width: '2.5px', height: '6px', background: 'var(--accent)', borderRadius: '2px', animation: 'bounce-wave 0.8s infinite alternate 0.1s' }}></span>
                <span className="wave-bar" style={{ width: '2.5px', height: '12px', background: 'var(--accent)', borderRadius: '2px', animation: 'bounce-wave 0.8s infinite alternate 0.3s' }}></span>
                <span className="wave-bar" style={{ width: '2.5px', height: '8px', background: 'var(--accent)', borderRadius: '2px', animation: 'bounce-wave 0.8s infinite alternate 0.2s' }}></span>
                <span className="wave-bar" style={{ width: '2.5px', height: '5px', background: 'var(--accent)', borderRadius: '2px', animation: 'bounce-wave 0.8s infinite alternate 0.4s' }}></span>
              </div>
            )}
          </div>

          {/* Subtitle Text */}
          <div style={{
            fontSize: '15px',
            fontWeight: 500,
            lineHeight: 1.5,
            textAlign: 'center',
            minHeight: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            wordBreak: 'break-all',
            color: subtitle.sender === 'user' ? '#FFE3A8' : '#FFFFFF'
          }}>
            {subtitle.text}
          </div>
        </div>
      )}

      {/* ============ FLOATING BOTTOM CENTER MICROPHONE BUTTON ============ */}
      {user && isVoiceCallSupported && (
        <div style={{
          position: 'fixed',
          bottom: '22px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {/* Active Ripple Animation Rings */}
          {isVoiceCallActive && (!realtimeCallEnabled || !isVoiceMuted) && (
            <div className="voice-ripple-ring" style={{
              position: 'absolute',
              width: '68px',
              height: '68px',
              borderRadius: '50%',
              border: '2px solid var(--accent)',
              animation: 'ripple 1.8s cubic-bezier(0.25, 1, 0.5, 1) infinite',
              pointerEvents: 'none'
            }} />
          )}

          <button
            onClick={() => {
              setIsConvActive(false);
              isConvActiveRef.current = false;
              if (realtimeCallEnabled) {
                // Realtime Mode: Toggle Mute / Unmute
                setIsVoiceMuted(prev => {
                  const nextMuted = !prev;
                  if (nextMuted) {
                    fadeOutAndStopVoice(true);
                    setSubtitle({ text: '🔇 マイクはミュートされています（クリックで解除）', sender: 'status' });
                  } else {
                    setSubtitle({ text: 'お話しください...', sender: 'status' });
                  }
                  return nextMuted;
                });
              } else {
                // Normal Mode: Toggle Call On/Off
                setIsVoiceCallActive(prev => !prev);
              }
            }}
            title={
              realtimeCallEnabled
                ? (isVoiceMuted ? "ミュートを解除 (クリックで再開)" : "マイクをミュート (クリックで消音)")
                : (isVoiceCallActive ? "音声会話を終了 (クリックで停止)" : "音声会話を開始 (いつでも話しかけられます)")
            }
            style={{
              position: 'relative',
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: realtimeCallEnabled
                ? (isVoiceMuted ? 'rgba(239, 68, 68, 0.15)' : 'linear-gradient(135deg, var(--accent) 0%, #14b8a6 100%)')
                : (isVoiceCallActive ? 'linear-gradient(135deg, var(--accent) 0%, #14b8a6 100%)' : 'var(--panel)'),
              color: realtimeCallEnabled
                ? (isVoiceMuted ? '#EF4444' : 'var(--on-accent)')
                : (isVoiceCallActive ? 'var(--on-accent)' : 'var(--text)'),
              border: realtimeCallEnabled && isVoiceMuted
                ? '2px solid #EF4444'
                : (isVoiceCallActive ? 'none' : '1px solid var(--border3)'),
              boxShadow: realtimeCallEnabled && isVoiceMuted
                ? '0 0 20px rgba(239, 68, 68, 0.4), 0 8px 24px rgba(0, 0, 0, 0.25)'
                : (isVoiceCallActive 
                    ? '0 0 25px rgba(45, 212, 191, 0.6), 0 8px 24px rgba(0, 0, 0, 0.25)' 
                    : '0 6px 20px rgba(0, 0, 0, 0.15)'),
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              outline: 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.08)';
              if (!isVoiceCallActive && (!realtimeCallEnabled || isVoiceMuted)) {
                e.currentTarget.style.borderColor = realtimeCallEnabled && isVoiceMuted ? '#EF4444' : 'var(--accent)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {realtimeCallEnabled && isVoiceMuted ? (
              // Muted Microphone Icon
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                <path d="M5 10v2a7 7 0 0 0 12 5" />
                <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            ) : isVoiceCallActive ? (
              // Active Microphone Icon
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            ) : (
              // Inactive Microphone Icon
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            )}
          </button>
        </div>
      )}

      {renderProfileModal()}
      <ImapSettingsModal
        isOpen={isImapSettingsOpen}
        onClose={() => setIsImapSettingsOpen(false)}
        token={token}
      />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onLoginGoogle={login}
        onLoginQuick={() => {
          loginQuick(undefined, undefined, false);
        }}
        onComplete={(voiceEnabled) => {
          setIsVoiceCallSupported(voiceEnabled);
          localStorage.setItem('homespark_gemo_onboarding_done', 'true');
          localStorage.setItem('homespark_voice_supported', voiceEnabled ? 'true' : 'false');
          setIsOnboardingOpen(false);
          // Reload page to re-initialize custom hook with newly saved session token
          window.location.reload();
        }}
      />

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.1); opacity: 1; }
        }
        @keyframes bounce-wave {
          0% { transform: scaleY(0.4); }
          100% { transform: scaleY(1); }
        }
        @keyframes fadeInUp {
          0% { transform: translate(-50%, 15px); opacity: 0; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes ripple {
          0% { transform: scale(0.9); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
