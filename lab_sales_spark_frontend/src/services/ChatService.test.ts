import { describe, it, expect } from 'vitest';
import { ChatService } from './ChatService';
import { MessageContentItem } from '../types/chat';

describe('ChatService.cleanContent', () => {
  it('should return string unchanged', () => {
    const text = 'Hello world';
    const cleaned = ChatService.cleanContent(text);
    expect(cleaned).toBe(text);
  });

  it('should strip metadata from text content items', () => {
    const original: MessageContentItem[] = [
      {
        type: 'text',
        text: 'This is a prompt',
        name: 'ignored-name', // metadata should be stripped
        mimeType: 'ignored-mime' // metadata should be stripped
      }
    ];

    const cleaned = ChatService.cleanContent(original);
    expect(cleaned).toEqual([
      {
        type: 'text',
        text: 'This is a prompt'
      }
    ]);
  });

  it('should strip metadata from image_url content items', () => {
    const original: MessageContentItem[] = [
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,abcdefg...' },
        name: 'test.png', // metadata should be stripped
        mimeType: 'image/png' // metadata should be stripped
      }
    ];

    const cleaned = ChatService.cleanContent(original);
    expect(cleaned).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,abcdefg...' }
      }
    ]);
  });
});
