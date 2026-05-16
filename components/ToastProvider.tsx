'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { APP_TOAST_EVENT, type ToastPayload, type ToastTone } from '@/lib/toast';

interface ToastItem extends ToastPayload {
  id: string;
  tone: ToastTone;
}

const ToastContext = createContext<{ pushToast: (payload: ToastPayload) => void }>({
  pushToast: () => {},
});

function toneClasses(tone: ToastTone) {
  switch (tone) {
    case 'success':
      return 'border-emerald-300/40 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100';
    case 'warning':
      return 'border-amber-300/40 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100';
    case 'error':
      return 'border-red-300/40 bg-red-50 text-red-900 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100';
    default:
      return 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]';
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function pushToast(payload: ToastPayload) {
    const nextToast: ToastItem = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tone: payload.tone ?? 'info',
      ...payload,
    };

    setToasts((current) => [...current, nextToast]);
  }

  useEffect(() => {
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastPayload>;
      if (!customEvent.detail?.title) {
        return;
      }

      pushToast(customEvent.detail);
    };

    window.addEventListener(APP_TOAST_EVENT, handleToast as EventListener);
    return () => {
      window.removeEventListener(APP_TOAST_EVENT, handleToast as EventListener);
    };
  }, []);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((entry) => entry.id !== toast.id));
      }, 4200)
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [toasts]);

  const value = useMemo(() => ({ pushToast }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-[24px] border px-4 py-3 shadow-[var(--shadow-card)] backdrop-blur ${toneClasses(toast.tone)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description && (
                  <p className="mt-1 text-sm leading-6 opacity-90">{toast.description}</p>
                )}
              </div>
              <button
                onClick={() => setToasts((current) => current.filter((entry) => entry.id !== toast.id))}
                className="rounded-full px-2 py-1 text-xs opacity-70 transition hover:opacity-100"
              >
                Закрыть
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
