'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';

interface Me { configured: boolean; public: boolean; authenticated: boolean }

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((m: Me) => {
        setMe(m);
        if (m.authenticated) router.replace(safeNext(params.get('next')));
      })
      .catch(() => {});
  }, [params, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? 'Не удалось войти');
        return;
      }
      router.replace(safeNext(params.get('next')));
    } catch {
      setError('Сервер не отвечает. Возможно, компьютер с трекером выключен.');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text)' };

  return (
    <div className="flex min-h-[100svh] items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[12px] font-semibold"
            style={{ background: 'var(--text)', color: 'var(--surface)' }}>mg</div>
          <span className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>my.gov tracker</span>
        </div>

        <form onSubmit={submit} className="rounded-[12px] border p-6"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Вход</h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Доступ к трекеру заявлений через интернет защищён паролем.
          </p>

          {me && !me.configured ? (
            <p className="mt-5 rounded-[8px] p-3 text-[13px]" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
              Учётная запись ещё не создана. Откройте Настройки → Безопасность на компьютере с трекером и задайте пароль.
            </p>
          ) : (
            <>
              <label className="mt-5 block text-[12px] font-medium" style={{ color: 'var(--text-soft)' }}>
                Логин
                <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required
                  className="mt-1.5 block h-10 w-full rounded-[8px] px-3 text-[14px] outline-none focus:ring-2" style={inputStyle} />
              </label>
              <label className="mt-3 block text-[12px] font-medium" style={{ color: 'var(--text-soft)' }}>
                Пароль
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required autoFocus
                  className="mt-1.5 block h-10 w-full rounded-[8px] px-3 text-[14px] outline-none focus:ring-2" style={inputStyle} />
              </label>
              <label className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-soft)' }}>
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                Запомнить это устройство на 90 дней
              </label>

              {error && (
                <p role="alert" className="mt-3 text-[13px]" style={{ color: 'var(--danger)' }}>{error}</p>
              )}

              <button type="submit" disabled={busy}
                className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-[8px] text-[14px] font-medium transition disabled:opacity-60"
                style={{ background: 'var(--text)', color: 'var(--surface)' }}>
                <Lock size={15} />
                {busy ? 'Вхожу…' : 'Войти'}
              </button>
            </>
          )}
        </form>

        <p className="mt-4 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
          После 5 неверных попыток вход блокируется на 15 минут.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
