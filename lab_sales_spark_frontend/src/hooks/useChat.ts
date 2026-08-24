import { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Convo, Section, MessageContentItem, Person } from '../types/chat';
import { ChatService } from '../services/ChatService';
import {
  login as authLogin,
  logout as authLogout,
  getToken,
  getUser,
  consumeSessionFromUrl,
  UserProfile,
} from '../services/auth';

function seedConvos(): Record<string, Convo> {
  const initId = 'n_init';
  return {
    [initId]: {
      id: initId,
      title: '新しいチャット',
      time: '今',
      doc: null,
      messages: [],
      apiHistory: []
    }
  };
}

export function useChat(
  parseMarkdownToSections: (markdown: string) => Section[]
) {
  const [appMode, setAppMode] = useState<'chat' | 'spark'>('spark');
  const [sparkSubView, setSparkSubView] = useState<'home' | 'digital_business_card'>('home');
  const [previousSparkSubView, setPreviousSparkSubView] = useState<'home' | 'digital_business_card' | null>(null);
  const [selectedPersonForCard, setSelectedPersonForCard] = useState<Person | null>(null);
  const [convos, setConvos] = useState<Record<string, Convo>>(() => seedConvos());
  const [activeId, setActiveId] = useState<string>('n_init');
  const [thinking, setThinking] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [view, setView] = useState<'split' | 'chat'>('split');
  const [canvasTab, setCanvasTab] = useState<'preview' | 'source'>('preview');

  // Authentication State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Google (Calendar + Gmail) integration state
  const [googleLinked, setGoogleLinked] = useState<boolean>(false);
  const [googleConfigured, setGoogleConfigured] = useState<boolean>(false);

  const chatService = useRef(new ChatService());

  // On mount: pick up a session token the backend may have just put in the URL
  // fragment (after the Google OAuth callback), then hydrate user + token from
  // localStorage. A stored, unexpired session keeps the user logged in across
  // reloads — no Firebase needed.
  useEffect(() => {
    consumeSessionFromUrl();
    setUser(getUser());
    setToken(getToken());
  }, []);

  // The session token is long-lived and already stored; read it (returns null
  // if it has expired, so a dead token is never sent).
  const authToken = async (): Promise<string | null> => {
    return getToken();
  };

  // --- Google (Calendar + Gmail) status ---
  // Login already grants Calendar/Gmail in the same consent, so a logged-in
  // user is normally already "connected". We still surface the status, and
  // "connect" simply re-runs login (re-consent) if a grant was ever revoked.
  const refreshGoogleStatus = async () => {
    const t = getToken();
    if (!t) {
      setGoogleLinked(false);
      return;
    }
    try {
      const status = await chatService.current.getGoogleStatus(t);
      setGoogleLinked(!!status.connected);
      setGoogleConfigured(!!status.configured);
    } catch (e) {
      console.error('Failed to fetch Google status:', e);
    }
  };

  const connectGoogle = () => {
    authLogin(); // re-run the Google consent (also re-grants Calendar/Gmail)
  };

  const disconnectGoogle = async () => {
    const t = getToken();
    if (!t) return;
    try {
      await chatService.current.disconnectGoogle(t);
      setGoogleLinked(false);
    } catch (e) {
      console.error('Failed to disconnect Google:', e);
    }
  };

  // Refresh Google link status once the user is known.
  useEffect(() => {
    if (!user) return;
    refreshGoogleStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const activeConvo = convos[activeId] || { 
    id: activeId, 
    title: "新しいチャット", 
    time: "今", 
    doc: null, 
    messages: [], 
    apiHistory: [] 
  };

  // Synchronize chat sessions list from API on mount / login status change
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const t = await authToken();
        const sessions = await chatService.current.getChatSessions(t);
        const newConvos: Record<string, Convo> = {};
        
        if (sessions.length === 0) {
          const initId = 'n_init';
          newConvos[initId] = {
            id: initId,
            title: '新しいチャット',
            time: '今',
            doc: null,
            messages: [],
            apiHistory: []
          };
          setConvos(newConvos);
          setActiveId(initId);
          return;
        }

        sessions.forEach((s: any) => {
          newConvos[s.chat_id] = {
            id: s.chat_id,
            title: s.title || '新しいチャット',
            time: new Date(s.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            doc: null,
            messages: [], // messages will be lazy-loaded on select
          };
        });

        setConvos(newConvos);
        
        // Auto select the most recent chat session
        const firstSession = sessions[0];
        if (firstSession) {
          setActiveId(firstSession.chat_id);
          fetchAndSetMessages(firstSession.chat_id, t);
        }
      } catch (err) {
        console.error("Failed to load chat sessions from backend:", err);
      }
    };

    loadSessions();
  }, [token]);

  // Lazy-load chat history from Firestore when a session is selected
  const fetchAndSetMessages = async (chatId: string, currentToken: string | null) => {
    if (chatId === 'n_init') return;
    try {
      setThinking(true);
      const t = getToken() ?? currentToken;
      const dbMsgs = await chatService.current.getChatMessages(chatId, t);
      
      const formattedMessages = dbMsgs.map((m: any) => {
        let textVal = '';
        let toolCallsList = undefined;

        if (typeof m.content === 'string') {
          textVal = m.content;
        } else if (Array.isArray(m.content)) {
          textVal = m.content.map((item: any) => {
            if (item.type === 'text') return item.text || '';
            return '';
          }).join('\n');
        }

        if (m.tool_calls) {
          toolCallsList = m.tool_calls.map((tc: any) => ({
            name: tc.function?.name || tc.name || '',
            arguments: tc.function?.arguments 
              ? (typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments) 
              : tc.arguments,
            status: 'success' as const,
          }));
        }

        return {
          role: m.role === 'assistant' ? 'spark' as const : 'user' as const,
          text: m.content || textVal,
          time: '過去',
          toolCalls: toolCallsList,
        };
      });

      // Update chat messages
      setConvos(prev => {
        const existing = prev[chatId];
        if (!existing) return prev;
        return {
          ...prev,
          [chatId]: {
            ...existing,
            messages: formattedMessages,
          }
        };
      });

      // Scan for document / file creation in messages to load into Canvas
      const writeToolCall = dbMsgs
        .filter((m: any) => m.role === 'assistant' && m.tool_calls)
        .flatMap((m: any) => m.tool_calls)
        .reverse()
        .find((tc: any) => tc.function?.name === 'write_file' || tc.function?.name === 'save_document' || tc.function?.name === 'create_file');

      if (writeToolCall) {
        try {
          const args = typeof writeToolCall.function?.arguments === 'string' 
            ? JSON.parse(writeToolCall.function.arguments) 
            : writeToolCall.arguments;
          const filepath = args.filepath || args.path || args.filename || "document.md";
          const content = args.content || "";
          const parsedSections = parseMarkdownToSections(content);
          
          setConvos(prev => {
            const existing = prev[chatId];
            if (!existing) return prev;
            return {
              ...prev,
              [chatId]: {
                ...existing,
                doc: {
                  file: filepath.split('/').pop() || filepath,
                  sections: parsedSections,
                  source: content
                }
              }
            };
          });
          setView('split');
        } catch (e) {
          console.error("Failed to parse canvas document from lazy history:", e);
        }
      }
    } catch (err) {
      console.error(`Failed to load messages for ${chatId}:`, err);
    } finally {
      setThinking(false);
    }
  };

  const login = () => {
    // Full-page redirect to the backend → Google consent. On return, the mount
    // effect picks up the session token from the URL fragment.
    authLogin();
  };

  const logout = () => {
    authLogout();
    setUser(null);
    setToken(null);
    setGoogleLinked(false);
    setConvos(seedConvos());
    setActiveId('n_init');
  };

  const createNewChat = () => {
    const id = 'n_init';
    const c: Convo = { id, title: '新しいチャット', time: '今', doc: null, messages: [], apiHistory: [] };
    setConvos(prev => ({ ...prev, [id]: c }));
    setActiveId(id);
    setView('chat');
  };

  const selectConversation = (id: string) => {
    setActiveId(id);
    const c = convos[id];
    setView(c && c.doc ? 'split' : 'chat');
    setCanvasTab('preview');
    // Lazy-load if there are no messages
    if (c && c.messages.length === 0) {
      fetchAndSetMessages(id, token);
    }
  };

  const deleteConversation = async (id: string) => {
    if (id === 'n_init') return;
    try {
      await chatService.current.deleteChatSession(id, await authToken());
      setConvos(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      if (activeId === id) {
        createNewChat();
      }
    } catch (err) {
      console.error("Failed to delete chat session:", err);
    }
  };

  const getNowString = () => {
    const d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  };

  const sendPrompt = async (
    text: string, 
    attachments?: { name: string, type: string, base64: string }[],
    targetChatId?: string,
    options?: { isVoice?: boolean; systemPrompt?: string }
  ) => {
    const id = targetChatId || activeId;
    const isNewChat = id === 'n_init';
    const currentConvo = convos[id] || { id, title: '新しいチャット', time: '今', doc: null, messages: [], apiHistory: [] };
    const title = currentConvo.messages.length === 0 ? (text.length > 18 ? text.slice(0, 18) : text) : currentConvo.title;
    
    // Construct multimodal content if attachments exist
    let promptContent: string | MessageContentItem[] = text;
    if (attachments && attachments.length > 0) {
      promptContent = [
        { type: 'text', text },
        ...attachments.map(att => ({
          type: 'image_url' as const,
          image_url: { url: `data:${att.type};base64,${att.base64}` },
          name: att.name,
          mimeType: att.type
        }))
      ];
    }

    const newMessages = [
      ...currentConvo.messages, 
      { role: 'user' as const, text: promptContent, time: getNowString() },
      { role: 'spark' as const, text: '', time: getNowString(), toolCalls: [], diagrams: [] }
    ];
    
    setConvos(prev => ({
      ...prev,
      [id]: { ...currentConvo, title, messages: newMessages }
    }));
    
    setThinking(true);
    setIsGenerating(true);

    try {
      const sendChatId = isNewChat ? null : id;
      let currentChatId = id;
      const freshToken = await authToken();

      await chatService.current.streamChat(
        promptContent,
        sendChatId,
        freshToken,
        (event) => {
          if (event.type === 'chat_info' && event.chat_id) {
            const newChatId = event.chat_id;
            currentChatId = newChatId;
            if (isNewChat) {
              setActiveId(newChatId);
              setConvos(prev => {
                const copy = { ...prev };
                const c = copy['n_init'];
                if (c) {
                  delete copy['n_init'];
                  copy[newChatId] = {
                    ...c,
                    id: newChatId,
                    title: title
                  };
                }
                return copy;
              });
            }
          } else if (event.type === 'token') {
            // flushSync forces React to render THIS token before the next SSE
            // chunk is processed. Without it, React 18 batches all the rapid
            // per-token state updates and only paints once at the end, so the
            // reply appears all at once instead of streaming left-to-right —
            // even though the backend sends each token separately.
            flushSync(() => {
              setConvos(prev => {
                const c = prev[currentChatId];
                if (!c) return prev;
                const messagesCopy = [...c.messages];
                const lastIdx = messagesCopy.length - 1;
                if (messagesCopy[lastIdx] && messagesCopy[lastIdx].role === 'spark') {
                  messagesCopy[lastIdx] = {
                    ...messagesCopy[lastIdx],
                    text: messagesCopy[lastIdx].text + (event.content || '')
                  };
                }
                return { ...prev, [currentChatId]: { ...c, messages: messagesCopy } };
              });
            });
          } else if (event.type === 'tool_start') {
            setThinking(true);
            setConvos(prev => {
              const c = prev[currentChatId];
              if (!c) return prev;
              const messagesCopy = [...c.messages];
              const lastIdx = messagesCopy.length - 1;
              if (messagesCopy[lastIdx] && messagesCopy[lastIdx].role === 'spark') {
                const toolCalls = messagesCopy[lastIdx].toolCalls ? [...messagesCopy[lastIdx].toolCalls!] : [];
                toolCalls.push({
                  name: event.name || '',
                  arguments: event.arguments,
                  status: 'running'
                });
                messagesCopy[lastIdx] = { ...messagesCopy[lastIdx], toolCalls };
              }
              return { ...prev, [currentChatId]: { ...c, messages: messagesCopy } };
            });
          } else if (event.type === 'tool_end') {
            setThinking(false);
            setConvos(prev => {
              const c = prev[currentChatId];
              if (!c) return prev;
              const messagesCopy = [...c.messages];
              const lastIdx = messagesCopy.length - 1;
              if (messagesCopy[lastIdx] && messagesCopy[lastIdx].role === 'spark') {
                const toolCalls = (messagesCopy[lastIdx].toolCalls || []).map(tc => {
                  if (tc.name === event.name && tc.status === 'running') {
                    return { ...tc, status: 'success' as const, result: event.result };
                  }
                  return tc;
                });
                messagesCopy[lastIdx] = { ...messagesCopy[lastIdx], toolCalls };
              }
              return { ...prev, [currentChatId]: { ...c, messages: messagesCopy } };
            });

            // Handle file creations to update Canvas
            if (event.name === "write_file" || event.name === "save_document" || event.name === "create_file") {
              const args = event.arguments || {};
              const filepath = args.filepath || args.path || args.filename || "document.md";
              const content = args.content || "";
              const parsedSections = parseMarkdownToSections(content);
              
              setConvos(prev => {
                const c = prev[currentChatId];
                if (!c) return prev;
                
                const messagesCopy = [...c.messages];
                const lastIdx = messagesCopy.length - 1;
                if (messagesCopy[lastIdx] && messagesCopy[lastIdx].role === 'spark') {
                  messagesCopy[lastIdx] = { ...messagesCopy[lastIdx], doc: true };
                }
                return {
                  ...prev,
                  [currentChatId]: {
                    ...c,
                    messages: messagesCopy,
                    doc: {
                      file: filepath.split('/').pop() || filepath,
                      sections: parsedSections,
                      source: content
                    }
                  }
                };
              });
              setView('split');
            }
          } else if (event.type === 'tool_error') {
            setThinking(false);
            setConvos(prev => {
              const c = prev[currentChatId];
              if (!c) return prev;
              const messagesCopy = [...c.messages];
              const lastIdx = messagesCopy.length - 1;
              if (messagesCopy[lastIdx] && messagesCopy[lastIdx].role === 'spark') {
                const toolCalls = (messagesCopy[lastIdx].toolCalls || []).map(tc => {
                  if (tc.name === event.name && tc.status === 'running') {
                    return { ...tc, status: 'error' as const, error: event.error };
                  }
                  return tc;
                });
                messagesCopy[lastIdx] = { ...messagesCopy[lastIdx], toolCalls };
              }
              return { ...prev, [currentChatId]: { ...c, messages: messagesCopy } };
            });
          } else if (event.type === 'custom_diagram') {
            // A tool produced a structured visualization payload. Attach it to
            // the current assistant message; ChatArea renders it as a rich
            // calendar / email card instead of raw JSON. Sent whole (not
            // token-streamed), so we just append it once.
            if (event.diagram) {
              const diagram = event.diagram;
              setConvos(prev => {
                const c = prev[currentChatId];
                if (!c) return prev;
                const messagesCopy = [...c.messages];
                const lastIdx = messagesCopy.length - 1;
                if (messagesCopy[lastIdx] && messagesCopy[lastIdx].role === 'spark') {
                  const diagrams = messagesCopy[lastIdx].diagrams
                    ? [...messagesCopy[lastIdx].diagrams!]
                    : [];
                  diagrams.push(diagram);
                  messagesCopy[lastIdx] = { ...messagesCopy[lastIdx], diagrams };
                }
                return { ...prev, [currentChatId]: { ...c, messages: messagesCopy } };
              });
            }
          } else if (event.type === 'done') {
            setThinking(false);
            setIsGenerating(false);
            setConvos(prev => {
              const c = prev[currentChatId];
              if (!c) return prev;
              const messagesCopy = [...c.messages];
              const lastIdx = messagesCopy.length - 1;
              if (messagesCopy[lastIdx] && messagesCopy[lastIdx].role === 'spark') {
                messagesCopy[lastIdx] = {
                  ...messagesCopy[lastIdx],
                  text: event.final_content || messagesCopy[lastIdx].text
                };
              }
              return {
                ...prev,
                [currentChatId]: {
                  ...c,
                  messages: messagesCopy,
                  apiHistory: event.memory
                }
              };
            });
          } else if (event.type === 'error') {
            setThinking(false);
            setIsGenerating(false);
            setConvos(prev => {
              const c = prev[currentChatId];
              if (!c) return prev;
              return {
                ...prev,
                [currentChatId]: {
                  ...c,
                  messages: [...c.messages, { role: 'spark' as const, text: `エラーが発生しました: ${event.error}`, time: getNowString() }]
                }
              };
            });
          }
        },
        options
      );
    } catch (err: any) {
      console.error(err);
      setThinking(false);
      setIsGenerating(false);
      setConvos(prev => {
        const c = prev[activeId]; // fallback to activeId
        if (!c) return prev;
        return {
          ...prev,
          [activeId]: {
            ...c,
            messages: [...c.messages, { role: 'spark' as const, text: `APIへの接続エラー: ${err.message}`, time: getNowString() }]
          }
        };
      });
    }
  };

  const switchAppMode = (mode: 'chat' | 'spark') => {
    setAppMode(mode);
    if (mode === 'spark') {
      const sparkConvoId = 'c0000000-0000-4000-a000-000000000001';
      let isFirstTime = false;
      setConvos(prev => {
        if (!prev[sparkConvoId]) {
          isFirstTime = true;
          return {
            ...prev,
            [sparkConvoId]: {
              id: sparkConvoId,
              title: '✨ Spark 秘書デスク',
              time: '今',
              doc: null,
              messages: [],
              apiHistory: []
            }
          };
        }
        return prev;
      });
      setActiveId(sparkConvoId);

      // Trigger fetching today's schedule automatically when switching to Spark mode
      setTimeout(() => {
        setConvos(currentConvos => {
          const sparkConvo = currentConvos[sparkConvoId];
          if (sparkConvo && sparkConvo.messages.length === 0) {
            sendPrompt('本日の予定を教えてください。', undefined, sparkConvoId);
          }
          return currentConvos;
        });
      }, 150);
    }
  };

  return {
    appMode,
    convos,
    activeId,
    activeConvo,
    thinking,
    isGenerating,
    view,
    canvasTab,
    user,
    token,
    googleLinked,
    googleConfigured,
    sparkSubView,
    previousSparkSubView,
    selectedPersonForCard,
    switchSparkSubView: (subView: 'home' | 'digital_business_card') => {
      if (subView === 'home') setSelectedPersonForCard(null);
      setPreviousSparkSubView(null);
      setSparkSubView(subView);
    },
    navigateToPersonCard: (person: Person) => {
      setPreviousSparkSubView(sparkSubView);
      setSelectedPersonForCard(person);
      setAppMode('spark');
      setSparkSubView('digital_business_card');
    },
    returnToPreviousSparkSubView: () => {
      if (previousSparkSubView) {
        setSparkSubView(previousSparkSubView);
        setPreviousSparkSubView(null);
      } else {
        setSparkSubView('home');
      }
      setSelectedPersonForCard(null);
    },
    switchAppMode,
    setView,
    setCanvasTab,
    createNewChat,
    selectConversation,
    deleteConversation,
    sendPrompt,
    login,
    logout,
    connectGoogle,
    disconnectGoogle
  };
}
