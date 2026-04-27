'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      setError('Неверный PIN-код');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="card p-8 md:p-10 w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-center text-[var(--text)] mb-2">my.gov tracker</h1>
          <p className="text-center text-[var(--text2)] text-sm">Введите PIN-код для входа</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="PIN-код"
            className="border border-[var(--border)] bg-[var(--surface2)] rounded-lg px-4 py-3 text-center text-2xl tracking-widest text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={pin.length === 0}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-3 font-semibold transition"
          >
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
