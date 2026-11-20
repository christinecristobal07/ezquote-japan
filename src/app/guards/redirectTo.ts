const BACKSLASH = String.fromCharCode(92);

/**
 * Only same-site relative paths are followed after login. "//evil.com" and any
 * absolute URL are rejected, so a crafted ?redirectTo cannot bounce someone off
 * the site with their session fresh in hand.
 */
export function safeRedirectTo(value: string | null | undefined): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  // Browsers treat /\ like //, so it is the same open-redirect trick.
  if (value.startsWith(`/${BACKSLASH}`)) return '/';
  return value;
}
