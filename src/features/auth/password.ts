export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_RULES = [
  `At least ${MIN_PASSWORD_LENGTH} characters`,
  'A lowercase letter',
  'An uppercase letter',
  'A digit',
] as const;

/** Mirrors the Supabase password policy so the user sees the problem before submitting. */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password)) return 'Include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Include an uppercase letter.';
  if (!/\d/.test(password)) return 'Include a digit.';
  return null;
}
