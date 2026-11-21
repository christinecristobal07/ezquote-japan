/**
 * Text tidying for content a manager types.
 *
 * Emoji are load-bearing in this product — the itinerary lines use them, and
 * several are emoji + variation selector (⛩️ is U+26E9 U+FE0F) or ZWJ
 * sequences. Nothing here touches any character other than whitespace, so a
 * pasted emoji survives a save unchanged.
 */

/** Normalises line endings and surrounding blank space without altering content. */
export function normalizeMultiline(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

/** Collapses a name into the code shape the services table requires. */
export function slugifyCode(name: string): string {
  const slug = name
    .normalize('NFKD')
    // Strip accents so "Kyōto" becomes "kyoto" rather than losing the vowel.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
    .replace(/_{2,}/g, '_');

  return slug === '' ? 'item' : slug;
}

export const CODE_PATTERN = /^[a-z0-9_]+$/;

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}
