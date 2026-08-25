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
        <span style={{ width: '18px', height: '18px', background: 'var(--accent)', flex: 'none' }}></span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '15px', fontWeight: 600, letterSpacing: '.10em' }}>HOMESPARK</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '9.5px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '.05em' }}>GeMo ver.3.0</span>
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
                gap: '5px'
              }}
            >
              <span>💬</span> Chat
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
                gap: '5px'
              }}
            >
              <span>✨</span> GeMo (秘書)
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
                borderRadius: '20px' 
              }}
            >
              <span>＋ 新しいチャット</span>
              <span style={{ color: 'var(--muted)', fontSize: '11px' }}>⌘N</span>
            </button>
          </div>

          {/* Search Placeholder */}
          <div style={{ padding: '0 14px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 11px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
                <circle cx="11" cy="11" r="7"/>
                <line x1="21" y1="21" x2="16.5" y2="16.5"/>
              </svg>
              <span style={{ fontSize: '12.5px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono',monospace" }}>search…</span>
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
                        fontSize: '12px',
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
                      🗑️
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
            // SPARK メニュー
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
            <span>デジタル名刺</span>
          </button>
        </div>
      )}

      {/* Unauthenticated Placeholder */}
      {!user && (
        <div style={{ flex: 1, padding: '40px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', opacity: 0.85 }}>🔒</div>
          <p style={{ fontSize: '12.5px', color: 'var(--text3)', margin: 0, lineHeight: '1.6' }}>
            機能を利用するには<br />ログインが必要です。
          </p>
        </div>
      )}


      {/* User / Authentication Area */}
      <div ref={userMenuRef} style={{ position: 'relative' }}>
        {userMenuOpen && (
          <div style={{
            position: 'absolute',
            bottom: '48px',
            left: '12px',
            width: '180px',
            background: 'var(--panel)',
            border: '1px solid var(--border3)',
            borderRadius: '8px',
            boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
            zIndex: 10,
            padding: '4px 0',
          }}>
            <button
              onClick={onOpenReleaseNotes}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: '12.5px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span>🚀</span> リリースノート
            </button>
            {/* Realtime Call Toggle (Desktop & GPU only) */}
            {isVoiceCallSupported && (
              <div
                onClick={onToggleRealtimeCall}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                title="オンにするとAIが常に待機し、マイクボタンはミュート切り替えになります"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text)' }}>
                  <span>🎙️</span>
                  <span>リアルタイム呼び出し</span>
                </div>
                <div style={{
                  width: '32px',
                  height: '18px',
                  borderRadius: '10px',
                  background: realtimeCallEnabled ? 'var(--accent)' : 'var(--border3)',
                  position: 'relative',
                  transition: 'background 0.2s ease',
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: '2px',
                    left: realtimeCallEnabled ? '16px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
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
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: '12.5px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span>👤</span> プロフィールを編集
            </button>
            {onOpenImapSettings && (
              <button
                onClick={() => {
                  onOpenImapSettings();
                  onToggleUserMenu();
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  fontSize: '12.5px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>📧</span> 外部メール連携 (IMAP)
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
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  fontSize: '12.5px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>⚙️</span> 環境設定 (保存先切替など)
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
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: '#EF4444',
                  fontFamily: 'inherit',
                  fontSize: '12.5px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.2s ease',
                  borderTop: '1px solid var(--border2)'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>🚪</span> ログアウト
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
                background: googleLinked ? 'rgba(45,212,191,0.08)' : 'var(--panel)',
                cursor: googleConfigured ? 'pointer' : 'not-allowed',
                opacity: googleConfigured ? 1 : 0.55,
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
                color: googleLinked ? 'var(--accent)' : 'var(--muted)',
                border: '1px solid var(--border3)',
                padding: '1px 4px',
                borderRadius: '4px',
              }}>
                {googleLinked ? '連携済' : '未連携'}
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
              padding: '13px 16px', 
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
                style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }} 
              />
            ) : (
              <span style={{ 
                width: '26px', 
                height: '26px', 
                background: 'var(--panel)', 
                border: '1px solid var(--border3)', 
                flex: 'none', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontFamily: "'IBM Plex Mono',monospace", 
                fontSize: '11px', 
                color: 'var(--accent)', 
                borderRadius: '50%' 
              }}>
                {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
              </span>
            )}
            <span style={{ 
              flex: 1, 
              fontSize: '12.5px', 
              fontWeight: 500, 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis' 
            }}>
              {user.displayName || user.email?.split('@')[0]}
            </span>
            <span style={{ 
              fontFamily: "'IBM Plex Mono',monospace", 
              fontSize: '8.5px', 
              letterSpacing: '.12em', 
              color: 'var(--muted)',
              border: '1px solid var(--border3)',
              padding: '1px 4px',
              borderRadius: '4px',
              background: 'var(--panel)'
            }}>
              {user.uid.startsWith('mock-user') ? 'MOCK' : 'USER'}
            </span>
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
                padding: '9px 12px', 
                border: '1px solid var(--border3)', 
                background: 'var(--panel)', 
                cursor: 'pointer', 
                fontFamily: "'IBM Plex Sans',system-ui,sans-serif", 
                fontSize: '12.5px', 
                fontWeight: 600,
                color: 'var(--text)', 
                borderRadius: '10px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                transition: 'background 0.2s, border-color 0.2s'
              }}
              onMouseEnter={(e) => { 
                e.currentTarget.style.background = 'var(--hover)'; 
                e.currentTarget.style.borderColor = 'var(--accent)'; 
              }}
              onMouseLeave={(e) => { 
                e.currentTarget.style.background = 'var(--panel)'; 
                e.currentTarget.style.borderColor = 'var(--border3)'; 
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
