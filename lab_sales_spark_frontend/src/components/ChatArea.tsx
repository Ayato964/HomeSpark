import React, { useState, useRef, useEffect } from 'react';
import { Convo, MessageContentItem } from '../types/chat';
import { Markdown } from './Markdown';
import { CustomDiagramView } from './CustomDiagram';

interface ChatAreaProps {
  activeConvo: Convo;
  isEmpty: boolean;
  hasMessages: boolean;
  thinking: boolean;
  theme: 'dark' | 'light';
  onChangeTheme: (theme: 'dark' | 'light') => void;
  view: 'split' | 'chat';
  onChangeView: (view: 'split' | 'chat') => void;
  canvasOk: boolean;
  modelId: string;
  onChangeModel: (id: string) => void;
  onSend: (text: string, attachments?: { name: string, type: string, base64: string }[]) => void;
  onOpenCanvas: () => void;
}

const UserMessageContent: React.FC<{ content: string | MessageContentItem[] }> = ({ content }) => {
  if (typeof content === 'string') {
    return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {content.map((item, i) => {
        if (item.type === 'text') {
          return <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{item.text}</div>;
        }
        if (item.type === 'image_url' && item.image_url) {
          // Determine if it is an image
          let isImage = false;
          if (item.mimeType) {
            isImage = item.mimeType.startsWith('image/');
          } else {
            const match = item.image_url.url.match(/^data:([^;]+);base64,/);
            const extractedMime = match ? match[1] : '';
            isImage = extractedMime.startsWith('image/');
          }

          if (isImage) {
            return (
              <div key={i} style={{ maxWidth: '240px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border3)', marginTop: '4px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image_url.url} alt={item.name || "Attached Image"} style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
            );
          } else {
            // Document/File preview card
            return (
              <div key={i} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                background: 'var(--panel)',
                border: '1px solid var(--border3)',
                borderRadius: '8px',
                marginTop: '4px',
                maxWidth: '320px',
                width: 'fit-content'
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: 'rgba(66, 133, 244, 0.1)',
                  color: '#4285F4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{item.name || "添付ファイル"}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{item.mimeType || "不明なファイル形式"}</span>
                </div>
              </div>
            );
          }
        }
        return null;
      })}
    </div>
  );
};

export const ChatArea: React.FC<ChatAreaProps> = ({
  activeConvo,
  isEmpty,
  hasMessages,
  thinking,
  theme,
  onChangeTheme,
  view,
  onChangeView,
  canvasOk,
  modelId,
  onChangeModel,
  onSend,
  onOpenCanvas
}) => {
  const [modelOpen, setModelOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; type: string; base64: string }[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const tokens = (activeConvo.messages.reduce((a, m) => a + m.text.length, 0) * 2 + 96).toLocaleString();

  const scrollDown = () => {
    if (scrollerRef.current) {
      const scroller = scrollerRef.current;
      requestAnimationFrame(() => {
        scroller.scrollTop = scroller.scrollHeight;
      });
    }
  };

  useEffect(() => {
    scrollDown();
  }, [activeConvo.messages, thinking]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setAttachedFiles(prev => [...prev, {
          name: file.name,
          type: file.type || 'application/octet-stream',
          base64: base64String
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSend = () => {
    if (!inputRef.current) return;
    const text = (inputRef.current.value || '').trim();
    if (!text && attachedFiles.length === 0) return;
    inputRef.current.value = '';
    onSend(text, attachedFiles);
    setAttachedFiles([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const useSuggestedText = (text: string) => {
    if (inputRef.current) {
      inputRef.current.value = text;
      inputRef.current.focus();
    }
  };

  const dark = theme === 'dark';
  const baseStyle: React.CSSProperties = { width: '34px', height: '30px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const tabBaseStyle: React.CSSProperties = { padding: '6px 13px', fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace", border: 'none', cursor: 'pointer' };

  const lightBtnStyle: React.CSSProperties = { ...baseStyle, background: dark ? 'transparent' : 'var(--accent)', color: dark ? 'var(--text3)' : 'var(--on-accent)' };
  const darkBtnStyle: React.CSSProperties = { ...baseStyle, borderLeft: '1px solid var(--border2)', background: dark ? 'var(--accent)' : 'transparent', color: dark ? 'var(--on-accent)' : 'var(--text3)' };
  
  const chatTabStyle: React.CSSProperties = { ...tabBaseStyle, background: view === 'chat' ? 'var(--accent)' : 'transparent', color: view === 'chat' ? 'var(--on-accent)' : 'var(--text3)', fontWeight: view === 'chat' ? 600 : 400, borderRight: '1px solid var(--border2)' };
  const canvasTabStyle: React.CSSProperties = { ...tabBaseStyle, background: view === 'split' && canvasOk ? 'var(--accent)' : 'transparent', color: !canvasOk ? 'var(--faint)' : (view === 'split' ? 'var(--on-accent)' : 'var(--text3)'), fontWeight: view === 'split' && canvasOk ? 600 : 400, cursor: canvasOk ? 'pointer' : 'not-allowed' };

  const docFile = activeConvo.doc ? activeConvo.doc.file : '';
  const docMeta = activeConvo.doc ? `${activeConvo.doc.sections.length} SECTIONS · OPEN IN CANVAS` : '';

  return (
    <main style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header / Topbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', height: '54px', padding: '0 22px', borderBottom: '1px solid var(--border)', background: 'var(--topbar)', backdropFilter: 'blur(10px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', color: 'var(--muted)' }}>~/</span>
          <span style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeConvo.title}</span>
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: '18px', overflow: 'hidden' }}>
          <button onClick={() => onChangeTheme('light')} title="ライト" style={lightBtnStyle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5"/>
            </svg>
          </button>
          <button onClick={() => onChangeTheme('dark')} title="ダーク" style={darkBtnStyle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>
            </svg>
          </button>
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: '18px', overflow: 'hidden' }}>
          <button onClick={() => onChangeView('chat')} style={chatTabStyle}>CHAT</button>
          <button onClick={() => canvasOk && onChangeView('split')} style={canvasTabStyle}>CANVAS</button>
        </div>
        <div style={{ position: 'relative' }}>
          <div onClick={() => setModelOpen(prev => !prev)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 15px', border: '1px solid var(--border2)', background: 'var(--panel)', cursor: 'pointer', borderRadius: '18px' }}>
            <span style={{ width: '6px', height: '6px', background: 'var(--accent)' }}></span>
            <span style={{ fontSize: '12.5px', fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace" }}>{modelId}</span>
            <span style={{ color: 'var(--muted)', fontSize: '10px' }}>▾</span>
          </div>
          {modelOpen && (
            <div style={{ position: 'absolute', top: '38px', right: 0, width: '226px', background: 'var(--panel)', border: '1px solid var(--border3)', zIndex: 20, boxShadow: '0 16px 40px -16px rgba(0,0,0,.5)', borderRadius: '12px', overflow: 'hidden' }}>
              {Object.entries({ 'spark-pro': '高精度・推論強め', 'spark-flash': '高速・軽量', 'spark-reason': '熟考モード' }).map(([id, desc]) => {
                const isSelected = id === modelId;
                return (
                  <div
                    key={id}
                    onClick={() => {
                      onChangeModel(id);
                      setModelOpen(false);
                    }}
                    style={{
                      padding: '11px 13px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'var(--activebg)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '6px', height: '6px', background: isSelected ? 'var(--accent)' : 'var(--faint)', flex: 'none' }}></span>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12.5px', fontWeight: 600, color: 'var(--text)' }}>{id}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', paddingLeft: '14px' }}>{desc}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Conversation / Welcome */}
      <div ref={scrollerRef} style={{ flex: 1, overflow: 'auto', padding: '26px 26px 8px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>

          {/* WELCOME (empty) */}
          {isEmpty && (
            <div style={{ padding: '64px 4px 8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ width: '30px', height: '30px', background: 'var(--accent)', marginBottom: '22px', borderRadius: '4px' }}></span>
              <div style={{ fontSize: '30px', fontWeight: 600, letterSpacing: '-.01em', lineHeight: 1.25 }}>こんにちは、雪さん。</div>
              <div style={{ fontSize: '30px', fontWeight: 600, letterSpacing: '-.01em', lineHeight: 1.25, color: 'var(--text3)' }}>今日は何をひらめきましょう？</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', margin: '34px 0 14px' }}>// 試してみる</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', width: '100%' }}>
                {[
                  { icon: '✎', label: '週次レポートの下書きを作って', t: '今週の進捗から週次レポートの下書きを作って。' },
                  { icon: '↺', label: 'この文章をプロ向けトーンに整えて', t: '次の文章を、落ち着いたプロ向けのトーンに整えて：' },
                  { icon: '▦', label: '競合3社の強みを表で比較して', t: '競合3社の強みを表で比較して。' },
                  { icon: '✦', label: 'LPの見出しを5案ください', t: 'SaaSのランディングページの見出しを5案ください。' },
                ].map((p, idx) => (
                  <div onClick={() => useSuggestedText(p.t)} key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '15px 16px', border: '1px solid var(--border2)', background: 'var(--panel)', cursor: 'pointer', minWidth: 0, borderRadius: '12px' }}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', color: 'var(--accent)', flex: 'none', lineHeight: 1.5 }}>{p.icon}</span>
                    <span style={{ fontSize: '13.5px', lineHeight: 1.5, color: 'var(--text2)' }}>{p.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MESSAGES */}
          {activeConvo.messages.map((m, idx) => {
            const isUser = m.role === 'user';
            const isSpark = m.role === 'spark';
            const hasDoc = !!m.doc && canvasOk;

            if (isUser) {
              return (
                <div key={idx} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '78%', padding: '13px 18px', background: 'var(--panel2)', border: '1px solid var(--border2)', fontSize: '14px', lineHeight: 1.7, color: 'var(--text2)', borderRadius: '18px 18px 2px 18px' }}>
                    <UserMessageContent content={m.text} />
                  </div>
                </div>
              );
            }
            if (isSpark) {
              return (
                <div key={idx} style={{ display: 'flex', gap: '14px' }}>
                  <span style={{ width: '28px', height: '28px', flex: 'none', background: 'var(--accent)', borderRadius: '50%' }}></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '10.5px', letterSpacing: '.1em', color: 'var(--muted)', marginBottom: '6px' }}>SALES SPARK · {m.time}</div>
                    
                    {/* Tool Calls Logs */}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '4px 0 12px', fontSize: '12px' }}>
                        {m.toolCalls.map((tc, tIdx) => {
                          const getToolLabel = (name: string) => {
                            switch(name) {
                              case 'search_web': case 'web_search': return 'Web検索';
                              case 'write_file': case 'create_file': case 'save_document': return 'ファイル作成';
                              case 'read_file': return 'ファイル読み込み';
                              case 'list_dir': case 'list_directory': return 'ディレクトリ確認';
                              case 'run_command': return 'コマンド実行';
                              default: return name;
                            }
                          };
                          
                          const isRunning = tc.status === 'running';
                          const isSuccess = tc.status === 'success';
                          
                          return (
                            <div key={tIdx} style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 12px',
                              background: 'var(--panel)',
                              border: '1px solid var(--border2)',
                              borderRadius: '8px',
                              width: 'fit-content',
                              fontFamily: "'IBM Plex Mono', monospace"
                            }}>
                              <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: isRunning ? '#F59E0B' : isSuccess ? '#10B981' : '#EF4444',
                                animation: isRunning ? 'sparkblink 1s infinite' : 'none'
                              }}></span>
                              <span style={{ fontWeight: 600 }}>{tc.name}</span>
                              <span style={{ color: 'var(--muted)', fontSize: '11px' }}>
                                {isRunning ? '実行中...' : isSuccess ? '完了' : `エラー: ${tc.error}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Custom diagrams (e.g. Calendar / Gmail visualizations) */}
                    {m.diagrams && m.diagrams.length > 0 && (
                      <div>
                        {m.diagrams.map((d, dIdx) => (
                          <CustomDiagramView key={dIdx} diagram={d} />
                        ))}
                      </div>
                    )}

                    <div style={{ fontSize: '14.5px', lineHeight: 1.72, color: 'var(--text2)', textWrap: 'pretty' as any }}>
                      <Markdown text={typeof m.text === 'string' ? m.text : ''} />
                    </div>
                    {hasDoc && (
                      <div onClick={onOpenCanvas} style={{ marginTop: '14px', display: 'inline-flex', alignItems: 'stretch', border: '1px solid var(--border2)', background: 'var(--panel)', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden' }}>
                        <span style={{ width: '3px', background: 'var(--accent)', flex: 'none' }}></span>
                        <div style={{ padding: '12px 16px' }}>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', fontWeight: 500 }}>{docFile}</div>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '9.5px', color: 'var(--muted)', marginTop: '5px', letterSpacing: '.05em' }}>{docMeta}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            return null;
          })}

          {/* THINKING */}
          {thinking && (() => {
            const lastMsg = activeConvo.messages[activeConvo.messages.length - 1];
            const runningTool = lastMsg && lastMsg.role === 'spark' && lastMsg.toolCalls 
              ? lastMsg.toolCalls.find(tc => tc.status === 'running') 
              : null;

            const getThinkingLabel = () => {
              if (!runningTool) return '…';
              return `${runningTool.name} のツールを使っています・・`;
            };
            
            return (
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center', margin: '8px 0' }}>
                <span style={{ width: '28px', height: '28px', flex: 'none', background: 'var(--accent)', borderRadius: '50%' }}></span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--activebg)', border: '1px solid var(--border2)', padding: '8px 14px', borderRadius: '20px' }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', animation: 'sparkblink 1.2s infinite both' }}></span>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', animation: 'sparkblink 1.2s infinite both .2s' }}></span>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', animation: 'sparkblink 1.2s infinite both .4s' }}></span>
                  </div>
                  <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text3)', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {getThinkingLabel()}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Composer */}
      <div style={{ padding: '8px 26px 18px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          {hasMessages && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {[
                { label: 'more_bold', t: 'もっと大胆な案も出して。' },
                { label: 'to_english', t: 'コピーを英語にして。' },
                { label: 'as_table', t: '比較表にまとめて。' },
              ].map((x, idx) => (
                <span onClick={() => useSuggestedText(x.t)} key={idx} style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text3)', background: 'var(--panel)', border: '1px solid var(--border2)', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", borderRadius: '14px' }}>{x.label}</span>
              ))}
            </div>
          )}
          <div style={{ background: 'var(--composer)', border: '1px solid var(--border2)', padding: '14px', borderRadius: '16px' }}>
            {/* Hidden File Inputs */}
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="*/*" 
              multiple 
              style={{ display: 'none' }} 
              onChange={handleFileChange} 
            />
            <input 
              type="file" 
              ref={imageInputRef} 
              accept="image/*" 
              multiple 
              style={{ display: 'none' }} 
              onChange={handleFileChange} 
            />

            {/* Attached Files Preview */}
            {attachedFiles.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '8px 4px', borderBottom: '1px solid var(--border2)', marginBottom: '8px' }}>
                {attachedFiles.map((file, idx) => {
                  const isImage = file.type.startsWith('image/');
                  return (
                    <div key={idx} style={{
                      position: 'relative',
                      width: '64px',
                      height: '64px',
                      borderRadius: '6px',
                      border: '1px solid var(--border3)',
                      background: 'var(--panel2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden'
                    }}>
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`data:${file.type};base64,${file.base64}`} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px', textAlign: 'center' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '2px' }}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          <span style={{ fontSize: '8px', color: 'var(--text3)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '56px' }}>{file.name}</span>
                        </div>
                      )}
                      <button
                        onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.6)',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '9px',
                          padding: 0
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <textarea ref={inputRef} onKeyDown={onKeyDown} rows={1} placeholder="メッセージを入力 …  （⏎ 送信 / Shift+⏎ で改行）" style={{ width: '100%', background: 'transparent', border: 'none', resize: 'none', color: 'var(--text)', fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.55, padding: '2px 2px 14px', minHeight: '48px' }}></textarea>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => fileInputRef.current?.click()} title="ファイルを添付" style={{ width: '34px', height: '34px', border: '1px solid var(--border2)', background: 'var(--panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '50%' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8"><path d="M21 12.5 12.5 21a4.5 4.5 0 0 1-6.4-6.4l8.5-8.5a3 3 0 0 1 4.3 4.3l-8.5 8.5a1.5 1.5 0 0 1-2.1-2.1l7.8-7.8"/></svg></button>
              <button onClick={() => imageInputRef.current?.click()} title="画像を添付" style={{ width: '34px', height: '34px', border: '1px solid var(--border2)', background: 'var(--panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '50%' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg></button>
              <button title="音声入力" style={{ width: '34px', height: '34px', border: '1px solid var(--border2)', background: 'var(--panel)', display: 'flex', alignItems: 'center', justifycontent: 'center', cursor: 'pointer', borderRadius: '50%' } as any}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/></svg></button>
              <div style={{ flex: 1 }}></div>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px', color: 'var(--faint)' }}>⏎ 送信</span>
              <button onClick={handleSend} title="送信" style={{ width: '36px', height: '36px', border: 'none', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '50%' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="2.4"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg></button>
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ height: '30px', borderTop: '1px solid var(--border)', background: 'var(--topbar)', display: 'flex', alignItems: 'center', gap: '18px', padding: '0 18px', fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '.05em' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '6px', height: '6px', background: 'var(--accent)', borderRadius: '50%' }}></span>{modelId}</span>
        <span>{tokens} tokens</span>
        <span style={{ flex: 1 }}></span>
        <span>⌘K コマンド</span>
      </div>
    </main>
  );
};
