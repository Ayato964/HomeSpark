import React, { useState, useEffect } from 'react';
import { ChatService } from '../services/ChatService';
import { CalendarDiagramEvent, Person, SparkNotification } from '../types/chat';
import { EventDetailView } from './spark/EventDetailView';

interface SparkDeskProps {
  token: string | null;
  googleLinked: boolean;
  onConnectGoogle: () => void;
  theme: 'dark' | 'light';
  onSelectPerson?: (person: Person) => void;
  onTriggerAction?: (actionText: string) => void;
}

type BoxType = 'calendar' | 'announcements';

interface SwipeSliderProps {
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
}

const SwipeSlider: React.FC<SwipeSliderProps> = ({ onSwipeRight, onSwipeLeft }) => {
  const [dragX, setDragX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const startX = React.useRef<number>(0);
  
  const sliderWidth = 300;
  const knobWidth = 60;
  const maxTravel = (sliderWidth - knobWidth) / 2;

  const handleStart = (clientX: number) => {
    setIsDragging(true);
    startX.current = clientX - dragX;
  };

  const handleMove = (clientX: number) => {
    if (!isDragging) return;
    let deltaX = clientX - startX.current;
    if (deltaX > maxTravel) deltaX = maxTravel;
    if (deltaX < -maxTravel) deltaX = -maxTravel;
    setDragX(deltaX);
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (dragX >= maxTravel * 0.8) {
      onSwipeRight();
    } else if (dragX <= -maxTravel * 0.8) {
      onSwipeLeft();
    } else {
      setDragX(0);
    }
  };

  useEffect(() => {
    if (!isDragging) {
      setDragX(0);
    }
  }, [isDragging]);

  return (
    <div 
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchMove={(e) => {
        if (e.touches.length > 0) {
          handleMove(e.touches[0].clientX);
        }
      }}
      onTouchEnd={handleEnd}
      style={{
        width: `${sliderWidth}px`,
        height: '60px',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: '30px',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      <div style={{ position: 'absolute', left: '20px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>
        ← 戻る
      </div>
      <div style={{ position: 'absolute', right: '20px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>
        確認する →
      </div>

      <div
        onMouseDown={(e) => handleStart(e.clientX)}
        onTouchStart={(e) => {
          if (e.touches.length > 0) {
            handleStart(e.touches[0].clientX);
          }
        }}
        style={{
          width: `${knobWidth}px`,
          height: `${knobWidth - 4}px`,
          background: 'var(--accent, #2dd4bf)',
          borderRadius: '50%',
          position: 'absolute',
          left: `calc(50% - ${knobWidth / 2}px + ${dragX}px)`,
          cursor: 'grab',
          boxShadow: '0 0 15px var(--accent, #2dd4bf)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          color: '#0f172a',
          transform: 'scale(1)',
          transition: isDragging ? 'none' : 'left 0.2s ease-out',
          zIndex: 10
        }}
      >
        ↔
      </div>
    </div>
  );
};

const formatLocalISO = (d: Date) => {
  const pad = (n: number) => ('0' + n).slice(-2);
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const offsetHours = pad(Math.floor(Math.abs(offset) / 60));
  const offsetMins = pad(Math.abs(offset) % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMins}`;
};

export const SparkDesk: React.FC<SparkDeskProps> = ({
  token,
  googleLinked,
  onConnectGoogle,
  onSelectPerson,
  onTriggerAction
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [events, setEvents] = useState<CalendarDiagramEvent[]>([]);
  const [connectedStatus, setConnectedStatus] = useState<boolean>(googleLinked);

  // Notifications states
  const [notifications, setNotifications] = useState<SparkNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState<boolean>(false);
  const [viewingNotifications, setViewingNotifications] = useState<boolean>(false);
  const [currentNotificationIndex, setCurrentNotificationIndex] = useState<number>(0);

  // Draft Editor States
  const [editingDraftNotifId, setEditingDraftNotifId] = useState<string | null>(null);
  const [draftTo, setDraftTo] = useState<string>('');
  const [draftSubject, setDraftSubject] = useState<string>('');
  const [draftBody, setDraftBody] = useState<string>('');
  const [originalMailBody, setOriginalMailBody] = useState<string>('');
  const [draftInstruction, setDraftInstruction] = useState<string>('');
  const [revisingDraft, setRevisingDraft] = useState<boolean>(false);
  const [sendingDraft, setSendingDraft] = useState<boolean>(false);


  // Special time screen states
  const [isSpecialTime, setIsSpecialTime] = useState<boolean>(false);
  const [specialTimeType, setSpecialTimeType] = useState<'morning' | 'lunch' | 'night' | null>(null);
  const [dismissedSpecial, setDismissedSpecial] = useState<boolean>(false);

  useEffect(() => {
    const checkTime = () => {
      const hours = new Date().getHours();
      const minutes = new Date().getMinutes();
      const curTime = hours + minutes / 60;

      // 朝: 5:00 - 9:59, 昼: 11:30 - 13:59, 夜: 18:00 - 22:59
      if (curTime >= 5.0 && curTime < 10.0) {
        setIsSpecialTime(true);
        setSpecialTimeType('morning');
      } else if (curTime >= 11.5 && curTime < 14.0) {
        setIsSpecialTime(true);
        setSpecialTimeType('lunch');
      } else if (curTime >= 18.0 && curTime < 23.0) {
        setIsSpecialTime(true);
        setSpecialTimeType('night');
      } else {
        setIsSpecialTime(false);
        setSpecialTimeType(null);
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Selected event state for detail view navigation
  const [selectedEvent, setSelectedEvent] = useState<CalendarDiagramEvent | null>(null);

  // Drag and Drop ordering for dashboard boxes
  const [boxOrder, setBoxOrder] = useState<BoxType[]>(['calendar', 'announcements']);
  const [draggedBox, setDraggedBox] = useState<BoxType | null>(null);
  const [dragOverBox, setDragOverBox] = useState<BoxType | null>(null);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);

  const timeMinISO = formatLocalISO(todayStart);
  const timeMaxISO = formatLocalISO(tomorrowEnd);

  const fetchCalendarEvents = async () => {
    setLoading(true);
    try {
      const chatService = new ChatService();
      const res = await chatService.getCalendarEvents(
        token,
        timeMinISO,
        timeMaxISO
      );
      setConnectedStatus(!!res.connected);
      if (res.diagram && res.diagram.events) {
        setEvents(res.diagram.events);
      } else {
        setEvents([]);
      }
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const chatService = new ChatService();
      const res = await chatService.getNotifications(token);
      setNotifications(res);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const chatService = new ChatService();
      await chatService.markNotificationAsRead(token, id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  useEffect(() => {
    fetchCalendarEvents();
    fetchNotifications();
  }, [token, googleLinked]);

  const yearStr = now.getFullYear();
  const monthStr = now.getMonth() + 1;
  const dateStr = now.getDate();
  const dayOfWeekStr = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowYearStr = tomorrow.getFullYear();
  const tomorrowMonthStr = tomorrow.getMonth() + 1;
  const tomorrowDateStr = tomorrow.getDate();
  const tomorrowDayOfWeekStr = ['日', '月', '火', '水', '木', '金', '土'][tomorrow.getDay()];

  const todayYYYYMMDD = `${yearStr}-${('0' + monthStr).slice(-2)}-${('0' + dateStr).slice(-2)}`;
  const tomorrowYYYYMMDD = `${tomorrowYearStr}-${('0' + tomorrowMonthStr).slice(-2)}-${('0' + tomorrowDateStr).slice(-2)}`;

  // Categorize events for today and tomorrow
  const todayEvents = events.filter((ev: CalendarDiagramEvent) => ev.start && ev.start.startsWith(todayYYYYMMDD));
  const tomorrowEvents = events.filter((ev: CalendarDiagramEvent) => ev.start && ev.start.startsWith(tomorrowYYYYMMDD));

  // Determine the next upcoming event across today and tomorrow
  const getEventEndTime = (ev: CalendarDiagramEvent) => {
    if (!ev.end) {
      if (!ev.start) return new Date(0);
      return new Date(new Date(ev.start).getTime() + 3600 * 1000);
    }
    if (ev.all_day) {
      return new Date(`${ev.start}T23:59:59`);
    }
    return new Date(ev.end);
  };

  const getEventStartTime = (ev: CalendarDiagramEvent) => {
    if (!ev.start) return new Date(0);
    if (ev.all_day) return new Date(`${ev.start}T00:00:00`);
    return new Date(ev.start);
  };

  // Find upcoming event where end time >= now
  const upcomingEvents = [...events].filter(ev => getEventEndTime(ev).getTime() >= now.getTime());
  upcomingEvents.sort((a, b) => getEventStartTime(a).getTime() - getEventStartTime(b).getTime());

  const nextEventId = upcomingEvents.length > 0 ? upcomingEvents[0].id : null;
  const isNextEventTomorrow = nextEventId ? tomorrowEvents.some(ev => ev.id === nextEventId) : false;

  // Limit today's events to max 3
  const limitedTodayEvents = todayEvents.slice(0, 3);
  // Limit tomorrow's events to max 3
  const limitedTomorrowEvents = tomorrowEvents.slice(0, 3 - (isNextEventTomorrow ? 0 : limitedTodayEvents.length));

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, boxId: BoxType) => {
    setDraggedBox(boxId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', boxId);
  };

  const handleDragOver = (e: React.DragEvent, targetBoxId: BoxType) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverBox !== targetBoxId) {
      setDragOverBox(targetBoxId);
    }
  };

  const handleDragLeave = (targetBoxId: BoxType) => {
    if (dragOverBox === targetBoxId) {
      setDragOverBox(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetBoxId: BoxType) => {
    e.preventDefault();
    setDragOverBox(null);
    if (!draggedBox || draggedBox === targetBoxId) return;

    setBoxOrder(prev => {
      const copy = [...prev];
      const draggedIdx = copy.indexOf(draggedBox);
      const targetIdx = copy.indexOf(targetBoxId);
      if (draggedIdx !== -1 && targetIdx !== -1) {
        copy.splice(draggedIdx, 1);
        copy.splice(targetIdx, 0, draggedBox);
      }
      return copy;
    });
    setDraggedBox(null);
  };

  const handleDragEnd = () => {
    setDraggedBox(null);
    setDragOverBox(null);
  };

  const renderGripHandle = () => (
    <div
      title="ドラッグして移動"
      style={{
        cursor: 'grab',
        padding: '5px 8px',
        color: 'var(--text3)',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        background: 'var(--activebg)',
        border: '1px solid var(--border3)',
        transition: 'background-color 0.15s ease'
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="8" cy="6" r="1.5" />
        <circle cx="16" cy="6" r="1.5" />
        <circle cx="8" cy="12" r="1.5" />
        <circle cx="16" cy="12" r="1.5" />
        <circle cx="8" cy="18" r="1.5" />
        <circle cx="16" cy="18" r="1.5" />
      </svg>
    </div>
  );

  const formatDisplayTime = (iso?: string) => {
    if (!iso) return '';
    if (!iso.includes('T')) return iso;
    const d = new Date(iso);
    const hours = ('0' + d.getHours()).slice(-2);
    const minutes = ('0' + d.getMinutes()).slice(-2);
    return `${hours}:${minutes}`;
  };

  const renderEventCard = (ev: CalendarDiagramEvent, isNext: boolean) => {
    const startTime = formatDisplayTime(ev.start);
    const endTime = formatDisplayTime(ev.end);
    const timeDisplay = ev.all_day ? '終日' : `${startTime} - ${endTime}`;

    return (
      <div
        key={ev.id || ev.summary}
        onClick={() => setSelectedEvent(ev)}
        title="クリックして詳細を表示"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: isNext ? 'rgba(45, 212, 191, 0.08)' : 'var(--bg)',
          border: isNext ? '1px solid var(--accent)' : '1px solid var(--border2)',
          borderLeft: isNext ? '6px solid var(--accent)' : '4px solid var(--border3)',
          borderRadius: '8px',
          gap: '16px',
          boxShadow: isNext ? '0 4px 14px rgba(45, 212, 191, 0.15)' : 'none',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = isNext ? '0 4px 14px rgba(45, 212, 191, 0.15)' : 'none';
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '15px', fontWeight: isNext ? 700 : 600, color: 'var(--text)' }}>
              {ev.summary || '(無題の予定)'}
            </div>
            {isNext && (
              <span style={{
                fontSize: '10.5px',
                fontWeight: 700,
                fontFamily: "'IBM Plex Mono', monospace",
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                letterSpacing: '0.05em'
              }}>
                直近の予定
              </span>
            )}
          </div>
          {ev.location && (
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
              場所: {ev.location}
            </div>
          )}
          {ev.description && (
            <div style={{ fontSize: '12px', color: 'var(--muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {ev.description}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: "'IBM Plex Mono', monospace",
            color: isNext ? 'var(--accent)' : 'var(--text2)',
            flex: 'none',
            padding: '6px 12px',
            background: isNext ? 'rgba(45, 212, 191, 0.15)' : 'var(--activebg)',
            borderRadius: '4px',
            border: isNext ? '1px solid var(--accent)' : '1px solid var(--border)'
          }}>
            {timeDisplay}
          </div>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>›</span>
        </div>
      </div>
    );
  };

  // Special Time Screen Renderer
  const renderSpecialTimeScreen = () => {
    let bgGradient = 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)';
    let welcomeMsg = 'お疲れ様です';
    let textTheme = '#fff';

    if (specialTimeType === 'morning') {
      bgGradient = 'linear-gradient(135deg, #fef9c3 0%, #eab308 100%)';
      welcomeMsg = 'おはようございます';
      textTheme = '#1e293b';
    } else if (specialTimeType === 'lunch') {
      bgGradient = 'linear-gradient(135deg, #e0f2fe 0%, #0284c7 100%)';
      welcomeMsg = 'こんにちは';
      textTheme = '#0f172a';
    } else if (specialTimeType === 'night') {
      bgGradient = 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)';
      welcomeMsg = 'お疲れ様です';
      textTheme = '#ffffff';
    }

    const unreadNotifications = notifications.filter(n => !n.is_read);
    const unreadCount = unreadNotifications.length;

    return (
      <div style={{
        flex: 1,
        height: '100%',
        minHeight: '100vh',
        background: bgGradient,
        color: textTheme,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        textAlign: 'center',
        gap: '40px',
        boxSizing: 'border-box'
      }}>
        {/* Glow icon */}
        <div style={{
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '44px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
        }}>
          🔔
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 600, opacity: 0.9 }}>
            {welcomeMsg}
          </div>
          <h1 style={{ fontSize: '38px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            Sparkからのお知らせ
          </h1>
          <p style={{
            fontSize: '16px',
            opacity: 0.8,
            maxWidth: '400px',
            margin: '0 auto',
            lineHeight: 1.6
          }}>
            {unreadCount > 0 
              ? `現在、未確認の重要なお知らせが ${unreadCount} 件あります。内容を確認してください。`
              : '現在、新しいお知らせはありません。'}
          </p>
        </div>

        {/* Swipe Control */}
        {unreadCount > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <SwipeSlider
              onSwipeRight={() => {
                setViewingNotifications(true);
                setCurrentNotificationIndex(0);
                setDismissedSpecial(true);
              }}
              onSwipeLeft={() => {
                setDismissedSpecial(true);
              }}
            />
            <div style={{ fontSize: '11px', opacity: 0.7 }}>
              右スワイプでお知らせ確認 / 左スワイプで閉じる
            </div>
          </div>
        ) : (
          <button
            onClick={() => setDismissedSpecial(true)}
            style={{
              padding: '12px 24px',
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'inherit',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease'
            }}
          >
            ホーム画面へ進む
          </button>
        )}
      </div>
    );
  };

  if (isSpecialTime && !dismissedSpecial) {
    return renderSpecialTimeScreen();
  }

  // Notifications Detail Slide View
  if (viewingNotifications) {
    const unreadNotifications = notifications.filter(n => !n.is_read);
    const currentNotif = unreadNotifications[currentNotificationIndex];

    const moveToNextOrClose = (currentId: string) => {
      const nextUnread = unreadNotifications.filter(n => n.id !== currentId);
      if (nextUnread.length === 0) {
        setViewingNotifications(false);
      } else {
        // もし最後の要素を消したなら、インデックスを1つ戻す。そうでなければインデックス維持（自動的に次の要素がスライドしてくる）
        if (currentNotificationIndex >= nextUnread.length) {
          setCurrentNotificationIndex(nextUnread.length - 1);
        }
      }
    };

    const handleNext = async () => {
      if (!currentNotif) return;
      await markAsRead(currentNotif.id);
      moveToNextOrClose(currentNotif.id);
    };

    const handleRollback = async (notifId: string) => {
      try {
        const chatService = new ChatService();
        await chatService.rollbackNotification(token, notifId);
        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
        moveToNextOrClose(notifId);
      } catch (err) {
        console.error("Failed to rollback notification:", err);
      }
    };

    const handleAction = async (action: any) => {
      if (!currentNotif) return;
      
      if (action.type === 'reply_draft') {
        setEditingDraftNotifId(currentNotif.id);
        setDraftTo(action.metadata?.to || '');
        setDraftSubject(action.metadata?.subject || '');
        setDraftBody(action.metadata?.draft_text || '');
        setOriginalMailBody(action.metadata?.original_body || '');
        setDraftInstruction('');
        return;
      }

      if (action.type === 'snooze') {
        // snoozeの場合は既読にせず、単に次のカードへ進める
        moveToNextOrClose(currentNotif.id);
        return;
      }
      
      await markAsRead(currentNotif.id);
      
      let promptText = "";
      if (action.type === 'calendar_add') {
        const meta = action.metadata || {};
        promptText = `以下の予定をカレンダーに登録してください。\n\nタイトル: ${meta.summary || ''}\n開始日時: ${meta.start || ''}\n終了日時: ${meta.end || ''}`;
      }
      
      if (promptText && onTriggerAction) {
        onTriggerAction(promptText);
      }
      
      moveToNextOrClose(currentNotif.id);
    };

    const handleReviseDraft = async () => {
      if (!draftInstruction || !draftInstruction.trim()) return;
      setRevisingDraft(true);
      try {
        const chatService = new ChatService();
        const res = await chatService.reviseReplyDraft(token, currentNotif.id, {
          instruction: draftInstruction,
          current_draft: draftBody,
          original_mail_body: originalMailBody,
          to: draftTo,
          subject: draftSubject
        });
        setDraftBody(res.draft_text);
        setDraftInstruction('');
      } catch (err) {
        console.error("Failed to revise draft:", err);
      } finally {
        setRevisingDraft(false);
      }
    };

    const handleSendDraft = async () => {
      setSendingDraft(true);
      try {
        const chatService = new ChatService();
        await chatService.sendReplyDraft(token, currentNotif.id, {
          to: draftTo,
          subject: draftSubject,
          body: draftBody
        });
        setNotifications(prev => prev.map(n => n.id === currentNotif.id ? { ...n, is_read: true } : n));
        setEditingDraftNotifId(null);
        moveToNextOrClose(currentNotif.id);
      } catch (err) {
        console.error("Failed to send email:", err);
      } finally {
        setSendingDraft(false);
      }
    };

    const hasRollback = currentNotif ? currentNotif.actions.some(act => act.type === 'rollback_calendar') : false;

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
        maxWidth: '700px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid var(--border2)',
          paddingBottom: '16px'
        }}>
          <button
            onClick={() => setViewingNotifications(false)}
            style={{
              padding: '8px 16px',
              background: 'var(--activebg)',
              border: '1px solid var(--border3)',
              borderRadius: '6px',
              color: 'var(--text2)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background-color 0.15s ease'
            }}
          >
            <span>←</span> デスクに戻る
          </button>
          <span style={{ fontSize: '18px', fontWeight: 700 }}>お知らせの確認</span>
          <span style={{
            marginLeft: 'auto',
            fontSize: '14px',
            color: 'var(--text3)',
            fontFamily: "'IBM Plex Mono', monospace",
            background: 'var(--activebg)',
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid var(--border)'
          }}>
            {unreadNotifications.length > 0 ? `${currentNotificationIndex + 1} / ${unreadNotifications.length}` : '0 / 0'}
          </span>
        </div>

        {/* Card Container */}
        {currentNotif ? (
          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border2)',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}>
            {editingDraftNotifId === currentNotif.id ? (
              // Inline Reply Draft Editor View
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border3)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                      ✉ 返信メールの編集と送信
                    </span>
                    {currentNotif.actions.find(act => act.type === 'reply_draft')?.metadata?.person_id && (
                      <span style={{
                        fontSize: '11px',
                        background: 'rgba(45, 212, 191, 0.1)',
                        color: 'var(--accent)',
                        border: '1px solid rgba(45, 212, 191, 0.3)',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        cursor: onSelectPerson ? 'pointer' : 'default',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(45, 212, 191, 0.18)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(45, 212, 191, 0.1)'}
                      onClick={() => {
                        const repAct = currentNotif.actions.find(act => act.type === 'reply_draft');
                        if (onSelectPerson && repAct?.metadata?.person_id && repAct?.metadata?.person_name) {
                          onSelectPerson({
                            id: repAct.metadata.person_id,
                            name: repAct.metadata.person_name,
                            email: repAct.metadata.to || '',
                            company: '',
                            role: '',
                            phone: '',
                            address: '',
                            postal_code: '',
                            hobbies: '',
                            notes: ''
                          });
                        }
                      }}
                      >
                        👤 {currentNotif.actions.find(act => act.type === 'reply_draft')?.metadata?.person_name} 様の名刺へ紐付け済
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setEditingDraftNotifId(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    キャンセル
                  </button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '13px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted)', width: '60px' }}>宛先:</span>
                    <input 
                      value={draftTo}
                      onChange={(e) => setDraftTo(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'var(--bg)',
                        border: '1px solid var(--border3)',
                        borderRadius: '4px',
                        padding: '6px 10px',
                        color: 'var(--text)',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '13px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted)', width: '60px' }}>件名:</span>
                    <input 
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'var(--bg)',
                        border: '1px solid var(--border3)',
                        borderRadius: '4px',
                        padding: '6px 10px',
                        color: 'var(--text)',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                </div>
                
                {originalMailBody && (
                  <div style={{
                    background: 'var(--activebg)',
                    border: '1px solid var(--border3)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontSize: '13px',
                    color: 'var(--text2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginTop: '4px'
                  }}>
                    <span style={{ fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
                      📨 元の受信メール:
                    </span>
                    <div style={{ 
                      whiteSpace: 'pre-wrap', 
                      maxHeight: '140px', 
                      overflowY: 'auto', 
                      lineHeight: 1.5,
                      fontFamily: 'monospace',
                      fontSize: '12.5px',
                      background: 'var(--panel)',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border3)'
                    }}>
                      {originalMailBody}
                    </div>
                  </div>
                )}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>本文:</span>
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={12}
                    style={{
                      width: '100%',
                      background: 'var(--bg)',
                      border: '1px solid var(--border3)',
                      borderRadius: '8px',
                      padding: '12px',
                      color: 'var(--text)',
                      fontSize: '14px',
                      lineHeight: 1.6,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* AI Revision Input */}
                <div style={{ 
                  background: 'var(--activebg)', 
                  padding: '16px', 
                  borderRadius: '10px', 
                  border: '1px solid var(--border3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>
                    AIに修正を指示する
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      value={draftInstruction}
                      onChange={(e) => setDraftInstruction(e.target.value)}
                      placeholder="例: もう少し丁寧な表現にして、金曜日に調整したいと追記して..."
                      style={{
                        flex: 1,
                        background: 'var(--panel)',
                        border: '1px solid var(--border3)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: 'var(--text)',
                        fontSize: '13px'
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleReviseDraft();
                      }}
                    />
                    <button
                      onClick={handleReviseDraft}
                      disabled={revisingDraft || !draftInstruction.trim()}
                      style={{
                        padding: '8px 16px',
                        background: 'var(--accent)',
                        color: 'var(--on-accent)',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: (revisingDraft || !draftInstruction.trim()) ? 0.6 : 1
                      }}
                    >
                      {revisingDraft ? '修正中...' : '指示を送る'}
                    </button>
                  </div>
                </div>

                {/* Sender Action Buttons */}
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'end', marginTop: '8px' }}>
                  <button
                    onClick={() => setEditingDraftNotifId(null)}
                    style={{
                      padding: '10px 20px',
                      background: 'var(--activebg)',
                      border: '1px solid var(--border3)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    戻る
                  </button>
                  <button
                    onClick={handleSendDraft}
                    disabled={sendingDraft}
                    style={{
                      padding: '10px 24px',
                      background: '#10B981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: sendingDraft ? 0.6 : 1
                    }}
                  >
                    {sendingDraft ? '送信中...' : '✉ メールを送信する'}
                  </button>
                </div>
              </div>
            ) : (
              // Normal Notification Card view
              <>
                {/* Category badge & Person association */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '12px',
                    background: currentNotif.category === 'decision' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(45, 212, 191, 0.15)',
                    color: currentNotif.category === 'decision' ? '#F59E0B' : '#2DD4BF',
                    border: `1px solid ${currentNotif.category === 'decision' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(45, 212, 191, 0.3)'}`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {currentNotif.category === 'decision' ? '判断が必要' : '通知のみ'}
                  </span>
                  
                  {/* Person card association */}
                  {currentNotif.actions.find(act => act.type === 'reply_draft')?.metadata?.person_id && (
                    <span style={{
                      fontSize: '11px',
                      background: 'rgba(45, 212, 191, 0.1)',
                      color: 'var(--accent)',
                      border: '1px solid rgba(45, 212, 191, 0.3)',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      cursor: onSelectPerson ? 'pointer' : 'default',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(45, 212, 191, 0.18)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(45, 212, 191, 0.1)'}
                    onClick={() => {
                      const repAct = currentNotif.actions.find(act => act.type === 'reply_draft');
                      if (onSelectPerson && repAct?.metadata?.person_id && repAct?.metadata?.person_name) {
                        onSelectPerson({
                          id: repAct.metadata.person_id,
                          name: repAct.metadata.person_name,
                          email: repAct.metadata.to || '',
                          company: '',
                          role: '',
                          phone: '',
                          address: '',
                          postal_code: '',
                          hobbies: '',
                          notes: ''
                        });
                      }
                    }}
                    >
                      👤 {currentNotif.actions.find(act => act.type === 'reply_draft')?.metadata?.person_name} 様の名刺へ紐付け済
                    </span>
                  )}
                </div>

                {/* Title */}
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  {currentNotif.title}
                </h2>

                {/* Summary Box */}
                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border3)',
                  borderRadius: '8px',
                  padding: '20px',
                  fontSize: '14px',
                  lineHeight: 1.6,
                  color: 'var(--text2)',
                  whiteSpace: 'pre-wrap'
                }}>
                  {currentNotif.content}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                  {hasRollback ? (
                    <>
                      <button
                        onClick={() => handleRollback(currentNotif.id)}
                        style={{
                          flex: 1,
                          padding: '14px 20px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#EF4444',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          borderRadius: '10px',
                          fontWeight: 600,
                          fontSize: '14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'transform 0.15s ease, background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        }}
                      >
                        <span>↩</span> 元に戻す
                      </button>
                      <button
                        onClick={handleNext}
                        style={{
                          flex: 1,
                          padding: '14px 20px',
                          background: 'var(--accent)',
                          color: 'var(--on-accent)',
                          border: 'none',
                          borderRadius: '10px',
                          fontWeight: 600,
                          fontSize: '14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'transform 0.15s ease, filter 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.filter = 'brightness(1.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.filter = 'none';
                        }}
                      >
                        確定 (次へ)
                      </button>
                    </>
                  ) : currentNotif.category === 'decision' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                      {currentNotif.actions.map((act, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleAction(act)}
                          style={{
                            padding: '14px 20px',
                            background: act.type === 'snooze' ? 'var(--activebg)' : 'var(--accent)',
                            color: act.type === 'snooze' ? 'var(--text)' : 'var(--on-accent)',
                            border: act.type === 'snooze' ? '1px solid var(--border3)' : 'none',
                            borderRadius: '10px',
                            fontWeight: 600,
                            fontSize: '14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'transform 0.15s ease, filter 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.filter = 'brightness(1.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.filter = 'none';
                          }}
                        >
                          {act.type === 'reply_draft' && <span>✉</span>}
                          {act.type === 'calendar_add' && <span>📅</span>}
                          {act.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={handleNext}
                      style={{
                        width: '100%',
                        padding: '14px 20px',
                        background: 'var(--accent)',
                        color: 'var(--on-accent)',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 600,
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.15s ease, filter 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.filter = 'brightness(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.filter = 'none';
                      }}
                    >
                      {currentNotificationIndex < unreadNotifications.length - 1 ? '次へ →' : '完了'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--muted)',
            background: 'var(--panel)',
            borderRadius: '16px',
            border: '1px solid var(--border2)'
          }}>
            未読のお知らせはありません。
          </div>
        )}
      </div>
    );
  }

  // Detailed View for a Selected Event
  if (selectedEvent) {
    return (
      <EventDetailView
        token={token}
        event={selectedEvent}
        onBack={() => setSelectedEvent(null)}
        onSelectPerson={onSelectPerson}
      />
    );
  }

  const renderCalendarBox = () => {
    const isDraggingMe = draggedBox === 'calendar';
    const isDragOverMe = dragOverBox === 'calendar' && !isDraggingMe;

    return (
      <div
        key="calendar"
        draggable
        onDragStart={(e) => handleDragStart(e, 'calendar')}
        onDragOver={(e) => handleDragOver(e, 'calendar')}
        onDragLeave={() => handleDragLeave('calendar')}
        onDrop={(e) => handleDrop(e, 'calendar')}
        onDragEnd={handleDragEnd}
        style={{
          background: 'var(--panel)',
          border: isDragOverMe ? '2px dashed var(--accent)' : '1px solid var(--border2)',
          borderRadius: '16px',
          padding: '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isDragOverMe ? '0 8px 30px rgba(45, 212, 191, 0.2)' : '0 4px 20px rgba(0,0,0,0.03)',
          opacity: isDraggingMe ? 0.35 : 1,
          transform: isDragOverMe ? 'scale(1.01)' : 'scale(1)',
          transition: 'transform 0.15s ease, opacity 0.15s ease, border 0.15s ease, box-shadow 0.15s ease'
        }}
      >
        {/* Calendar Header with Drag Grip */}
        <div style={{
          borderBottom: '2px solid var(--border2)',
          paddingBottom: '20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              fontFamily: "'IBM Plex Mono', monospace"
            }}>
              TODAY'S SCHEDULE
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <span style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {yearStr}年{monthStr}月{dateStr}日
              </span>
              <span style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text2)' }}>
                ({dayOfWeekStr})
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={fetchCalendarEvents}
              disabled={loading}
              style={{
                padding: '8px 16px',
                background: 'var(--activebg)',
                border: '1px solid var(--border3)',
                borderRadius: '6px',
                color: 'var(--text2)',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                fontFamily: "'IBM Plex Mono', monospace"
              }}
            >
              {loading ? '更新中...' : '更新'}
            </button>
            {renderGripHandle()}
          </div>
        </div>

        {/* Unlinked Google Account State */}
        {!connectedStatus && !loading && (
          <div style={{
            padding: '24px',
            background: 'var(--bg)',
            border: '1px solid var(--border2)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>Google アカウント未連携</div>
            <p style={{ fontSize: '13px', color: 'var(--text3)', margin: 0, lineHeight: 1.6 }}>
              Google カレンダーのアカウント連携を行うと、本日の予定が自動表示されます。
            </p>
            <button
              onClick={onConnectGoogle}
              style={{
                marginTop: '4px',
                padding: '9px 18px',
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '12.5px',
                cursor: 'pointer'
              }}
            >
              Google アカウントと連携する
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{
            padding: '24px 0',
            fontSize: '13px',
            color: 'var(--muted)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>
            カレンダーデータを読み込んでいます...
          </div>
        )}

        {/* Today's Schedule Event List (Max 3 items) */}
        {connectedStatus && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Section: Today */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text2)', fontFamily: "'IBM Plex Mono', monospace" }}>
                本日の予定 ({limitedTodayEvents.length}件)
              </div>
              {limitedTodayEvents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {limitedTodayEvents.map(ev => renderEventCard(ev, ev.id === nextEventId))}
                </div>
              ) : (
                <div style={{
                  padding: '20px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border2)',
                  borderRadius: '8px',
                  color: 'var(--text3)',
                  fontSize: '13.5px'
                }}>
                  本日の予定はありません。
                </div>
              )}
            </div>

            {/* Section: Tomorrow (If next schedule is tomorrow, or tomorrow events exist) */}
            {(isNextEventTomorrow || (limitedTodayEvents.length < 3 && tomorrowEvents.length > 0)) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text2)', fontFamily: "'IBM Plex Mono', monospace" }}>
                    明日の予定 — {tomorrowYearStr}年{tomorrowMonthStr}月{tomorrowDateStr}日 ({tomorrowDayOfWeekStr})
                  </span>
                  {isNextEventTomorrow && (
                    <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>
                      (次の予定)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {limitedTomorrowEvents.map(ev => renderEventCard(ev, ev.id === nextEventId))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderAnnouncementsBox = () => {
    const isDraggingMe = draggedBox === 'announcements';
    const isDragOverMe = dragOverBox === 'announcements' && !isDraggingMe;
    
    const unreadNotifications = notifications.filter(n => !n.is_read);
    const hasUnread = unreadNotifications.length > 0;

    return (
      <div
        key="announcements"
        draggable
        onDragStart={(e) => handleDragStart(e, 'announcements')}
        onDragOver={(e) => handleDragOver(e, 'announcements')}
        onDragLeave={() => handleDragLeave('announcements')}
        onDrop={(e) => handleDrop(e, 'announcements')}
        onDragEnd={handleDragEnd}
        style={{
          background: 'var(--panel)',
          border: isDragOverMe ? '2px dashed var(--accent)' : '1px solid var(--border2)',
          borderRadius: '16px',
          padding: '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: isDragOverMe ? '0 8px 30px rgba(45, 212, 191, 0.2)' : '0 4px 20px rgba(0,0,0,0.03)',
          opacity: isDraggingMe ? 0.35 : 1,
          transform: isDragOverMe ? 'scale(1.01)' : 'scale(1)',
          transition: 'transform 0.15s ease, opacity 0.15s ease, border 0.15s ease, box-shadow 0.15s ease'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '12px'
        }}>
          <div style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.01em'
          }}>
            Sparkからのお知らせ
          </div>
          {renderGripHandle()}
        </div>

        {hasUnread ? (
          <div style={{
            padding: '24px',
            background: 'rgba(45, 212, 191, 0.05)',
            border: '1px solid var(--accent)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              未確認のお知らせが {unreadNotifications.length} 件あります
            </div>
            <button
              onClick={() => {
                setViewingNotifications(true);
                setCurrentNotificationIndex(0);
              }}
              style={{
                padding: '10px 20px',
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(45, 212, 191, 0.2)',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
            >
              お知らせを確認する ({unreadNotifications.length}件)
            </button>
          </div>
        ) : (
          <div style={{
            padding: '28px 20px',
            background: 'var(--bg)',
            border: '1px dashed var(--border3)',
            borderRadius: '8px',
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '13px',
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.05em'
          }}>
            新しいお知らせはありません。
          </div>
        )}
      </div>
    );
  };

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
      maxWidth: '900px',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {boxOrder.map(boxId => {
        if (boxId === 'calendar') return renderCalendarBox();
        if (boxId === 'announcements') return renderAnnouncementsBox();
        return null;
      })}
    </div>
  );
};
