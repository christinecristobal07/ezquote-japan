/** Greeting follows Manila office hours, not whatever timezone the laptop is in. */
export function greetingFor(date: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-PH', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Manila',
    }).format(date),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
