import React, { useState, useEffect } from 'react';
import { CalendarDiagramEvent, Person, RelatedEvent } from '../../types/chat';
import { PersonSection } from './PersonSection';
import { RelatedEventsSection } from './RelatedEventsSection';
import { ChatService } from '../../services/ChatService';
import { Markdown } from '../Markdown';

interface EventDetailViewProps {
  token: string | null;
  event: CalendarDiagramEvent;
  onBack: () => void;
  relatedEvents?: RelatedEvent[];
  onSelectPerson?: (person: Person) => void;
}

export const EventDetailView: React.FC<EventDetailViewProps> = ({
  token,
  event,
  onBack,
  relatedEvents = [],
  onSelectPerson
}) => {
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [isAnalyzed, setIsAnalyzed] = useState<boolean>(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<any[]>([]);

  const [isMeeting, setIsMeeting] = useState<boolean>(false);
  const [minutes, setMinutes] = useState<string | null>(null);
  const [recordingMode, setRecordingMode] = useState<boolean>(false);
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState<boolean>(false);

  // Fetch initial AI analysis status and linked people from DB
  const loadEventMeta = async () => {
    try {
      const service = new ChatService();
      const meta = await service.getEventDetailMeta(token, event.id);
      setIsAnalyzed(meta.analyzed);
      setIsMeeting(meta.is_meeting);
      setMinutes(meta.minutes);
      if (meta.people) {
        setPeople(meta.people);
      }
    } catch (err) {
      console.error("Failed to load event metadata:", err);
    }
  };

  useEffect(() => {
    loadEventMeta();
  }, [token, event.id]);

  // Run Gemma AI Analysis on event text
  const handleRunAIAnalysis = async () => {
    setAnalyzing(true);
    try {
      const service = new ChatService();
      const res = await service.analyzeCalendarEvent(token, {
        event_id: event.id || '',
        summary: event.summary || '',
        description: event.description || '',
        location: event.location || '',
      });
      setIsAnalyzed(true);
      setIsMeeting(res.is_meeting);
      setMinutes(res.minutes);
      if (res.people) {
        setPeople(res.people);
      }
      if (res.pending_confirmations && res.pending_confirmations.length > 0) {
        setPendingConfirmations(res.pending_confirmations);
      }
    } catch (err) {
      console.error("Failed to run AI analysis on event:", err);
      alert("AI解析中にエラーが発生しました。");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirmAction = async (
    action: 'link_existing' | 'create_new' | 'skip',
    extractedName: string,
    personId?: string
  ) => {
    try {
      const service = new ChatService();
      const res = await service.confirmPersonLink(token, event.id, action, extractedName, personId);
      if (res.people) {
        setPeople(res.people);
      }
    } catch (err) {
      console.error("Failed to confirm person link:", err);
    } finally {
      setPendingConfirmations(prev => prev.filter(item => item.extracted_name !== extractedName));
    }
  };

  const handleStartMeeting = () => {
    setRecordingMode(true);
  };

  const dummyTranscript = `山田：「今日は弊社の新しいファンドのご提案に伺いました。高配当の株式を中心に構成されています。」
佐藤：「配当金がしっかり出るというのは魅力的ですね。最近は株価の変動が大きいので、インカムゲインを重視したいと考えていました。」
山田：「そうですね。こちらのファンドは過去5年間で平均4.5%の分配金実績があります。」
佐藤：「なるほど。運用管理費用（信託報酬）はどれくらいですか？」
山田：「年率1.2%（税抜）となります。」
佐藤：「少し高めですね。他社だと1.0%を切るものもあるようですが、このファンドの強みは何ですか？」
山田：「はい、このファンドはリスク管理に特化しており、下落局面での値下がりを抑える仕組みが導入されています。」
佐藤：「なるほど、それなら納得です。一度目論見書をじっくり読んで家族とも相談してみます。来週の木曜日あたりにまたお話しできますか？」
山田：「かしこまりました。では来週木曜日の14時に再度お伺いいたします。」`;

  const handleFinishMeeting = async () => {
    setIsGeneratingMinutes(true);
    try {
      const service = new ChatService();
      const res = await service.generateEventMinutes(token, event.id, dummyTranscript);
      setMinutes(res.minutes);
      setRecordingMode(false);
    } catch (err) {
      console.error("Failed to generate minutes:", err);
      alert("議事録の生成中にエラーが発生しました。");
    } finally {
      setIsGeneratingMinutes(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (eventLoad) => {
      const text = eventLoad.target?.result as string;
      if (!text) return;

      setIsGeneratingMinutes(true);
      try {
        const service = new ChatService();
        const res = await service.generateEventMinutes(token, event.id, text);
        setMinutes(res.minutes);
        alert("アップロードされた会話ログから議事録を生成しました。");
      } catch (err) {
        console.error("Failed to generate minutes from file:", err);
        alert("アップロードファイルからの議事録生成中にエラーが発生しました。");
      } finally {
        setIsGeneratingMinutes(false);
      }
    };
    reader.readAsText(file);
  };

  const formatDisplayTime = (iso?: string) => {
    if (!iso) return '';
    if (!iso.includes('T')) return iso;
    const d = new Date(iso);
    const pad = (n: number) => ('0' + n).slice(-2);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const formatFullDateTime = (iso?: string) => {
    if (!iso) return '時間未設定';
    if (!iso.includes('T')) return iso;
    const d = new Date(iso);
    const pad = (n: number) => ('0' + n).slice(-2);
    const week = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${week}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const currentConfirmation = pendingConfirmations.length > 0 ? pendingConfirmations[0] : null;

  return (
    <div style={{
      flex: 1,
      height: '100%',
      overflowY: 'auto',
      padding: '40px 48px',
      background: 'var(--bg)',
      color: 'var(--text)',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      maxWidth: '1100px',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Smart Person Identification & Confirmation Modal */}
      {currentConfirmation && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--panel)',
            border: '2px solid var(--accent)',
            borderRadius: '16px',
            padding: '32px 36px',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                PERSON IDENTIFICATION CONFIRMATION
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
                同一人物の確認
              </h2>
            </div>

            <p style={{ fontSize: '13.5px', color: 'var(--text2)', margin: 0, lineHeight: 1.6 }}>
              カレンダーの予定から「<strong style={{ color: 'var(--text)' }}>{currentConfirmation.extracted_name}</strong>」が検出されました。無条件登録を避け、正確な人物管理を行います。
            </p>

            {currentConfirmation.candidates && currentConfirmation.candidates.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>
                  登録済みの既存名刺候補:
                </div>
                {currentConfirmation.candidates.map((candidate: any) => (
                  <div
                    key={candidate.id}
                    style={{
                      padding: '14px 16px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border2)',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text)' }}>
                        {candidate.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                        {candidate.company} {candidate.role ? `(${candidate.role})` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => handleConfirmAction('link_existing', currentConfirmation.extracted_name, candidate.id)}
                      style={{
                        padding: '8px 14px',
                        background: 'var(--accent)',
                        color: 'var(--on-accent)',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      同一人物として紐付ける
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                padding: '14px 16px',
                background: 'var(--bg)',
                border: '1px solid var(--border2)',
                borderRadius: '10px',
                fontSize: '13px',
                color: 'var(--text3)'
              }}>
                既存のデジタル名刺に一致する候補は見つかりませんでした。
              </div>
            )}

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              borderTop: '1px solid var(--border)',
              paddingTop: '16px'
            }}>
              <button
                onClick={() => handleConfirmAction('skip', currentConfirmation.extracted_name)}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border3)',
                  borderRadius: '6px',
                  color: 'var(--text2)',
                  fontSize: '12.5px',
                  cursor: 'pointer'
                }}
              >
                スキップ (紐付けない)
              </button>
              <button
                onClick={() => handleConfirmAction('create_new', currentConfirmation.extracted_name)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border3)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ＋ 新しい人物として登録
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'var(--panel)',
            border: '1px solid var(--border3)',
            borderRadius: '6px',
            color: 'var(--text2)',
            cursor: 'pointer',
            fontSize: '12.5px',
            fontFamily: "'IBM Plex Mono', monospace"
          }}
        >
          ← 秘書デスクへ戻る
        </button>

        {/* AI Analysis Trigger Button */}
        <button
          onClick={handleRunAIAnalysis}
          disabled={analyzing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 18px',
            background: isAnalyzed ? 'var(--panel)' : 'var(--accent)',
            border: isAnalyzed ? '1px solid var(--accent)' : 'none',
            borderRadius: '6px',
            color: isAnalyzed ? 'var(--accent)' : 'var(--on-accent)',
            cursor: analyzing ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: isAnalyzed ? 'none' : '0 4px 14px rgba(45, 212, 191, 0.25)'
          }}
        >
          <span>✦</span>
          <span>{analyzing ? 'AI解析を実行中...' : (isAnalyzed ? '人物・関連情報を再解析' : 'AIで人物・関連情報を解析')}</span>
        </button>
      </div>

      {/* Box 1: Event Summary Detail Card */}
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border2)',
        borderLeft: '6px solid var(--accent)',
        borderRadius: '16px',
        padding: '32px 36px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>
            EVENT DETAILS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              {event.summary || '(無題)'}
            </h1>
            {isMeeting && !recordingMode && (
              <button
                onClick={handleStartMeeting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  background: '#10B981',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                🎙️ 会議を始める
              </button>
            )}
          </div>
        </div>

        {/* Time and Location Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', fontSize: '13.5px', color: 'var(--text2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace" }}>🕒</span>
            <span>
              {event.all_day
                ? `${event.start} (終日)`
                : `${formatFullDateTime(event.start)} - ${formatDisplayTime(event.end)}`}
            </span>
          </div>

          {event.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace" }}>📍</span>
              <span>{event.location}</span>
            </div>
          )}
        </div>

        {/* Event Description */}
        {event.description ? (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text3)' }}>説明・アジェンダ</div>
            <div style={{
              fontSize: '13.5px',
              color: 'var(--text)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              background: 'var(--bg)',
              padding: '20px',
              borderRadius: '10px',
              border: '1px solid var(--border2)'
            }}>
              {event.description}
            </div>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', fontSize: '13px', color: 'var(--muted)' }}>
            詳細・説明テキストはありません。
          </div>
        )}
      </div>

      {/* Simulation Recording Mode Screen */}
      {recordingMode && (
        <div style={{
          background: 'linear-gradient(135deg, #1E293B, #0F172A)',
          border: '2px solid #10B981',
          borderRadius: '16px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          color: '#FFFFFF',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            fontFamily: "'IBM Plex Mono', monospace",
            color: '#10B981'
          }}>
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#EF4444',
              display: 'inline-block',
              animation: 'pulse 1.5s infinite'
            }}></span>
            RECORDING ACTIVE (SIMULATION)
          </div>
          <style>{`
            @keyframes pulse {
              0% { opacity: 0.3; transform: scale(0.9); }
              50% { opacity: 1; transform: scale(1.1); }
              100% { opacity: 0.3; transform: scale(0.9); }
            }
          `}</style>

          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700 }}>会議の会話ログを収音中...</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#94A3B8' }}>商談中のやり取りを自動で文字起こしし、終了後に議事録を作成します。</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '40px' }}>
            {[12, 24, 35, 18, 29, 45, 23, 15, 30, 42, 28, 16, 25, 38, 20, 10, 15, 25, 35, 22].map((h, i) => (
              <div key={i} style={{
                width: '4px',
                height: `${h}px`,
                background: '#10B981',
                borderRadius: '2px',
                animation: `pulseHeight ${0.5 + (i % 3) * 0.2}s infinite alternate`
              }}></div>
            ))}
          </div>
          <style>{`
            @keyframes pulseHeight {
              0% { transform: scaleY(0.4); }
              100% { transform: scaleY(1.2); }
            }
          `}</style>

          <div style={{
            background: '#0B0F19',
            padding: '16px',
            borderRadius: '10px',
            width: '100%',
            maxHeight: '150px',
            overflowY: 'auto',
            fontSize: '12.5px',
            fontFamily: 'monospace',
            lineHeight: '1.6',
            color: '#E2E8F0',
            border: '1px solid #334155'
          }}>
            <div style={{color: '#10B981', marginBottom: '8px'}}>--- リアルタイム文字起こし (デモデータ) ---</div>
            {dummyTranscript.split('\n').map((line, idx) => (
              <div key={idx} style={{marginBottom: '4px'}}>{line}</div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setRecordingMode(false)}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: '1px solid #475569',
                borderRadius: '8px',
                color: '#E2E8F0',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              キャンセル
            </button>
            <button
              onClick={handleFinishMeeting}
              disabled={isGeneratingMinutes}
              style={{
                padding: '10px 24px',
                background: '#EF4444',
                border: 'none',
                borderRadius: '8px',
                color: '#FFFFFF',
                cursor: isGeneratingMinutes ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)'
              }}
            >
              {isGeneratingMinutes ? '議事録を生成中...' : '🛑 会議終了 (議事録を生成)'}
            </button>
          </div>
        </div>
      )}

      {/* Side-by-side Layout Container for Box 2 (People) and Box 3 (Related Events) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '24px',
        alignItems: 'stretch'
      }}>
        {/* Box 2: People Section */}
        <PersonSection people={people} onSelectPerson={onSelectPerson} />

        {/* Box 3: Related Events Section */}
        <RelatedEventsSection relatedEvents={relatedEvents} />
      </div>

      {/* Box 4: Minutes Section (議事録ブロック) */}
      {isAnalyzed && (
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border2)',
          borderRadius: '16px',
          padding: '32px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                MEETING MINUTES
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                商談議事録
              </h2>
            </div>
          </div>

          {isGeneratingMinutes ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
              <span>✦ AIが会話ログを要約して議事録を生成中...</span>
            </div>
          ) : minutes ? (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                fontSize: '14px',
                color: 'var(--text)',
                lineHeight: 1.6,
                background: 'var(--bg)',
                padding: '24px',
                borderRadius: '10px',
                border: '1px solid var(--border2)'
              }}>
                <Markdown text={minutes} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <label style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border3)',
                  borderRadius: '6px',
                  color: 'var(--text2)',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  fontWeight: 500
                }}>
                  <span>🔄 会話ログを再アップロード</span>
                  <input type="file" accept=".txt" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          ) : (
            <div style={{
              borderTop: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              background: 'var(--bg)',
              borderRadius: '10px',
              border: '1px dashed var(--border3)',
              gap: '16px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '13.5px', color: 'var(--text3)' }}>
                この会議の議事録はまだありません。会議ログ（テキストファイル）をアップロードしてAI議事録を生成できます。
              </div>
              <label style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: 'var(--panel)',
                border: '1px solid var(--border3)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
              }}>
                <span>📤 会話ログをアップロード (.txt)</span>
                <input type="file" accept=".txt" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
