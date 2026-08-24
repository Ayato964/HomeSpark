import React from 'react';
import {
  CustomDiagram,
  CalendarDiagramEvent,
  EmailDiagramMessage,
} from '../types/chat';

// --------------------------------------------------------------------------- //
// Custom diagrams: rich visualizations for the structured JSON a tool returns
// alongside its text. The backend sends this as a dedicated `custom_diagram`
// SSE event (whole, not token-streamed); here we turn it into a card.
// --------------------------------------------------------------------------- //

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function parseDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDateLabel(iso: string): string {
  const d = parseDate(iso);
  if (!d) return iso || '';
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

function fmtTime(iso: string): string {
  const d = parseDate(iso);
  if (!d) return '';
  return `${('0' + d.getHours()).slice(-2)}:${('0' + d.getMinutes()).slice(-2)}`;
}

const cardStyle: React.CSSProperties = {
  margin: '10px 0 14px',
  border: '1px solid var(--border2)',
  borderRadius: '12px',
  background: 'var(--panel)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 14px',
  borderBottom: '1px solid var(--border2)',
  background: 'var(--panel2)',
  fontFamily: "'IBM Plex Mono',monospace",
  fontSize: '11px',
  letterSpacing: '.08em',
  color: 'var(--text)',
  fontWeight: 600,
};

const badgeStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: '10px',
  color: 'var(--muted)',
  fontWeight: 500,
};

// --------------------------------------------------------------------------- //
// Calendar
// --------------------------------------------------------------------------- //
const CalendarView: React.FC<{ events: CalendarDiagramEvent[]; title?: string }> = ({
  events,
  title,
}) => (
  <div style={cardStyle}>
    <div style={headerStyle}>
      <span>📅</span>
      <span>{title || 'カレンダー'}</span>
      <span style={badgeStyle}>{events.length}件</span>
    </div>
    {events.length === 0 ? (
      <div style={{ padding: '18px 14px', color: 'var(--muted)', fontSize: '13px' }}>
        予定はありません。
      </div>
    ) : (
      <div>
        {events.map((ev, i) => (
          <div
            key={ev.id || i}
            style={{
              display: 'flex',
              gap: '12px',
              padding: '12px 14px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border3)',
            }}
          >
            {/* Date / time column */}
            <div
              style={{
                flex: 'none',
                width: '70px',
                textAlign: 'center',
                borderRight: '1px solid var(--border3)',
                paddingRight: '12px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                {fmtDateLabel(ev.start)}
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: '12px',
                  color: 'var(--accent)',
                  marginTop: '2px',
                }}
              >
                {ev.all_day ? '終日' : fmtTime(ev.start)}
              </div>
            </div>
            {/* Details */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {ev.summary}
              </div>
              {!ev.all_day && ev.end && (
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                  {fmtTime(ev.start)} – {fmtTime(ev.end)}
                </div>
              )}
              {ev.location && (
                <div style={{ fontSize: '11.5px', color: 'var(--text3)', marginTop: '3px' }}>
                  📍 {ev.location}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// --------------------------------------------------------------------------- //
// Email list
// --------------------------------------------------------------------------- //
const EmailListView: React.FC<{
  messages: EmailDiagramMessage[];
  title?: string;
  query?: string;
}> = ({ messages, title, query }) => (
  <div style={cardStyle}>
    <div style={headerStyle}>
      <span>✉️</span>
      <span>{title || 'メール'}</span>
      {query ? (
        <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 400 }}>
          「{query}」
        </span>
      ) : null}
      <span style={badgeStyle}>{messages.length}件</span>
    </div>
    {messages.length === 0 ? (
      <div style={{ padding: '18px 14px', color: 'var(--muted)', fontSize: '13px' }}>
        該当するメールはありません。
      </div>
    ) : (
      <div>
        {messages.map((m, i) => (
          <div
            key={m.id || i}
            style={{
              display: 'flex',
              gap: '10px',
              padding: '11px 14px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border3)',
              background: m.unread ? 'rgba(45,212,191,0.05)' : 'transparent',
            }}
          >
            {/* Unread indicator */}
            <span
              style={{
                flex: 'none',
                width: '8px',
                height: '8px',
                marginTop: '5px',
                borderRadius: '50%',
                background: m.unread ? 'var(--accent)' : 'transparent',
                border: m.unread ? 'none' : '1px solid var(--border3)',
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '12.5px',
                    fontWeight: m.unread ? 700 : 500,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {m.from}
                </span>
                <span style={{ flex: 'none', fontSize: '10.5px', color: 'var(--muted)' }}>
                  {m.date}
                </span>
              </div>
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: m.unread ? 600 : 400,
                  color: 'var(--text2)',
                  marginTop: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.subject}
              </div>
              <div
                style={{
                  fontSize: '11.5px',
                  color: 'var(--text3)',
                  marginTop: '3px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.snippet}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// --------------------------------------------------------------------------- //
// Switch
// --------------------------------------------------------------------------- //
export const CustomDiagramView: React.FC<{ diagram: CustomDiagram }> = ({ diagram }) => {
  if (diagram.mode === 'calendar') {
    return <CalendarView events={diagram.events || []} title={diagram.title} />;
  }
  if (diagram.mode === 'email_list') {
    return (
      <EmailListView
        messages={diagram.messages || []}
        title={diagram.title}
        query={diagram.query}
      />
    );
  }
  return null;
};
