import React from 'react';
import { APP_VERSION } from '../constants/version';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ isOpen, onClose }) => {
  const [appVersion, setAppVersion] = React.useState<string>(APP_VERSION);

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
          {/* Latest Version 3.3.2 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, background: '#4285F4', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.{appVersion}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-08-27</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>音声エンジンの起動中を「失敗」と表示しなくなりました</strong>: モデルの読み込みには 1〜2 分かかり、その間ポートは閉じています。起動診断がこれを接続失敗として ❌ 表示していました。「⏳ 読み込み中」と表示し、完了すると自動的に ✅ に切り替わります。</li>
              <li><strong>読み込み中のエンジンを強制終了しなくなりました</strong>: 起動時にポートが閉じていると別インスタンスを起動しようとして、読み込み中のエンジンと二重になっていました。</li>
              <li><strong>起動待ちでスプラッシュが固まらないように</strong>: 音声エンジンの初期化はバックグラウンドで待つようになり、アプリの起動が速くなります。</li>
              <li><strong>音声エンジンの状態を確認できるようになりました</strong>: 未起動 / 読み込み中 / 準備完了 / 初期化エラー を区別して表示します。</li>
              <li><strong>ローカル音声合成が起動できなかった問題を修正</strong>: 必要な音声コーデック (DAC-VAE) が導入されず、エンジンが起動直後に停止していました。あわせて Google 連携ライブラリとの依存衝突も解消しています。</li>
              <li><strong>GeMo の声で喋るようになりました</strong>: 声の参照音声がインストーラに含まれておらず、汎用音声で発話していました。</li>
            </ul>
          </div>

          {/* ver 3.3.1 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.3.3.1</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-08-27</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>再起動のたびにログイン・プロフィールがリセットされる問題を修正</strong>: 画面が毎回異なるポートで配信されていたため、ブラウザ保存領域が起動ごとに新規作成されていました。固定の内部アドレスに変更し、Google 連携とセッションが保持されるようになりました。</li>
              <li><strong>個人プロフィールが保存されるようになりました</strong>: 保存処理が未実装のままで、入力内容がどこにも記録されていませんでした。データベースに保存し、再起動後も引き継ぎます。</li>
              <li><strong>チャット履歴がアプリ更新で消える問題を修正</strong>: ローカルデータベースをアプリのインストール先から %APPDATA% に移動しました。既存のデータは初回起動時に自動移行されます。</li>
              <li><strong>音声エンジン導入の「CMake is not found」エラーを解消</strong>: ビルドが必要なパッケージをやめ、すべて配布済みバイナリで導入するようにしました。CMake や C++ ビルドツールは不要です。</li>
              <li><strong>GPU 搭載機に Irodori-TTS の導入をご案内</strong>: 対応 GPU があるのにローカル音声合成が未導入の場合、起動時に導入をお尋ねし、そのまま進捗つきで導入できるようになりました。</li>
              <li><strong>導入失敗時のエラー表示を改善</strong>: pip の終了コードだけでなく、原因と対処方法を日本語で表示します。</li>
            </ul>
          </div>

          {/* ver 3.3.0 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.3.3.0</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-08-26</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>GPU の有無で音声構成を自動的に切り替え</strong>: GPU 非搭載機は Web Speech API + クラウド STT を正式構成として扱い、起動診断でエラー表示されなくなりました。</li>
              <li><strong>ローカル音声エンジンのアプリ内インストール</strong>: 設定 &gt; 音声 &gt; 音声エンジン構成 から、音声認識 (CPU/GPU) と音声合成 Irodori-TTS を後から追加導入できます。進捗とログをその場で確認できます。</li>
              <li><strong>Google 連携の「Token used too early」エラーを解消</strong>: PC の時計が数十秒ずれていても id_token 検証が失敗しないよう許容誤差を導入しました。</li>
              <li><strong>ログインをスキップした直後に音声チェックが再実行される問題を修正</strong>: 起動診断は 1 回の起動につき 1 度だけ実行されます。</li>
              <li><strong>「Spark からのお知らせ」を一度閉じたら再表示しないように</strong>: 時間帯ごとに既読フラグを保持するようになりました。</li>
              <li><strong>起動診断の精度向上</strong>: 実際に使用中の TTS ポートを表示し、音声認識の結果も総合判定に反映するようになりました。</li>
            </ul>
          </div>

          {/* ver 3.2.0 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.3.2.0</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-08-26</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>日本語特化蒸留モデル `Kotoba-Whisper-v2.0` のローカル内蔵</strong>: 従来の large-v3 比で約6倍高速・VRAM約750MBの極小化と高精度な日本語認識をローカル完全完結。</li>
              <li><strong>無料クラウドSTT (Groq / Gemini 2.0 Flash) 最適化</strong>: クラウド音声認識の優先利用により 100〜250ms の超高速ターン処理に対応。</li>
              <li><strong>発話終了後0.5秒での即時ターン発火</strong>: 無音検知を 500ms（助詞判定スマートバッファ付き）に短縮し、圧倒的にスムーズな会話体験を実現。</li>
              <li><strong>プロンプト＆字幕の絵文字・不要字幕完全根絶</strong>: AI応答、相槌、字幕HUDから絵文字および「お話しください...」等の待機字幕を完全削除。</li>
              <li><strong>5段階起動診断＆ワンクリックログコピー機能</strong>: 起動時に音声・DB・モデルのヘルスチェックを自動実行し、エラーログのコピーに対応。</li>
            </ul>
          </div>

          {/* ver 3.1.15 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.3.1.15</span>
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
