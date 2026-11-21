import { toClipboardHtml } from '@/domain';

export type CopyOutcome = 'clipboard-item' | 'write-text' | 'textarea' | 'failed';

/**
 * Copies text so it survives a paste into Messenger, Viber, Gmail and Outlook.
 *
 * Three attempts, in order. The rich flavour keeps line breaks in editors that
 * paste HTML; plain text is the fallback for everything else; the hidden
 * textarea covers browsers where the async Clipboard API is unavailable or
 * blocked, which still happens on older mobile browsers.
 */
export async function copyText(text: string): Promise<CopyOutcome> {
  // Typed as always present, but genuinely absent on some older mobile
  // browsers and in non-secure contexts, so each is probed before use.
  const clipboard = (globalThis.navigator as Navigator | undefined)?.clipboard;
  const hasClipboardItem = typeof globalThis.ClipboardItem !== 'undefined';

  if (clipboard !== undefined && hasClipboardItem) {
    try {
      await clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([toClipboardHtml(text)], { type: 'text/html' }),
        }),
      ]);
      return 'clipboard-item';
    } catch {
      // Fall through.
    }
  }

  if (clipboard !== undefined) {
    try {
      await clipboard.writeText(text);
      return 'write-text';
    } catch {
      // Fall through.
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    // Deprecated, but the only synchronous copy some browsers still allow.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok ? 'textarea' : 'failed';
  } catch {
    return 'failed';
  }
}
