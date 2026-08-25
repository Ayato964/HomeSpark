import React from 'react';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ isOpen, onClose }) => {
  const [appVersion, setAppVersion] = React.useState<string>('3.1.15');

  React.useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getAppVersion) {
      (window as any).electronAPI.getAppVersion().then((v: string) => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        width: '580px',
        maxHeight: '82vh',
        background: 'var(--panel)',
        border: '1px solid var(--border3)',
        borderRadius: '18px',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--topbar)'
        }}>
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', fontFamily: "'IBM Plex Sans', sans-serif" }}>
              リリースノート
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
              justifyContent: 'center'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        
        {/* Body */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {/* Latest Version */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, background: '#4285F4', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.{appVersion}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-08-25</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>Google Workspace / Material Design 3 スタイルへの全面刷新</strong>: アプリ全体の UI から絵文字を完全根絶し、洗練されたインライン SVG アイコン、G カラーアクセント、プロフェッショナルな状態インジケーターに統一。</li>
              <li><strong>動的バックエンドポート解決プロトコル</strong>: 他の常駐アプリとのポート競合を 100% 排除し、OS 動的ポートによる確実なプロセス間同期通信を実現。</li>
              <li><strong>FastAPI バックエンドインポートの完全修復</strong>: 自己完結型 Python ランタイム（Python Embeddable 3.10）における起動時インポートエラーを解消し、GPU の有無に関係なく即時起動を達成。</li>
              <li><strong>ワンクリック自動更新パイプラインの確立</strong>: アプリ内からのワンクリック更新および差分ダウンロードのファイル名命名規則を完全同期。</li>
            </ul>
          </div>

          {/* ver 3.0 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.3.0.0</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-08-25</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>デスクトップアプリ版（Electron）＆ Web版 両立システム</strong>: システムトレイ常駐、グローバルショートカット（Ctrl+Alt+J）、内蔵 Python 管理、専用タイトルバーを備えたデスクトップアプリ版を新設。</li>
              <li><strong>オブジェクト指向 Storage 切替システム</strong>: 設定画面から「ローカル保存 (SQLite)」と「クラウド保存 (PostgreSQL)」をワンクリックで動的切替可能に。</li>
              <li><strong>常駐字幕オーバーレイ（HUD Overlay ピル）</strong>: バックグラウンド作業中も画面最下部に字幕ピルが滑らかに浮き上がり、リアルタイムに会話内容を表示。</li>
              <li><strong>リアルタイム常時音声会話モード</strong>: 画面遷移を問わず手ぶらで話しかけられる常駐音声会話モードを新設。</li>
              <li><strong>専属秘書「GeMo（ジェモ）」ペルソナ統合</strong>: チャット・音声会話の全システムプロンプトに専属秘書 GeMo を統合。</li>
              <li><strong>長期記憶（Skills）アーカイブ</strong>: 会話の自動議事録化と過去記憶検索ツール（search_past_memories）を実装。</li>
              <li><strong>汎用 IMAP / SMTP 外部メール連携</strong>: 独自ドメインメールや各社メールプロバイダの送受信ツールを統合。</li>
              <li><strong>リアルタイム Web 検索ツール</strong>: 最新ニュースや企業・人物情報をネットからリアルタイムにリサーチして回答。</li>
            </ul>
          </div>
        </div>
        
        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border2)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'var(--topbar)'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 18px',
              background: '#4285F4',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
