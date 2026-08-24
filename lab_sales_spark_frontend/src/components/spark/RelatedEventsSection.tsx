import React from 'react';
import { RelatedEvent } from '../../types/chat';

interface RelatedEventsSectionProps {
  relatedEvents?: RelatedEvent[];
  onSelectEvent?: (eventId: string) => void;
}

export const RelatedEventsSection: React.FC<RelatedEventsSectionProps> = ({
  relatedEvents = [],
  onSelectEvent
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
            CONNECTED TIMELINE
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            関連する予定
          </div>
        </div>
      </div>

      {/* Content Area */}
      {relatedEvents.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {relatedEvents.map(ev => (
            <div
              key={ev.id}
              onClick={() => onSelectEvent?.(ev.id)}
              style={{
                padding: '14px 18px',
                background: 'var(--bg)',
                border: '1px solid var(--border2)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: onSelectEvent ? 'pointer' : 'default'
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{ev.title}</div>
              <div style={{ fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text3)' }}>{ev.dateStr}</div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State / Coming Soon Placeholder */
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
          coming soon...
        </div>
      )}
    </div>
  );
};
