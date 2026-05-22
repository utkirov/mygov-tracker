'use client';

import { useCallback, useEffect, useMemo, useState, startTransition } from 'react';
import { Wifi } from 'lucide-react';

import { requestImmediateSyncRun, rescheduleSyncEngine, useSyncEngineSnapshot } from '@/lib/sync-engine';
import { showToast } from '@/lib/toast';

interface SettingsForm {
  telegram_token: string;
  telegram_chat_id: string;
  auto_check_enabled: boolean;
  auto_check_interval: string;
  auto_check_delay_ms: string;
  auto_check_concurrency: string;
  sound_enabled: boolean;
}

type SaveMode = 'queue' | 'telegram' | 'sound' | 'all';

function toInputValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function readPositiveNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readNonNegativeNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function buildForm(payload: Record<string, unknown>): SettingsForm {
  return {
    telegram_token: typeof payload.telegram_token === 'string' ? payload.telegram_token : '',
    telegram_chat_id: typeof payload.telegram_chat_id === 'string' ? payload.telegram_chat_id : '',
    auto_check_enabled: payload.auto_check_enabled === true,
    auto_check_interval: toInputValue(payload.auto_check_interval),
    auto_check_delay_ms: toInputValue(payload.auto_check_delay_ms),
    auto_check_concurrency: toInputValue(payload.auto_check_concurrency),
    sound_enabled: payload.sound_enabled !== false,
  };
}

function SectionCard({ title, subtitle, children, badge }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border p-4 md:p-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const sync = useSyncEngineSnapshot();
  const [lanIps, setLanIps] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/network-info')
      .then(r => r.json())
      .then((d: { lanIps: string[] }) => setLanIps(d.lanIps))
      .catch(() => {});
  }, []);

  const [form, setForm] = useState<SettingsForm>({
    telegram_token: '',
    telegram_chat_id: '',
    auto_check_enabled: false,
    auto_check_interval: '',
    auto_check_delay_ms: '',
    auto_check_concurrency: '',
    sound_enabled: true,
  });
  const [initialForm, setInitialForm] = useState<SettingsForm | null>(null);
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null);
  const [testing, setTesting] = useState(false);
  const [savingSound, setSavingSound] = useState(false);

  const loadSettings = useCallback(async () => {
    const response = await fetch('/api/settings', { cache: 'no-store' });
    const payload = await response.json() as Record<string, unknown>;
    const nextForm = buildForm(payload);
    startTransition(() => {
      setForm(nextForm);
      setInitialForm(nextForm);
    });
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const queueDraft = useMemo(() => ({
    auto_check_enabled: form.auto_check_enabled,
    auto_check_interval: form.auto_check_interval,
    auto_check_delay_ms: form.auto_check_delay_ms,
    auto_check_concurrency: form.auto_check_concurrency,
  }), [form]);

  const queueInitial = useMemo(() =>
    initialForm ? {
      auto_check_enabled: initialForm.auto_check_enabled,
      auto_check_interval: initialForm.auto_check_interval,
      auto_check_delay_ms: initialForm.auto_check_delay_ms,
      auto_check_concurrency: initialForm.auto_check_concurrency,
    } : null,
    [initialForm]
  );

  const telegramDraft = useMemo(() => ({
    telegram_token: form.telegram_token,
    telegram_chat_id: form.telegram_chat_id,
  }), [form]);

  const telegramInitial = useMemo(() =>
    initialForm ? {
      telegram_token: initialForm.telegram_token,
      telegram_chat_id: initialForm.telegram_chat_id,
    } : null,
    [initialForm]
  );

  const queueDirty = queueInitial !== null && JSON.stringify(queueDraft) !== JSON.stringify(queueInitial);
  const telegramDirty = telegramInitial !== null && JSON.stringify(telegramDraft) !== JSON.stringify(telegramInitial);

  const queueErrors = useMemo(() => {
    const errors: string[] = [];
    if (form.auto_check_enabled) {
      if (readPositiveNumber(form.auto_check_interval) === null)
        errors.push('Интервал должен быть целым числом больше 0.');
      if (readNonNegativeNumber(form.auto_check_delay_ms) === null)
        errors.push('Пауза между проверками должна быть 0 или больше.');
      const c = readPositiveNumber(form.auto_check_concurrency);
      if (c === null) errors.push('Лимит параллельности должен быть целым числом больше 0.');
      else if (c > 5) errors.push('Для my.gov лучше держать лимит параллельности не выше 5.');
    }
    return errors;
  }, [form.auto_check_concurrency, form.auto_check_delay_ms, form.auto_check_enabled, form.auto_check_interval]);

  const telegramErrors = useMemo(() => {
    const errors: string[] = [];
    if (form.telegram_token.trim() && !form.telegram_token.includes(':'))
      errors.push('Bot token должен содержать ":" и выглядеть как токен Telegram-бота.');
    if (form.telegram_chat_id.trim() && !/^-?\d+$/.test(form.telegram_chat_id.trim()))
      errors.push('Chat ID должен быть числом, например `123456789` или `-100...`.');
    return errors;
  }, [form.telegram_chat_id, form.telegram_token]);

  function update<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm(cur => ({ ...cur, [key]: value }));
  }

  async function saveSettings(mode: SaveMode, runNow = false) {
    const payload: Record<string, unknown> = {};

    if (mode === 'queue' || mode === 'all') {
      if (queueErrors.length > 0) {
        showToast({ title: 'Проверь параметры очереди', description: queueErrors[0], tone: 'warning' });
        return false;
      }
      payload.auto_check_enabled = form.auto_check_enabled;
      payload.auto_check_interval = form.auto_check_interval.trim();
      payload.auto_check_delay_ms = form.auto_check_delay_ms.trim();
      payload.auto_check_concurrency = form.auto_check_concurrency.trim();
    }

    if (mode === 'telegram' || mode === 'all') {
      if (telegramErrors.length > 0) {
        showToast({ title: 'Проверь Telegram-поля', description: telegramErrors[0], tone: 'warning' });
        return false;
      }
      payload.telegram_token = form.telegram_token.trim();
      payload.telegram_chat_id = form.telegram_chat_id.trim();
    }

    setSavingMode(mode);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Не удалось сохранить');
      await loadSettings();
      // Sync client-side engine interval with what was just saved to the server
      if (mode === 'queue' || mode === 'all') {
        rescheduleSyncEngine();
      }
      showToast({
        title: mode === 'telegram' ? 'Telegram-настройки сохранены' : runNow ? 'Сохранено, цикл запущен' : 'Настройки очереди сохранены',
        description: mode === 'telegram' ? 'Можно отправить тестовое сообщение.' : runNow ? 'Новая конфигурация применена.' : 'Фоновая очередь уже активна.',
        tone: 'success',
      });
      if (runNow) requestImmediateSyncRun();
      return true;
    } catch (error) {
      showToast({ title: 'Сохранение не выполнено', description: error instanceof Error ? error.message : 'Повтори попытку.', tone: 'error' });
      return false;
    } finally {
      setSavingMode(null);
    }
  }

  async function handleSoundToggle(enabled: boolean) {
    update('sound_enabled', enabled);
    setSavingSound(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sound_enabled: enabled }),
      });
      showToast({ title: enabled ? 'Звук включён' : 'Звук выключен', description: enabled ? 'Сигнал при изменении статуса.' : 'Тихий режим.', tone: 'success' });
    } catch {
      showToast({ title: 'Не удалось сохранить', description: 'Попробуй ещё раз.', tone: 'error' });
    } finally {
      setSavingSound(false);
    }
  }

  async function handleTelegramTest() {
    if (!form.telegram_token.trim() || !form.telegram_chat_id.trim()) {
      showToast({ title: 'Нужны token и chat ID', description: 'Сначала заполни оба поля.', tone: 'warning' });
      return;
    }
    if (telegramErrors.length > 0) {
      showToast({ title: 'Проверь Telegram-поля', description: telegramErrors[0], tone: 'warning' });
      return;
    }
    setTesting(true);
    try {
      if (telegramDirty) {
        const saved = await saveSettings('telegram');
        if (!saved) return;
      }
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: form.telegram_token.trim(), chatId: form.telegram_chat_id.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Telegram не ответил');
      showToast({ title: 'Тестовое сообщение отправлено', description: 'Проверь Telegram-чат.', tone: 'success' });
    } catch (error) {
      showToast({ title: 'Telegram test не прошёл', description: error instanceof Error ? error.message : 'Проверь token и chat ID.', tone: 'error' });
    } finally {
      setTesting(false);
    }
  }

  const queueInterval = readPositiveNumber(form.auto_check_interval) ?? 15;
  const queueDelay = readNonNegativeNumber(form.auto_check_delay_ms) ?? 2500;
  const queueConcurrency = readPositiveNumber(form.auto_check_concurrency) ?? 1;

  const inputClass = "w-full rounded-[9px] border px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
  const inputStyle = { background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' };

  function ChipButton({ value, current, onSelect, label }: { value: string; current: string; onSelect: (v: string) => void; label: string }) {
    const active = current === value;
    return (
      <button
        onClick={() => onSelect(value)}
        className="rounded-full px-3 py-1.5 text-xs font-medium transition"
        style={active
          ? { background: 'var(--accent)', color: '#fff' }
          : { background: 'var(--panel)', color: 'var(--text-muted)' }
        }
      >
        {label}
      </button>
    );
  }

  function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
        style={{
          background: checked ? 'var(--accent)' : 'var(--panel-strong)',
          // @ts-ignore
          '--tw-ring-color': 'var(--accent)',
        }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full shadow-sm transition-transform duration-200"
          style={{
            background:  checked ? '#fff' : 'var(--text-muted)',
            transform:   checked ? 'translateX(1.25rem)' : 'translateX(0.125rem)',
          }}
        />
      </button>
    );
  }

  return (
    <div className="overflow-y-auto px-3 py-3 md:px-6 md:py-5">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 md:gap-4">

        {/* Page header */}
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-sm font-bold md:text-base" style={{ color: 'var(--text)' }}>Настройки</h1>
            <p className="text-[10px] md:text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Очередь, уведомления, интеграции
            </p>
          </div>

          {/* Live stats — scrollable row on mobile */}
          <div className="ml-auto flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="shrink-0 rounded-[6px] px-2 py-1 text-[10px] font-semibold"
              style={{ background: sync.enabled ? 'var(--success-soft)' : 'var(--panel)', color: sync.enabled ? 'var(--success)' : 'var(--text-muted)' }}>
              {sync.enabled ? `${sync.intervalMinutes}м` : 'Выкл.'}
            </span>
            <span className="shrink-0 rounded-[6px] px-2 py-1 text-[10px] font-semibold"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {sync.queueLength} в очереди
            </span>
            <button
              onClick={() => requestImmediateSyncRun()}
              className="shrink-0 rounded-[6px] px-2.5 py-1 text-[10px] font-semibold text-white transition active:scale-95"
              style={{ background: 'var(--accent)' }}
            >
              Запустить
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
          {/* Left — Queue settings */}
          <div className="space-y-4">
            <SectionCard
              title="Очередь проверки"
              subtitle="Фоновый цикл обходит все активные заявления по расписанию"
              badge={queueDirty ? (
                <span className="rounded-[5px] px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                  Не сохранено
                </span>
              ) : undefined}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-[10px] p-3"
                  style={{ background: 'var(--panel)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Включить очередь</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Приложение само проходит по заявлениям по расписанию
                    </p>
                  </div>
                  <Toggle
                    checked={form.auto_check_enabled}
                    onChange={v => update('auto_check_enabled', v)}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
                    <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Интервал</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {[5, 15, 30, 60].map(m => (
                        <ChipButton key={m} value={String(m)} current={form.auto_check_interval} onSelect={v => update('auto_check_interval', v)} label={`${m}м`} />
                      ))}
                    </div>
                    <input type="number" min="1" value={form.auto_check_interval}
                      onChange={e => update('auto_check_interval', e.target.value)}
                      className={inputClass} style={inputStyle} />
                  </div>

                  <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>Пауза между проверками</p>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>Чтобы не перегружать сервер</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {[{ v: '0', l: 'нет' }, { v: '1000', l: '1 сек' }, { v: '2500', l: '2.5 сек' }, { v: '5000', l: '5 сек' }].map(({ v, l }) => (
                        <ChipButton key={v} value={v} current={form.auto_check_delay_ms} onSelect={val => update('auto_check_delay_ms', val)} label={l} />
                      ))}
                    </div>
                    <input type="number" min="0" value={form.auto_check_delay_ms}
                      onChange={e => update('auto_check_delay_ms', e.target.value)}
                      className={inputClass} style={inputStyle} placeholder="мс" />
                  </div>

                  <div className="rounded-[10px] p-3" style={{ background: 'var(--panel)' }}>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>Одновременных потоков</p>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>Рекомендуем 1–2 для my.gov</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {[{ v: '1', l: '1 поток' }, { v: '2', l: '2 потока' }, { v: '3', l: '3 потока' }].map(({ v, l }) => (
                        <ChipButton key={v} value={v} current={form.auto_check_concurrency} onSelect={val => update('auto_check_concurrency', val)} label={l} />
                      ))}
                    </div>
                    <input type="number" min="1" max="5" value={form.auto_check_concurrency}
                      onChange={e => update('auto_check_concurrency', e.target.value)}
                      className={inputClass} style={inputStyle} />
                  </div>
                </div>

                <p className="text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                  Текущая конфигурация:{' '}
                  <strong style={{ color: 'var(--text-soft)' }}>каждые {queueInterval} мин</strong>,{' '}
                  пауза <strong style={{ color: 'var(--text-soft)' }}>{queueDelay >= 1000 ? `${queueDelay / 1000} сек` : `${queueDelay} мс`}</strong>,{' '}
                  <strong style={{ color: 'var(--text-soft)' }}>{queueConcurrency}</strong> {queueConcurrency === 1 ? 'поток' : 'потока'}.
                </p>

                {queueErrors.length > 0 && (
                  <div className="rounded-[9px] border px-3 py-2 text-xs"
                    style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                    {queueErrors[0]}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void saveSettings('queue')}
                    disabled={savingMode !== null || !queueDirty}
                    className="rounded-[9px] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                    style={{ background: 'var(--accent)' }}
                  >
                    {savingMode === 'queue' ? 'Сохраняю…' : 'Сохранить'}
                  </button>
                  <button
                    onClick={() => void saveSettings('queue', true)}
                    disabled={savingMode !== null}
                    className="rounded-[9px] border px-4 py-2 text-xs font-medium transition hover:border-current disabled:opacity-60"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
                  >
                    Сохранить и запустить цикл
                  </button>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Right — Telegram + Sound + Info */}
          <div className="space-y-4">
            <SectionCard
              title="Telegram-уведомления"
              subtitle="Бот отправляет отчёты о каждом цикле проверки"
              badge={telegramDirty ? (
                <span className="rounded-[5px] px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                  Не сохранено
                </span>
              ) : undefined}
            >
              <div className="space-y-3">
                <div className="rounded-[9px] px-3 py-2.5 text-[11px] leading-5"
                  style={{ background: 'var(--panel)', color: 'var(--text-muted)' }}>
                  1. Напишите{' '}
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-soft)' }}>@BotFather</span>
                  {' '}в Telegram → <span className="font-mono" style={{ color: 'var(--text-soft)' }}>/newbot</span>
                  {' '}→ скопируйте token.<br />
                  2. Напишите боту <span className="font-mono font-semibold" style={{ color: 'var(--text-soft)' }}>@userinfobot</span>
                  {' '}→ получите ваш Chat ID.
                </div>
                <label className="block">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-soft)' }}>Bot token</span>
                  <input
                    value={form.telegram_token}
                    onChange={e => update('telegram_token', e.target.value)}
                    placeholder="1234567890:AA..."
                    className={`mt-1.5 ${inputClass}`} style={inputStyle}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-soft)' }}>Chat ID</span>
                  <input
                    value={form.telegram_chat_id}
                    onChange={e => update('telegram_chat_id', e.target.value)}
                    placeholder="-100..."
                    className={`mt-1.5 ${inputClass}`} style={inputStyle}
                  />
                </label>

                {telegramErrors.length > 0 && (
                  <div className="rounded-[9px] border px-3 py-2 text-xs"
                    style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                    {telegramErrors[0]}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void saveSettings('telegram')}
                    disabled={savingMode !== null || !telegramDirty}
                    className="rounded-[9px] border px-3 py-2 text-xs font-medium transition hover:border-current disabled:opacity-60"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}
                  >
                    {savingMode === 'telegram' ? 'Сохраняю…' : 'Сохранить'}
                  </button>
                  <button
                    onClick={handleTelegramTest}
                    disabled={testing || savingMode !== null}
                    className="rounded-[9px] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                    style={{ background: 'var(--accent)' }}
                  >
                    {testing ? 'Отправляю…' : 'Отправить тест'}
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Звук" subtitle="Сигнал при завершении цикла или изменении статуса">
              <div className="flex items-center justify-between gap-4 rounded-[10px] p-3"
                style={{ background: 'var(--panel)' }}>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                    {form.sound_enabled ? 'Звук включён' : 'Тихий режим'}
                  </p>
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {form.sound_enabled ? 'Сигнал при изменении статуса и при ошибке.' : 'Уведомления приходят только в Telegram.'}
                  </p>
                </div>
                <Toggle
                  checked={form.sound_enabled}
                  disabled={savingSound}
                  onChange={v => void handleSoundToggle(v)}
                />
              </div>
            </SectionCard>

            <SectionCard title="Поведение системы">
              <ul className="space-y-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                <li>Завершённые заявления автоматически исключаются из очереди.</li>
                <li>Архив не участвует в проверках, пока запись не вернётся в активные.</li>
                <li>Серверный планировщик работает, пока запущен сервер — браузер закрывать можно.</li>
                <li>Итоги каждого цикла приходят в Telegram, даже если изменений нет.</li>
              </ul>
            </SectionCard>

            <SectionCard title="Доступ в сети">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <Wifi size={13} className="shrink-0" />
                  <span>С любого устройства в той же сети:</span>
                </div>
                {lanIps.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Определяю адрес…</p>
                ) : (
                  lanIps.map(ip => (
                    <div key={ip}
                      className="flex items-center justify-between gap-2 rounded-[9px] px-3 py-2"
                      style={{ background: 'var(--panel)' }}
                    >
                      <span className="font-mono text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                        http://{ip}:3000
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(`http://${ip}:3000`).then(() =>
                          showToast({ title: 'Скопировано', tone: 'success' })
                        )}
                        className="rounded-[6px] px-2 py-1 text-[10px] font-medium transition hover:bg-white/10"
                        style={{ color: 'var(--accent)' }}
                      >
                        Копировать
                      </button>
                    </div>
                  ))
                )}
                <p className="text-[10px] leading-4" style={{ color: 'var(--text-muted)' }}>
                  Убедитесь что порт 3000 открыт в Windows Firewall.
                </p>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
