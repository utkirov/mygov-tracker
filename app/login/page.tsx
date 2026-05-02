'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, RefreshCw } from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push('/dashboard');
    } else {
      const d = await res.json();
      setError(d.error ?? 'Ошибка входа');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="card p-8 w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">M</div>
          <h1 className="text-xl font-bold text-[var(--text)]">Войти</h1>
          {params.get('registered') && (
            <p className="text-sm text-green-500 mt-1">Аккаунт создан! Войдите.</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="Email"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-[var(--surface2)] border border-[var(--border)] rounded-xl text-[var(--text)] placeholder-[var(--text3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="Пароль"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-[var(--surface2)] border border-[var(--border)] rounded-xl text-[var(--text)] placeholder-[var(--text3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <button type="submit" disabled={loading || !email || !password}
            className="flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition mt-1">
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Вхожу...</> : 'Войти'}
          </button>
        </form>

        <p className="text-center text-sm text-[var(--text2)] mt-4">
          Нет аккаунта?{' '}
          <Link href="/register" className="text-[var(--accent)] hover:underline">Создать</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
