import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './markdownParser';

describe('parseMarkdown', () => {
  it('should parse basic section headers', () => {
    const md = `
## SEC1 - Section One
This is the headline
> This is the body content
[Button Text]
    `.trim();

    const sections = parseMarkdown(md);
    expect(sections.length).toBe(1);
    expect(sections[0].tag).toBe('## SEC1');
    expect(sections[0].label).toBe('SECTION ONE');
    expect(sections[0].headline).toBe('This is the headline');
    expect(sections[0].body).toBe('This is the body content');
    expect(sections[0].cta).toBe('Button Text');
  });

  it('should parse multiple sections properly', () => {
    const md = `
## SEC1 - First
Headline 1
> Body 1

## SEC2 - Second
Headline 2
> Body 2
    `.trim();

    const sections = parseMarkdown(md);
    expect(sections.length).toBe(2);
    expect(sections[0].label).toBe('FIRST');
    expect(sections[1].label).toBe('SECOND');
  });

  it('should merge Japanese body lines without spaces', () => {
    const md = `
## SEC1 - 和文テスト
見出し
> 日本語の文章です。
> 改行されていても結合します。
    `.trim();

    const sections = parseMarkdown(md);
    expect(sections.length).toBe(1);
    expect(sections[0].body).toBe('日本語の文章です。改行されていても結合します。');
  });

  it('should fallback to document schema if no section headers exist', () => {
    const md = 'ただのテキスト文章です。ヘッダーはありません。';
    const sections = parseMarkdown(md);
    expect(sections.length).toBe(1);
    expect(sections[0].tag).toBe('## DOC');
    expect(sections[0].label).toBe('DOCUMENT');
    expect(sections[0].body).toBe(md);
  });
});
