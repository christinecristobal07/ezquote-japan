import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { copyText } from './clipboard';

const TEXT = 'Hi my name is Aira\n\u{1F5FB} Mt Fuji';

function stubClipboard(value: unknown): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value,
    configurable: true,
    writable: true,
  });
}

describe('copyText', () => {
  const originalClipboardItem = globalThis.ClipboardItem;

  beforeEach(() => {
    // jsdom has no ClipboardItem; stand one in that records what it was given.
    globalThis.ClipboardItem = class {
      readonly types: string[];
      constructor(items: Record<string, Blob>) {
        this.types = Object.keys(items);
      }
    } as unknown as typeof ClipboardItem;
  });

  afterEach(() => {
    globalThis.ClipboardItem = originalClipboardItem;
    vi.restoreAllMocks();
  });

  it('prefers a ClipboardItem carrying both plain text and HTML', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ write, writeText: vi.fn() });

    expect(await copyText(TEXT)).toBe('clipboard-item');
    expect(write).toHaveBeenCalledTimes(1);

    const items = write.mock.calls[0]?.[0] as { types: string[] }[];
    expect(items[0]?.types).toEqual(['text/plain', 'text/html']);
  });

  it('falls back to writeText when the rich write is refused', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ write: vi.fn().mockRejectedValue(new Error('blocked')), writeText });

    expect(await copyText(TEXT)).toBe('write-text');
    expect(writeText).toHaveBeenCalledWith(TEXT);
  });

  it('falls back to a hidden textarea when the Clipboard API is missing', async () => {
    stubClipboard(undefined);
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });

    expect(await copyText(TEXT)).toBe('textarea');
    expect(exec).toHaveBeenCalledWith('copy');
    // The temporary textarea must not be left behind.
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('reports failure when every route fails', async () => {
    stubClipboard({
      write: vi.fn().mockRejectedValue(new Error('no')),
      writeText: vi.fn().mockRejectedValue(new Error('no')),
    });
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });

    expect(await copyText(TEXT)).toBe('failed');
  });

  it('passes the text through unchanged, emoji and newlines included', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ write: vi.fn().mockRejectedValue(new Error('x')), writeText });

    await copyText(TEXT);
    const sent = writeText.mock.calls[0]?.[0] as string;
    expect(sent).toContain('\u{1F5FB}');
    expect(sent.split('\n')).toHaveLength(2);
  });
});
