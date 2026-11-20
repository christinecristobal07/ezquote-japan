import { createContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: string;
  readonly tone: ToastTone;
  readonly message: string;
}

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: string) => void;
}

export const TOAST_DURATION_MS = 5000;
export const MAX_TOASTS = 3;

export const ToastContext = createContext<ToastApi | null>(null);
