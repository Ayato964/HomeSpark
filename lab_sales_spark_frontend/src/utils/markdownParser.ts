import { Section } from '../types/chat';

/**
 * Utility to parse markdown string into structured Canvas Sections.
 * Decoupled from app component for modular testing and reuse.
 */
export function parseMarkdown(markdown: string): Section[] {
  const sections: Section[] = [];
  const parts = markdown.split(/(?=^\s*## )/m);
  
  for (const part of parts) {
    const lines = part.trim().split('\n');
    if (lines.length === 0 || !lines[0].trim()) continue;
    
    const headerLine = lines[0].trim();
    if (!headerLine.startsWith('## ')) continue;
    
    const tagMatch = headerLine.match(/^##\s+([A-Z0-9]+(?:\.[0-9]+)?)\s*[\-—.:]?\s*(.*)$/i);
    let tag = '## Section';
    let label = '';
    
    if (tagMatch) {
      tag = `## ${tagMatch[1]}`;
      label = tagMatch[2].trim();
    } else {
      tag = '## Section';
      label = headerLine.replace(/^##\s*/, '').trim();
    }
    
    let headline = '';
    const bodyLines: string[] = [];
    let cta = '';
    let cta2 = '';
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      if (!headline) {
        headline = line;
      } else if (line.startsWith('>') || line.startsWith('&gt;')) {
        bodyLines.push(line.replace(/^>\s*/, ''));
      } else if (line.startsWith('[') && line.endsWith(']') && !line.includes('](')) {
        const ctas = line.match(/\[([^\]]+)\]/g);
        if (ctas && ctas.length > 0) {
          cta = ctas[0].replace(/[\[\]]/g, '');
          if (ctas.length > 1) {
            cta2 = ctas[1].replace(/[\[\]]/g, '');
          }
        }
      } else {
        bodyLines.push(line);
      }
    }
    
    const isJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(markdown);
    const bodyText = bodyLines.join(isJapanese ? '' : ' ');
    
    sections.push({
      tag,
      label: label.toUpperCase() || 'INFO',
      headline: headline || label || 'No Headline',
      body: bodyText || 'No content',
      cta: cta || undefined,
      cta2: cta2 || undefined
    });
  }
  
  if (sections.length === 0 && markdown.trim().length > 0) {
    sections.push({
      tag: '## DOC',
      label: 'DOCUMENT',
      headline: '生成されたドキュメント',
      body: markdown,
    });
  }
  
  return sections;
}
