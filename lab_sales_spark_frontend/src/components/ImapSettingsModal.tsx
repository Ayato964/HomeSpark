import React, { useState, useEffect } from 'react';
import { ImapAccount } from '../types/chat';
import { ChatService } from '../services/ChatService';

interface ImapSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
}

interface Preset {
  name: string;
  imap_host: string;
  imap_port: number;
  imap_ssl: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_ssl: boolean;
}

const PRESETS: Record<string, Preset> = {
  custom: {
    name: 'カスタム設定 (独自ドメイン等)',
    imap_host: '',
    imap_port: 993,
    imap_ssl: true,
    smtp_host: '',
    smtp_port: 465,
    smtp_ssl: true,
  },
  sakura: {
    name: 'さくらインターネット',
    imap_host: 'mail.sakura.ne.jp',
    imap_port: 993,
    imap_ssl: true,
    smtp_host: 'mail.sakura.ne.jp',
    smtp_port: 465,
    smtp_ssl: true,
  },
  xserver: {
    name: 'エックスサーバー (sv*.xserver.jp)',
    imap_host: 'sv1.xserver.jp',
    imap_port: 993,
    imap_ssl: true,
    smtp_host: 'sv1.xserver.jp',
    smtp_port: 465,
    smtp_ssl: true,
  },
  yahoo: {
    name: 'Yahoo!メール (要アプリパスワード)',
    imap_host: 'imap.mail.yahoo.co.jp',
    imap_port: 993,
    imap_ssl: true,
    smtp_host: 'smtp.mail.yahoo.co.jp',
    smtp_port: 465,
    smtp_ssl: true,
  },
  outlook: {
    name: 'Outlook / Office 365',
    imap_host: 'outlook.office365.com',
    imap_port: 993,
    imap_ssl: true,
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    smtp_ssl: true,
  },
};

export const ImapSettingsModal: React.FC<ImapSettingsModalProps> = ({
  isOpen,
  onClose,
  token,
}) => {
  const [accounts, setAccounts] = useState<ImapAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // Form State
  const [presetKey, setPresetKey] = useState<string>('custom');
  const [label, setLabel] = useState<string>('会社メール');
  const [emailAddress, setEmailAddress] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [imapHost, setImapHost] = useState<string>('');
  const [imapPort, setImapPort] = useState<number>(993);
  const [imapSsl, setImapSsl] = useState<boolean>(true);
  const [smtpHost, setSmtpHost] = useState<string>('');
  const [smtpPort, setSmtpPort] = useState<number>(465);
  const [smtpSsl, setSmtpSsl] = useState<boolean>(true);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Testing & Error State
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const chatService = new ChatService();

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const accs = await chatService.getImapAccounts(token);
      setAccounts(accs);
    } catch (e) {
      console.error('Failed to fetch IMAP accounts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
      setShowAddForm(false);
      setTestResult(null);
      setSubmitError(null);
    }
  }, [isOpen]);

  const handlePresetChange = (key: string) => {
    setPresetKey(key);
    const p = PRESETS[key];
    if (p) {
      setImapHost(p.imap_host);
      setImapPort(p.imap_port);
      setImapSsl(p.imap_ssl);
      setSmtpHost(p.smtp_host);
      setSmtpPort(p.smtp_port);
      setSmtpSsl(p.smtp_ssl);
      if (key !== 'custom') {
        setShowAdvanced(true);
      }
    }
  };

  const handleTestConnection = async () => {
    const payload = {
      imap_host: imapHost.trim(),
      imap_port: imapPort,
      imap_ssl: imapSsl,
      smtp_host: smtpHost.trim(),
      smtp_port: smtpPort,
      smtp_ssl: smtpSsl,
      username: (username || emailAddress).trim(),
      password: password.trim(),
    };

    if (!payload.imap_host || !payload.username || !payload.password) {
      setTestResult({ success: false, error: 'IMAPホスト、ユーザー名、パスワードを入力してください。' });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const res = await chatService.testImapAccount(token, payload);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message || '接続テストに失敗しました。' });
    } finally {
      setTesting(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const payload = {
      label: label.trim() || '外部メール',
      email_address: emailAddress.trim(),
      username: (username || emailAddress).trim(),
      password: password.trim(),
      imap_host: imapHost.trim(),
      imap_port: Number(imapPort) || 993,
      imap_ssl: imapSsl,
      smtp_host: smtpHost.trim() || null,
      smtp_port: smtpHost.trim() ? (Number(smtpPort) || 465) : null,
      smtp_ssl: smtpSsl,
    };

    if (!payload.email_address || !payload.imap_host || !payload.password) {
      setSubmitError('メールアドレス、IMAPホスト、パスワードは必須です。');
      return;
    }

    try {
      setLoading(true);
      await chatService.createImapAccount(token, payload);
      await fetchAccounts();
      setShowAddForm(false);
      // Reset form
      setLabel('会社メール');
      setEmailAddress('');
      setUsername('');
      setPassword('');
      setImapHost('');
      setSmtpHost('');
    } catch (e: any) {
      setSubmitError(e.message || 'アカウントの登録に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!window.confirm('この外部メールアカウント連携を解除しますか？')) return;
    try {
      setLoading(true);
      await chatService.deleteImapAccount(token, id);
      await fetchAccounts();
    } catch (e) {
      console.error('Failed to delete IMAP account:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '16px'
    }} onClick={onClose}>
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border3)',
        borderRadius: '18px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
        color: 'var(--text)',
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em' }}>
              外部メール連携 (IMAP / SMTP)
            </h2>
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

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.5 }}>
            会社の独自ドメインメールや、さくら、エックスサーバー、Yahoo!、Outlook などのメールアカウントを連携し、GeMo にメールの確認・検索・送信を行わせることができます。
          </p>

          {/* Accounts List */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>連携中のアカウント ({accounts.length})</span>
              {!showAddForm && (
                <button
                  onClick={() => {
                    setShowAddForm(true);
                    setTestResult(null);
                  }}
                  style={{
                    background: '#4285F4',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  アカウントを追加
                </button>
              )}
            </div>

            {accounts.length === 0 && !showAddForm ? (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                background: 'var(--bg)',
                borderRadius: '12px',
                border: '1px dashed var(--border2)',
                color: 'var(--text3)',
                fontSize: '12.5px'
              }}>
                連携中の外部メールアカウントはありません。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {accounts.map(acc => (
                  <div key={acc.id} style={{
                    padding: '12px 16px',
                    background: 'var(--bg)',
                    borderRadius: '10px',
                    border: '1px solid var(--border2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{acc.label}</span>
                        <span style={{ fontSize: '10px', color: '#4285F4', background: 'rgba(66, 133, 244, 0.1)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>IMAP</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{acc.email_address}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                        {acc.imap_host}:{acc.imap_port} (SSL: {acc.imap_ssl ? 'ON' : 'OFF'})
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteAccount(acc.id)}
                      title="連携を解除"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border2)',
                        color: '#EA4335',
                        borderRadius: '6px',
                        padding: '5px 10px',
                        fontSize: '11.5px',
                        cursor: 'pointer'
                      }}
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Account Form */}
          {showAddForm && (
            <form onSubmit={handleAddAccount} style={{
              marginTop: '8px',
              padding: '18px',
              background: 'var(--bg)',
              borderRadius: '12px',
              border: '1px solid rgba(66, 133, 244, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#4285F4' }}>新規外部メールの追加</span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '12px' }}
                >
                  キャンセル
                </button>
              </div>

              {/* Preset Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text2)', marginBottom: '4px' }}>
                  プロバイダ・プリセット
                </label>
                <select
                  value={presetKey}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border2)',
                    background: 'var(--panel)',
                    color: 'var(--text)',
                    fontSize: '12.5px',
                    outline: 'none'
                  }}
                >
                  {Object.entries(PRESETS).map(([k, p]) => (
                    <option key={k} value={k}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Label & Email */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text2)', marginBottom: '4px' }}>表示ラベル</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="例: 会社メール"
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border2)', background: 'var(--panel)', color: 'var(--text)', fontSize: '12.5px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text2)', marginBottom: '4px' }}>メールアドレス</label>
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => {
                      setEmailAddress(e.target.value);
                      if (!username) setUsername(e.target.value);
                    }}
                    placeholder="name@company.co.jp"
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border2)', background: 'var(--panel)', color: 'var(--text)', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              {/* Username & Password */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text2)', marginBottom: '4px' }}>ユーザー名 (ログインID)</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="メールアドレスまたはID"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border2)', background: 'var(--panel)', color: 'var(--text)', fontSize: '12.5px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text2)', marginBottom: '4px' }}>パスワード</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border2)', background: 'var(--panel)', color: 'var(--text)', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              {/* Advanced Server Settings Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(prev => !prev)}
                  style={{ background: 'transparent', border: 'none', color: '#4285F4', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                >
                  {showAdvanced ? '▼ サーバー詳細設定を閉じる' : '▶ サーバー詳細設定（ホスト・ポート番号）'}
                </button>
              </div>

              {showAdvanced && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--panel)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border2)' }}>
                  {/* IMAP */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>IMAP サーバーホスト</label>
                      <input
                        type="text"
                        value={imapHost}
                        onChange={(e) => setImapHost(e.target.value)}
                        placeholder="mail.company.co.jp"
                        required
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>ポート (SSL:993)</label>
                      <input
                        type="number"
                        value={imapPort}
                        onChange={(e) => setImapPort(Number(e.target.value))}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px' }}
                      />
                    </div>
                  </div>

                  {/* SMTP */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>SMTP サーバーホスト</label>
                      <input
                        type="text"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="mail.company.co.jp"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>ポート (465/587)</label>
                      <input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(Number(e.target.value))}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Test Result Message */}
              {testResult && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  background: testResult.success ? 'rgba(52, 168, 83, 0.1)' : 'rgba(234, 67, 53, 0.1)',
                  color: testResult.success ? '#34A853' : '#EA4335',
                  border: `1px solid ${testResult.success ? 'rgba(52, 168, 83, 0.25)' : 'rgba(234, 67, 53, 0.25)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    {testResult.success ? (
                      <polyline points="20 6 9 17 4 12"/>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </>
                    )}
                  </svg>
                  {testResult.success ? (testResult.message || '接続に成功しました') : testResult.error}
                </div>
              )}

              {submitError && (
                <div style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', background: 'rgba(234, 67, 53, 0.1)', color: '#EA4335', border: '1px solid rgba(234, 67, 53, 0.25)' }}>
                  {submitError}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  style={{
                    background: 'var(--panel)',
                    color: 'var(--text)',
                    border: '1px solid var(--border2)',
                    borderRadius: '8px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  {testing ? '接続テスト中...' : '接続テスト'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: '#4285F4',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '7px 18px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {loading ? '登録中...' : 'アカウントを保存'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
