import { useEffect } from 'react';

export const APP_NAME = 'EZQUOTE Japan';

/** Sets the browser tab title as "<title> · EZQUOTE Japan" while mounted. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
