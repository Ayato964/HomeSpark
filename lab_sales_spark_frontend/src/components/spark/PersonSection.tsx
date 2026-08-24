import React from 'react';
import { Person } from '../../types/chat';

interface PersonSectionProps {
  people?: Person[];
  onAddPerson?: () => void;
  onSelectPerson?: (person: Person) => void;
}

export const PersonSection: React.FC<PersonSectionProps> = ({
  people = [],
  onSelectPerson,
}) => {
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border2)',
      borderRadius: '16px',
      padding: '28px 32px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
    }}>
      {/* Section Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '14px'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>
            PEOPLE & CONTACTS
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            人物
          </div>
        </div>
      </div>

      {/* Content Area */}
      {people.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {people.map(p => (
            <div
              key={p.id}
              onClick={() => onSelectPerson && onSelectPerson(p)}
              title="クリックしてデジタル名刺を表示"
              style={{
                padding: '12px 16px',
                background: 'var(--bg)',
                border: '1px solid var(--border2)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.transform = 'translateX(2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border2)';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                {p.company && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{p.company} {p.role ? `(${p.role})` : ''}</div>}
              </div>
              {p.email && <div style={{ fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)' }}>{p.email}</div>}
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div style={{
          padding: '24px 20px',
          background: 'var(--bg)',
          border: '1px dashed var(--border3)',
          borderRadius: '8px',
          textAlign: 'center',
          color: 'var(--text3)',
          fontSize: '13px',
          lineHeight: 1.6
        }}>
          検出された人物はありません。<br />
          右上にある「AIで人物・関連情報を解析」ボタンを押すと、この予定から人物が自動抽出・紐付けされます。
        </div>
      )}
    </div>
  );
};
