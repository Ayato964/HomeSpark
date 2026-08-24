import React from 'react';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.45)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    }}>
      <div style={{
        width: '560px',
        maxHeight: '80vh',
        background: 'var(--panel)',
        border: '1px solid var(--border3)',
        borderRadius: '16px',
        boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--panel2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🚀</span>
            <span style={{ fontWeight: 600, fontSize: '15px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.05em' }}>RELEASE NOTES</span>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text3)',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>
        
        {/* Body */}
        <div style={{
          padding: '20px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {/* ver 3.0 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, background: 'var(--accent)', color: 'var(--on-accent)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.3.0</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-08-25</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>🖥️ デスクトップアプリ版（Electron / Chromium）＆ Web版 両立システム</strong>: タスクバー右下のシステムトレイ常駐、グローバルショートカット（`Ctrl + Alt + J` / `Cmd + Alt + J`）による即時ウィンドウ呼び出し、ローカル Python / TTS プロセスの自動起動・終了ライフサイクル管理、専用タイトルバーを備えたデスクトップアプリ版を新設。Webブラウザ版としても100%同一コードでそのまま稼働します。</li>
              <li><strong>🎙️ リアルタイム呼び出しモード（常時音声会話 & ミュート切替）</strong>: サイドバー設定からOnにすることで、画面遷移を問わず常に手ぶらで話しかけられる常駐音声会話モードを新設。マイクボタンはワンタップで「ミュート / ミュート解除」に切り替わります。</li>
              <li><strong>🎀 専属秘書ペルソナ「ジェニー」の誕生</strong>: チャット・音声会話の全システムプロンプトおよび即時相槌プリセットに、専属秘書「ジェニー（萌え萌えでしっかり者、アニメのような豊かなリアクション）」を統合しました。</li>
              <li><strong>🧠 会話内容要約サブエージェント & 長期記憶（Skills）アーカイブ</strong>: 会話が途切れて30分経過した際に、自動で議事録を生成し、メモリ上の生会話ログを全削除してトークン溢れを防止。直近の議事録はプロンプトに動的注入され、古い議事録は「Skills（長期記憶）」として自動アーカイブ保存されます。</li>
              <li><strong>🔍 過去記憶・スキル検索ツール (`search_past_memories`)</strong>: 「そういえば1年前のさ〜」「以前話した〇〇の件」といった質問に対して、AIが自律的に過去の議事録・記憶アーカイブを検索して正確に回答する Function Calling ツールを追加しました。</li>
              <li><strong>🛡️ 会話識別サブエージェント & `is_conv` 誤爆防止ステートマシン</strong>: 周囲の雑音・独り言・他人との会話をAIが勝手に拾って誤作動するのを防止。「ジェニー」等のウェイクワードや明確な指示がある時のみ対話を開始し、対話中（`is_conv = true`）は遅延ゼロでリアルタイム対話。用件完了時または20秒無音で自動待機復帰します。</li>
              <li><strong>📧 汎用 IMAP / SMTP 外部メール連携 (`list_external_emails`, `send_external_email`)</strong>: 会社の独自ドメインメールや、さくら、エックスサーバー、Yahoo!、Outlook などのメールアカウントを複数追加連携可能に。ワンクリック・プリセット設定と安全な接続テスト機能を備え、ジェニーが外部メールの確認・検索・送信を行えるようになりました。</li>
              <li><strong>🌐 リアルタイム・インターネット Web 検索ツール (`search_web`)</strong>: 最新ニュース、技術動向、トレンド、企業・人物情報、専門用語などをネットからリアルタイムにリサーチして回答できる Web Search 機能を統合しました。</li>
              <li><strong>🗣️ 発話蓄積バッファ & 沈黙デバウンス（850ms）による言い直し対応</strong>: 言い直しや息継ぎで直前の認識が消されたり、細切れに送信されてしまう問題を根本解決。850msの自然な沈黙を検知して1つのまとまった文章として送信する仕組みを導入しました。</li>
            </ul>
          </div>

          {/* ver 2.5 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.2.5</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-08-25</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>🎙️ 常時音声対話 & 途中割り込み（Barge-in / スムーズフェードアウト）</strong>: AI 発話中やツール実行中もマイク入力を停止せず常時リスニング。人間が話しかけた瞬間に AI 音声をスムーズにフェードアウト（約140ms）して即座に停止し、新しいターンを開始するバージインシステムを実装しました。</li>
              <li><strong>🔊 Zero-shot 音声クローニング & 2文スプリット合成</strong>: リファレンス音声（青山吉能さん）の声質を忠実に再現する Zero-shot Voice Clone 機構を統合。さらに TTS 生成を「2文ごと」にまとめることで、自然な抑揚と流暢な会話テンポを実現しました。</li>
              <li><strong>🔘 全画面共通のフローティング・マイクボタン（FAB） & 字幕オーバーレイ</strong>: Sparkデスク・名刺・チャットなどすべての画面下部中央に常時表示されるマイクボタンを新設。音声会話中はボタン上部に半透明の字幕ピルがリアルタイム表示されます。</li>
              <li><strong>🌤️ 高精度・多機能な天気予報ツール (`get_weather`) の新設</strong>: 今日・明日・明後日・今週末・1週間後・7日間の週間天気（天気・最高/最低気温・降水確率・傘の要否・アドバイス）を取得・回答できる Function Calling ツールを統合しました。</li>
              <li><strong>⚡ ツール実行時の即時ランダム相槌 & 重複発話ストリップ</strong>: カレンダーや天気などのツール実行待機中に「😆はい！お天気を調べてみますね」などの相槌を即座にランダム発話し、ツール完了後の回答と重複しないよう自動クレンジング処理を実装しました。</li>
              <li><strong>🔢 数字・時刻・金額のサニタイズ保持</strong>: Unicode 絵文字判定正規表現を見直し、「夜の9時です」などの数字が誤って消去される問題を根本修正しました。</li>
            </ul>
          </div>

          {/* ver 2.0 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.2.0</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-07-21</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>✨ Spark 2.0 メニュー切り替え (ホーム & デジタル名刺)</strong>: サイドバーの「✨ Spark (秘書)」モードから「ホーム (カレンダー・お知らせデスク)」と「デジタル名刺」画面をシームレスに切り替えられるようになりました。</li>
              <li><strong>📷 Gemma 4 Vision AI 名刺スキャナー & カメラ撮影機能</strong>: ブラウザ上で Web カメラを起動して名刺を撮影（または画像アップロード）すると、Gemma 4 ビジョン AI が名前・会社名・役職・メール・電話・会社住所・郵便番号・メモを視覚認識して自動入力フォームへ反映します。</li>
              <li><strong>📇 デジタル名刺 & 営業プロファイル管理 (検索・ソート・編集・削除)</strong>: 顧客や営業相手のプロファイルを記録・編集・削除できます。登録日時の表示、未入力項目の表示対応、名前・住所・郵便番号によるリアルタイム検索およびソート機能に対応しました。</li>
              <li><strong>📅 カレンダー連動ナビゲーション</strong>: カレンダーの予定詳細画面に含まれる登場人物をクリックすると、該当人物のデジタル名刺（プロファイル詳細）へ即座にダイレクト推移します。</li>
              <li><strong>🤖 AI チャットへのデジタル名刺操作ツールの統合</strong>: AI アシスタントがチャット会話の中で自発的にデジタル名刺の取得 (`get_digital_business_cards`)・検索 (`search_digital_business_cards`)・登録・編集 (`create_digital_business_card`)・削除を行える Function Calling ツール群を実装しました。</li>
            </ul>
          </div>

          {/* ver 1.5 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.1.5</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-07-21</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>Gemma 4 Tool Calling アルゴリズムの最適化</strong>: ネイティブの OpenAI 互換 `tools` パラメータを用いたツール呼び出しを標準化。APIエラー発生時にはプロンプト誘導（`prompted`）へ即座に動的フォールバックする安全機構を統合しました。</li>
              <li><strong>思考中＆ツール実行中UIのリアルタイム表示改善</strong>: 通常の回答生成中は「…」とシンプルに表現し、ツール実行中のみ「[ツール名] のツールを使っています・・」と実行されている関数名をクリアに明示するUIへ変更しました。</li>
              <li><strong>Google Workspace ツール連携の信頼性向上</strong>: Google カレンダー（予定取得・追加）や Gmail 連携ツールのパースと出力クレンジングを強化し、誤作動を完全に防止しました。</li>
            </ul>
          </div>

          {/* ver 1.4 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.1.4</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-06-17</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>Firebase Authentication (Google Sign-In) 連携</strong>: Googleアカウントを用いたサインインおよびサインアウトをサポート。IDトークン（Bearer）によるセキュアなAPIアクセスに対応しました。</li>
              <li><strong>Firestoreによるチャット履歴CRUD管理</strong>: 過去のチャットセッションをクラウド保存。サイドバーからいつでも再開できるようになりました。また、不要なセッションの削除（ゴミ箱アイコン）にも対応。</li>
              <li><strong>ローカルモックログインフォールバック</strong>: Firebaseの環境設定が無いローカル環境でもスムーズに開発ができるよう、自動でモックユーザーに切り替えてテストできる仕組みを統合しました。</li>
            </ul>
          </div>

          {/* ver 1.3 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.1.3</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-06-17</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>マルチモーダルファイル添付の完全対応</strong>: チャットエリアに画像やその他のファイルを添付してAIへ送信できるようになりました。PDFやテキストなど画像以外の形式のファイル添付にもフル対応しています。</li>
              <li><strong>添付ファイルのプレビュー・描画改善</strong>: 画像以外のファイル（PDFやドキュメント等）を送信した際、チャット画面上でファイル名やMIMEタイプがわかりやすく表示されるカード型UIとして美しく描画されるようにしました。</li>
              <li><strong>API互換通信の最適化</strong>: クライアント側のメタデータをAPI送信前に除去するクレンジング処理を実装し、マルチモーダル入力スキーマとの完全な互換性を確保してエラー発生を防いでいます。</li>
            </ul>
          </div>

          {/* ver 1.2 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.1.2</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-06-17</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>マークダウンの完全サポート</strong>: チャット画面上のメッセージ内にて、見出し、箇条書き、太字、インラインコード、リンク、引用に加え、マークダウン形式のテーブルやリッチなコードブロックのレンダリングに対応しました。</li>
              <li><strong>ツールの実行状態のリアルタイム可視化</strong>: AIが思考・ツール実行を行っている間、どのツール（Web検索、ファイル書き込み等）を実行中なのかを「Webで調べています...」といった分かりやすい日本語でリアルタイムにインジケーター上に表示します。</li>
              <li><strong>詳細なツール実行履歴ログ</strong>: 会話の中にこれまでどのようなツールが実行され、成功したのかエラーになったのか（引数やエラーメッセージを含む）をログとして表示・保存するようになりました。</li>
              <li><strong>マークダウンパースの修正と最適化</strong>: Canvas プレビューにて日本語行の結合時に余計な半角スペースが入る不具合や、一般的なタイトルが消えてしまう不具合などのパースバグを包括的に解消しました。</li>
            </ul>
          </div>

          {/* ver 1.1 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.1.1</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-06-17</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>ダイナミックな背景グラデーションアニメーション</strong>: 背景の3重グラデーションを別々の独立要素として抽出し、AI of テキスト生成時（ストリーミングデータ受信中）にゆっくりとうごめき、呼吸するように明滅するアニメーションを適用しました。</li>
              <li><strong>テーマ切替時の滑らかなトランジション</strong>: ライトモードとダークモードの切り替え時に、グラデーションの光がふわっと広がってから吸い込まれるようにイージングして収束する視覚エフェクトを追加しました。</li>
            </ul>
          </div>

          {/* ver 1.0 */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, background: 'var(--border3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono', monospace" }}>ver.1.0</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>2026-06-16</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <li><strong>Sales Spark サービス起動</strong>: 「Sales Spark」の基本チャット機能、ドキュメントの自動抽出、サイドバーによる履歴管理、Canvasによるリッチな構造化ドキュメントプレビュー機能（PREVIEW/SOURCEタブ）を統合した初期バージョンです。</li>
            </ul>
          </div>
        </div>
        
        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border2)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'var(--panel2)'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'inherit',
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
