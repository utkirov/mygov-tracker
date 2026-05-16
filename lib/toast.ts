'use client';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastPayload {
  title: string;
  description?: string;
  tone?: ToastTone;
}

export const APP_TOAST_EVENT = 'app:toast';

export function showToast(payload: ToastPayload) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(APP_TOAST_EVENT, { detail: payload }));
}
