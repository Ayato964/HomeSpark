import React from 'react';
import { Section } from '../types/chat';

interface CanvasAreaProps {
  canvasTab: 'preview' | 'source';
  onSelectTab: (tab: 'preview' | 'source') => void;
  docFile: string;
  sections: Section[];
  source: string;
}

export const CanvasArea: React.FC<CanvasAreaProps> = ({
  canvasTab,
  onSelectTab,
  docFile,
  sections,
  source
}) => {
  const tabBaseStyle: React.CSSProperties = { padding: '6px 13px', fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace", border: 'none', cursor: 'pointer' };
  
  const previewTabStyle: React.CSSProperties = { ...tabBaseStyle, height: '42px', display: 'flex', alignItems: 'center', background: 'transparent', color: canvasTab === 'preview' ? 'var(--text)' : 'var(--muted)', borderBottom: canvasTab === 'preview' ? '2px solid var(--accent)' : '2px solid transparent' };
  const sourceTabStyle: React.CSSProperties = { ...tabBaseStyle, height: '42px', display: 'flex', alignItems: 'center', background: 'transparent', color: canvasTab === 'source' ? 'var(--text)' : 'var(--muted)', borderBottom: canvasTab === 'source' ? '2px solid var(--accent)' : '2px solid transparent' };

  return (
    <section style={{ 
      position: 'relative', 
      zIndex: 1, 
      width: '460px', 
      flex: 'none', 
      height: '100%', 
      background: 'var(--bg)', 
      borderLeft: '1px solid var(--border)', 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', height: '42px', padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => onSelectTab('preview')} style={previewTabStyle}>PREVIEW</button>
        <button onClick={() => onSelectTab('source')} style={sourceTabStyle}>SOURCE</button>
        <div style={{ flex: 1 }}></div>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px', color: 'var(--muted)' }}>{docFile}</span>
      </div>

      {/* Content */}
      {canvasTab === 'preview' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {sections.map((s, idx) => (
            <div key={idx} style={{ border: '1px solid var(--border2)', background: 'var(--panel)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px', color: 'var(--accent)', letterSpacing: '.06em' }}>{s.tag}</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '9.5px', color: 'var(--muted)', letterSpacing: '.1em' }}>{s.label}</span>
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '18px', fontWeight: 600, lineHeight: 1.35, color: 'var(--text)' }}>{s.headline}</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text3)', lineHeight: 1.65, marginTop: '8px' }}>{s.body}</div>
                {s.cta && (
                  <div style={{ marginTop: '13px', display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '10.5px', color: 'var(--on-accent)', background: 'var(--accent)', padding: '5px 11px', borderRadius: '4px' }}>{s.cta}</span>
                    {s.cta2 && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '10.5px', color: 'var(--text3)' }}>{s.cta2}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {canvasTab === 'source' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '20px', background: 'var(--panel)' }}>
          <pre style={{ margin: 0, fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', lineHeight: 1.7, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{source}</pre>
        </div>
      )}
    </section>
  );
};
