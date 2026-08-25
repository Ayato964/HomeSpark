import React, { useState } from 'react';
import { Convo } from '../types/chat';
import { UserProfile } from '../services/auth';

interface SidebarProps {
  convos: Record<string, Convo>;
  activeId: string;
  onSelectConvo: (id: string) => void;
  onNewChat: () => void;
  onDeleteConvo: (id: string) => void;
  user: UserProfile | null;
  onLogin: () => void;
  onLogout: () => void;
  googleLinked: boolean;
  googleConfigured: boolean;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  userMenuOpen: boolean;
  onToggleUserMenu: () => void;
  onOpenReleaseNotes: () => void;
  onOpenProfile?: () => void;
  onOpenImapSettings?: () => void;
  onOpenSettings?: () => void;
  userMenuRef: React.RefObject<HTMLDivElement | null>;
  appMode?: 'chat' | 'spark';
  onChangeAppMode?: (mode: 'chat' | 'spark') => void;
  sparkSubView?: 'home' | 'digital_business_card';
  onChangeSparkSubView?: (subView: 'home' | 'digital_business_card') => void;
  isVoiceCallActive?: boolean;
  onToggleVoiceCall?: () => void;
  realtimeCallEnabled?: boolean;
  onToggleRealtimeCall?: () => void;
  isVoiceCallSupported?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  convos,
  activeId,
  onSelectConvo,
  onNewChat,
  onDeleteConvo,
  user,
  onLogin,
  onLogout,
  googleLinked,
  googleConfigured,
  onConnectGoogle,
  onDisconnectGoogle,
  userMenuOpen,
  onToggleUserMenu,
  onOpenReleaseNotes,
  onOpenProfile,
  onOpenImapSettings,
  onOpenSettings,
  userMenuRef,
  appMode = 'chat',
  onChangeAppMode,
  sparkSubView = 'home',
  onChangeSparkSubView,
  isVoiceCallActive = false,
  onToggleVoiceCall,
  realtimeCallEnabled = false,
  onToggleRealtimeCall,
  isVoiceCallSupported = false,
}) => {
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);

  const handleGoogleClick = () => {
    if (googleLinked) {
      if (window.confirm('Google連携を解除しますか？（Calendar / Gmail へのアクセスが無効になります）')) {
        onDisconnectGoogle();
      }
    } else {
      onConnectGoogle();
    }
  };

  return (
    <aside style={{ 
      position: 'relative', 
      zIndex: 1, 
      width: '264px', 
      flex: 'none', 
      height: '100%', 
      background: 'var(--sidebar)', 
      backdropFilter: 'blur(14px)', 
      borderRight: '1px solid var(--border)', 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      {/* Title Header */}
      <div style={{ padding: '20px 18px 18px', display: 'flex', alignItems: 'center', gap: '11px' }}>
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '6px',
          background: 'linear-gradient(135deg, #4285F4 0%, #34A853 50%, #FBBC05 75%, #EA4335 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#0d0f17' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '15px', fontWeight: 600, letterSpacing: '.10em', color: 'var(--text)' }}>HOMESPARK</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '9.5px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '.05em' }}>GeMo 3.1.7</span>
        </div>
      </div>

      {/* App Mode Switcher (Chat / GeMo) */}
      {user && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{
            display: 'flex',
            background: 'var(--panel)',
            border: '1px solid var(--border2)',
            borderRadius: '20px',
            padding: '3px',
            gap: '2px'
          }}>
            <button
              onClick={() => onChangeAppMode?.('chat')}
              style={{
                flex: 1,
                padding: '7px 0',
                border: 'none',
                borderRadius: '16px',
                background: appMode === 'chat' ? 'var(--accent)' : 'transparent',
                color: appMode === 'chat' ? 'var(--on-accent)' : 'var(--text3)',
                fontWeight: appMode === 'chat' ? 600 : 400,
                fontSize: '11.5px',
                fontFamily: "'IBM Plex Mono',monospace",
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Chat
            </button>
            <button
              onClick={() => onChangeAppMode?.('spark')}
              style={{
                flex: 1,
                padding: '7px 0',
                border: 'none',
                borderRadius: '16px',
                background: appMode === 'spark' ? 'var(--accent)' : 'transparent',
                color: appMode === 'spark' ? 'var(--on-accent)' : 'var(--text3)',
                fontWeight: appMode === 'spark' ? 600 : 400,
                fontSize: '11.5px',
                fontFamily: "'IBM Plex Mono',monospace",
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              GeMo (秘書)
            </button>
          </div>
        </div>
      )}

      {/* Chat Mode Specific Controls (New Chat, Search, History) */}
      {user && appMode === 'chat' && (
        <>
          {/* New Chat Button */}
          <div style={{ padding: '0 14px 14px' }}>
            <button 
              onClick={onNewChat} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                width: '100%', 
                padding: '11px 13px', 
                border: '1px solid var(--border3)', 
                background: 'var(--activebg)', 
                cursor: 'pointer', 
                fontFamily: "'IBM Plex Mono',monospace", 
                fontSize: '12px', 
                letterSpacing: '.04em', 
                color: 'var(--text)', 
                borderRadius: '12px',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>新しいチャット</span>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: '11px' }}>Ctrl+N</span>
            </button>
          </div>

          {/* Search Placeholder */}
          <div style={{ padding: '0 14px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 11px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '10px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
                <circle cx="11" cy="11" r="7"/>
                <line x1="21" y1="21" x2="16.5" y2="16.5"/>
              </svg>
              <span style={{ fontSize: '12.5px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono',monospace" }}>検索…</span>
            </div>
          </div>

          {/* Chat History List */}
          <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px' }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--faint)', padding: '8px 10px 7px' }}>
              // 履歴
            </div>
            {Object.values(convos).map((cv) => {
              const active = cv.id === activeId;
              const isHovered = hoveredChatId === cv.id;
              
              return (
                <div
                  key={cv.id}
                  onClick={() => onSelectConvo(cv.id)}
                  onMouseEnter={() => setHoveredChatId(cv.id)}
                  onMouseLeave={() => setHoveredChatId(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '9px',
                    padding: active ? '9px 10px 9px 12px' : '9px 12px',
                    background: active ? 'var(--activebg)' : 'transparent',
                    cursor: 'pointer',
                    position: 'relative',
                    borderRadius: '8px',
                    marginBottom: '2px',
                    transition: 'background-color 0.15s ease'
                  }}
                >
                  <span style={{ width: '5px', height: '5px', background: active ? 'var(--accent)' : 'var(--faint)', flex: 'none', borderRadius: '50%' }}></span>
                  <span style={{ fontSize: '13px', color: active ? 'var(--text)' : 'var(--text2)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>{cv.title}</span>
                  
                  {isHovered && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`「${cv.title}」を削除してもよろしいですか？`)) {
                          onDeleteConvo(cv.id);
                        }
                      }}
                      title="チャット履歴を削除"
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text3)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'color 0.2s, background-color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#EF4444';
                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text3)';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  )}

                  {!isHovered && (
                    <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono',monospace" }}>{cv.time}</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Spark Mode Sidebar View */}
      {user && appMode === 'spark' && (
        <div style={{ flex: 1, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{
            fontFamily: "'IBM Plex Mono',monospace",
            fontSize: '10px',
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
            padding: '4px 10px 4px'
          }}>
            // SPARK ツール
          </div>

          {/* Home Button */}
          <button
            onClick={() => onChangeSparkSubView?.('home')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: sparkSubView === 'home' ? 'var(--activebg)' : 'transparent',
              border: sparkSubView === 'home' ? '1px solid var(--accent)' : '1px solid transparent',
              borderRadius: '8px',
              color: sparkSubView === 'home' ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer',
              fontWeight: sparkSubView === 'home' ? 600 : 500,
              fontSize: '13px',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>ホーム</span>
          </button>

          {/* Digital Business Card Button */}
          <button
            onClick={() => onChangeSparkSubView?.('digital_business_card')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: sparkSubView === 'digital_business_card' ? 'var(--activebg)' : 'transparent',
              border: sparkSubView === 'digital_business_card' ? '1px solid var(--accent)' : '1px solid transparent',
              borderRadius: '8px',
              color: sparkSubView === 'digital_business_card' ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer',
              fontWeight: sparkSubView === 'digital_business_card' ? 600 : 500,
              fontSize: '13px',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <span>デジタル名刺</span>
          </button>
        </div>
      )}

      {/* Unauthenticated Placeholder */}
      {!user && (
        <div style={{ flex: 1, padding: '40px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--panel)',
            border: '1px solid var(--border3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text3)', margin: 0, lineHeight: '1.6' }}>
            機能を利用するには<br />ログインが必要です。
          </p>
        </div>
      )}

      {/* User / Authentication Area (Google Professional Styled) */}
      <div ref={userMenuRef} style={{ position: 'relative' }}>
        {userMenuOpen && (
          <div style={{
            position: 'absolute',
            bottom: '52px',
            left: '12px',
            width: '210px',
            background: '#131722',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            zIndex: 10,
            padding: '6px',
          }}>
            <button
              onClick={onOpenReleaseNotes}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: '12.5px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderRadius: '8px',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <span>リリースノート</span>
            </button>

            {/* Realtime Call Toggle (Desktop & GPU only) */}
            {isVoiceCallSupported && (
              <div
                onClick={onToggleRealtimeCall}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                title="オンにするとAIが常に待機し、マイクボタンはミュート切り替えになります"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: 'var(--text)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                  <span>リアルタイム対話</span>
                </div>
                <div style={{
                  width: '28px',
                  height: '16px',
                  borderRadius: '10px',
                  background: realtimeCallEnabled ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
                  position: 'relative',
                  transition: 'background 0.2s ease',
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: '2px',
                    left: realtimeCallEnabled ? '14px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }} />
                </div>
              </div>
            )}

            <button
              onClick={() => {
                onOpenProfile?.();
                onToggleUserMenu();
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: '12.5px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderRadius: '8px',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>アカウント設定</span>
            </button>

            {onOpenImapSettings && (
              <button
                onClick={() => {
                  onOpenImapSettings();
                  onToggleUserMenu();
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  fontSize: '12.5px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderRadius: '8px',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <span>メール連携 (IMAP)</span>
              </button>
            )}

            {onOpenSettings && (
              <button
                onClick={() => {
                  onOpenSettings();
                  onToggleUserMenu();
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  fontSize: '12.5px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderRadius: '8px',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span>環境設定 (保存先切替)</span>
              </button>
            )}

            {user && (
              <button
                onClick={() => {
                  onLogout();
                  onToggleUserMenu();
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  color: '#EF4444',
                  fontFamily: 'inherit',
                  fontSize: '12.5px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderRadius: '8px',
                  transition: 'background 0.15s ease',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  marginTop: '4px'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span>ログアウト</span>
              </button>
            )}
          </div>
        )}

        {/* Google (Calendar + Gmail) integration */}
        {user && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px 4px' }}>
            <button
              onClick={handleGoogleClick}
              title={
                googleConfigured
                  ? (googleLinked ? 'クリックで連携を解除' : 'Calendar / Gmail を連携')
                  : 'バックエンドのGoogle OAuthが未設定です'
              }
              disabled={!googleConfigured}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                width: '100%',
                padding: '9px 12px',
                border: '1px solid var(--border3)',
                background: googleLinked ? 'rgba(66, 133, 244, 0.08)' : 'var(--panel)',
                cursor: googleConfigured ? 'pointer' : 'not-allowed',
                opacity: googleConfigured ? 1 : 0.6,
                fontFamily: "'IBM Plex Sans',system-ui,sans-serif",
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text)',
                borderRadius: '10px',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flex: 'none' }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              <span style={{ flex: 1, textAlign: 'left' }}>Google 連携</span>
              <span style={{
                fontFamily: "'IBM Plex Mono',monospace",
                fontSize: '8.5px',
                letterSpacing: '.1em',
                color: googleLinked ? '#4285F4' : 'var(--muted)',
                border: `1px solid ${googleLinked ? 'rgba(66, 133, 244, 0.4)' : 'var(--border3)'}`,
                padding: '1px 5px',
                borderRadius: '4px',
                background: googleLinked ? 'rgba(66, 133, 244, 0.1)' : 'transparent',
              }}>
                {googleLinked ? '連携中' : '未設定'}
              </span>
            </button>
          </div>
        )}

        {/* Profile Card / Login Button */}
        {user ? (
          <div 
            onClick={onToggleUserMenu}
            style={{ 
              borderTop: '1px solid var(--border)', 
              padding: '12px 14px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img 
                src={user.photoURL} 
                alt={user.displayName || "User"} 
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} 
              />
            ) : (
              <span style={{ 
                width: '28px', 
                height: '28px', 
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 
                border: '1px solid rgba(255, 255, 255, 0.12)', 
                flex: 'none', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontFamily: "'IBM Plex Mono',monospace", 
                fontSize: '11.5px', 
                fontWeight: 600,
                color: '#60a5fa', 
                borderRadius: '50%',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
              }}>
                {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
              </span>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ 
                fontSize: '12.5px', 
                fontWeight: 600, 
                whiteSpace: 'nowrap', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                color: 'var(--text)'
              }}>
                {user.displayName || user.email?.split('@')[0]}
              </span>
              <span style={{
                fontSize: '10.5px',
                color: 'var(--muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {user.email || 'ローカルセッション'}
              </span>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)', padding: '14px' }}>
            <button 
              onClick={onLogin} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px',
                width: '100%', 
                padding: '10px 12px', 
                border: '1px solid rgba(255, 255, 255, 0.15)', 
                background: 'linear-gradient(180deg, #1e2433 0%, #131722 100%)', 
                cursor: 'pointer', 
                fontFamily: "'IBM Plex Sans',system-ui,sans-serif", 
                fontSize: '12.5px', 
                fontWeight: 600, 
                color: '#ffffff', 
                borderRadius: '10px', 
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)', 
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => { 
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'; 
              }}
              onMouseLeave={(e) => { 
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; 
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Google でログイン
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
