import React from 'react';

interface MarkdownProps {
  text: string;
}

export const Markdown: React.FC<MarkdownProps> = ({ text }) => {
  if (!text) return null;

  // Split text by code blocks first
  const parts: { type: 'text' | 'code'; content: string; lang?: string }[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)(?:```|$)/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      });
    }
    parts.push({
      type: 'code',
      lang: match[1] || 'plaintext',
      content: match[2].trim()
    });
    lastIndex = codeBlockRegex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex)
    });
  }

  // Parses inline markers (**bold**, `code`, [text](url)) into React nodes
  const parseInline = (inlineText: string): React.ReactNode => {
    const tokens: React.ReactNode[] = [];
    const inlineRegex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
    const inlineParts = inlineText.split(inlineRegex);
    
    inlineParts.forEach((part, i) => {
      if (!part) return;
      
      if (part.startsWith('**') && part.endsWith('**')) {
        tokens.push(<strong key={i} style={{ fontWeight: 700, color: 'var(--text)' }}>{part.slice(2, -2)}</strong>);
      } else if (part.startsWith('`') && part.endsWith('`')) {
        tokens.push(
          <code key={i} style={{ 
            fontFamily: "'IBM Plex Mono', monospace", 
            fontSize: '13px', 
            background: 'var(--hover)', 
            padding: '2px 6px', 
            borderRadius: '4px',
            border: '1px solid var(--border2)',
            color: 'var(--accent)'
          }}>
            {part.slice(1, -1)}
          </code>
        );
      } else if (part.startsWith('[') && part.includes('](')) {
        const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          const [, label, url] = linkMatch;
          tokens.push(
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
              {label}
            </a>
          );
        } else {
          tokens.push(part);
        }
      } else {
        tokens.push(part);
      }
    });
    
    return tokens.length > 0 ? tokens : inlineText;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <div key={index} style={{ 
              margin: '8px 0', 
              background: 'var(--composer)', 
              border: '1px solid var(--border2)', 
              borderRadius: '8px', 
              overflow: 'hidden' 
            }}>
              <div style={{ 
                background: 'var(--panel2)', 
                borderBottom: '1px solid var(--border2)', 
                padding: '6px 12px', 
                fontSize: '11px', 
                fontFamily: "'IBM Plex Mono', monospace", 
                color: 'var(--muted)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{part.lang?.toUpperCase()}</span>
                <span style={{ fontSize: '9px' }}>CODE BLOCK</span>
              </div>
              <pre style={{ 
                margin: 0, 
                padding: '12px 16px', 
                overflow: 'auto', 
                fontFamily: "'IBM Plex Mono', monospace", 
                fontSize: '13px', 
                lineHeight: 1.6,
                color: 'var(--text2)'
              }}>
                <code>{part.content}</code>
              </pre>
            </div>
          );
        }

        const lines = part.content.split('\n');
        const renderedLines: React.ReactNode[] = [];
        
        let inList = false;
        let listItems: React.ReactNode[] = [];
        
        let inTable = false;
        let tableRows: string[][] = [];

        const flushList = (key: number) => {
          if (listItems.length > 0) {
            renderedLines.push(
              <ul key={`ul-${key}`} style={{ margin: '4px 0 12px 20px', paddingLeft: 0, listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {listItems}
              </ul>
            );
            listItems = [];
            inList = false;
          }
        };

        const flushTable = (key: number) => {
          if (tableRows.length > 0) {
            const headers = tableRows[0];
            const rows = tableRows.slice(2);
            
            renderedLines.push(
              <div key={`table-wrapper-${key}`} style={{ overflowX: 'auto', margin: '12px 0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', border: '1px solid var(--border2)' }}>
                  <thead>
                    <tr style={{ background: 'var(--panel2)', borderBottom: '2px solid var(--border2)' }}>
                      {headers.map((h, i) => (
                        <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderRight: '1px solid var(--border2)' }}>
                          {parseInline(h.trim())}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: '1px solid var(--border2)', background: ri % 2 === 0 ? 'transparent' : 'var(--activebg)' }}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{ padding: '8px 12px', borderRight: '1px solid var(--border2)' }}>
                            {parseInline(cell.trim())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
            tableRows = [];
            inTable = false;
          }
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();

          if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            flushList(i);
            inTable = true;
            const cells = trimmed.split('|').slice(1, -1);
            tableRows.push(cells);
            continue;
          } else if (inTable) {
            flushTable(i);
          }

          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            inList = true;
            listItems.push(
              <li key={i} style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text2)' }}>
                {parseInline(trimmed.slice(2))}
              </li>
            );
            continue;
          } else if (inList) {
            flushList(i);
          }

          if (trimmed.startsWith('### ')) {
            renderedLines.push(
              <h4 key={i} style={{ fontSize: '15px', fontWeight: 600, margin: '14px 0 6px', color: 'var(--text)' }}>
                {parseInline(trimmed.slice(4))}
              </h4>
            );
          } else if (trimmed.startsWith('## ')) {
            renderedLines.push(
              <h3 key={i} style={{ fontSize: '17px', fontWeight: 600, margin: '18px 0 8px', color: 'var(--text)', borderBottom: '1px solid var(--border2)', paddingBottom: '4px' }}>
                {parseInline(trimmed.slice(3))}
              </h3>
            );
          } else if (trimmed.startsWith('# ')) {
            renderedLines.push(
              <h2 key={i} style={{ fontSize: '20px', fontWeight: 700, margin: '22px 0 10px', color: 'var(--text)', borderBottom: '2px solid var(--border2)', paddingBottom: '6px' }}>
                {parseInline(trimmed.slice(2))}
              </h2>
            );
          } else if (trimmed.startsWith('>')) {
            renderedLines.push(
              <blockquote key={i} style={{ 
                margin: '12px 0', 
                paddingLeft: '14px', 
                borderLeft: '3px solid var(--accent)', 
                color: 'var(--text3)', 
                fontStyle: 'italic' 
              }}>
                {parseInline(trimmed.replace(/^>\s*/, ''))}
              </blockquote>
            );
          } else if (trimmed === '') {
            renderedLines.push(<div key={i} style={{ height: '8px' }}></div>);
          } else {
            renderedLines.push(
              <p key={i} style={{ fontSize: '14.5px', lineHeight: 1.7, color: 'var(--text2)', margin: '4px 0', textWrap: 'pretty' as any }}>
                {parseInline(line)}
              </p>
            );
          }
        }

        flushList(lines.length);
        flushTable(lines.length);

        return <React.Fragment key={index}>{renderedLines}</React.Fragment>;
      })}
    </div>
  );
};
