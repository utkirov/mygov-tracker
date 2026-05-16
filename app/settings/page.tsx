'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { requestImmediateSyncRun, useSyncEngineSnapshot } from '@/lib/sync-engine';
import { showToast } from '@/lib/toast';

interface SettingsForm {
  telegram_token: string;
  telegram_chat_id: string;
  auto_check_enabled: boolean;
  auto_check_interval: string;
  auto_check_delay_ms: string;
  auto_check_concurrency: string;
}

type SaveMode = 'queue' | 'telegram' | 'all';

function toInputValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function readPositiveNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readNonNegativeNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

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
  };
}

export default function SettingsPage() {
  const sync = useSyncEngineSnapshot();
  const [form, setForm] = useState<SettingsForm>({
    telegram_token: '',
    telegram_chat_id: '',
    auto_check_enabled: false,
    auto_check_interval: '',
    auto_check_delay_ms: '',
    auto_check_concurrency: '',
  });
  const [initialForm, setInitialForm] = useState<SettingsForm | null>(null);
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null);
  const [testing, setTesting] = useState(false);

  const loadSettings = useEffectEvent(async () => {
    const response = await fetch('/api/settings', { cache: 'no-store' });
    const payload = await response.json() as Record<string, unknown>;
    const nextForm = buildForm(payload);
    setForm(nextForm);
    setInitialForm(nextForm);
  });

  useEffect(() => {
    void loadSettings();
  }, []);

  const queueDraft = useMemo(
    () => ({
      auto_check_enabled: form.auto_check_enabled,
      auto_check_interval: form.auto_check_interval,
      auto_check_delay_ms: form.auto_check_delay_ms,
      auto_check_concurrency: form.auto_check_concurrency,
    }),
    [form]
  );

  const queueInitial = useMemo(
    () =>
      initialForm
        ? {
            auto_check_enabled: initialForm.auto_check_enabled,
            auto_check_interval: initialForm.auto_check_interval,
            auto_check_delay_ms: initialForm.auto_check_delay_ms,
            auto_check_concurrency: initialForm.auto_check_concurrency,
          }
        : null,
    [initialForm]
  );

  const telegramDraft = useMemo(
    () => ({
      telegram_token: form.telegram_token,
      telegram_chat_id: form.telegram_chat_id,
    }),
    [form]
  );

  const telegramInitial = useMemo(
    () =>
      initialForm
        ? {
            telegram_token: initialForm.telegram_token,
            telegram_chat_id: initialForm.telegram_chat_id,
          }
        : null,
    [initialForm]
  );

  const queueDirty =
    queueInitial !== null && JSON.stringify(queueDraft) !== JSON.stringify(queueInitial);
  const telegramDirty =
    telegramInitial !== null && JSON.stringify(telegramDraft) !== JSON.stringify(telegramInitial);
  const anythingDirty = queueDirty || telegramDirty;

  const queueErrors = useMemo(() => {
    const nextErrors: string[] = [];

    if (form.auto_check_enabled) {
      if (readPositiveNumber(form.auto_check_interval) === null) {
        nextErrors.push('Интервал должен быть целым числом больше 0.');
      }

      if (readNonNegativeNumber(form.auto_check_delay_ms) === null) {
        nextErrors.push('Пауза между проверками должна быть 0 или больше.');
      }

      const concurrency = readPositiveNumber(form.auto_check_concurrency);
      if (concurrency === null) {
        nextErrors.push('Лимит параллельности должен быть целым числом больше 0.');
      } else if (concurrency > 5) {
        nextErrors.push('Для my.gov лучше держать лимит параллельности не выше 5.');
      }
    }

    return nextErrors;
  }, [form.auto_check_concurrency, form.auto_check_delay_ms, form.auto_check_enabled, form.auto_check_interval]);

  const telegramErrors = useMemo(() => {
    const nextErrors: string[] = [];

    if (form.telegram_token.trim() && !form.telegram_token.includes(':')) {
      nextErrors.push('Bot token должен содержать ":" и выглядеть как токен Telegram-бота.');
    }

    if (form.telegram_chat_id.trim() && !/^-?\d+$/.test(form.telegram_chat_id.trim())) {
      nextErrors.push('Chat ID должен быть числом, например `123456789` или `-100...`.');
    }

    return nextErrors;
  }, [form.telegram_chat_id, form.telegram_token]);

  function update<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(mode: SaveMode, runNow = false) {
    const payload: Record<string, unknown> = {};

    if (mode === 'queue' || mode === 'all') {
      if (queueErrors.length > 0) {
        showToast({
          title: 'Проверь параметры очереди',
          description: queueErrors[0],
          tone: 'warning',
        });
        return false;
      }

      payload.auto_check_enabled = form.auto_check_enabled;
      payload.auto_check_interval = form.auto_check_interval.trim();
      payload.auto_check_delay_ms = form.auto_check_delay_ms.trim();
      payload.auto_check_concurrency = form.auto_check_concurrency.trim();
    }

    if (mode === 'telegram' || mode === 'all') {
      if (telegramErrors.length > 0) {
        showToast({
          title: 'Проверь Telegram-поля',
          description: telegramErrors[0],
          tone: 'warning',
        });
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

      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Не удалось сохранить настройки');
      }

      await loadSettings();

      showToast({
        title:
          mode === 'telegram'
            ? 'Telegram-настройки сохранены'
            : runNow
              ? 'Настройки сохранены и цикл поставлен в запуск'
              : 'Настройки очереди сохранены',
        description:
          mode === 'telegram'
            ? 'Теперь можно сразу отправить тестовое сообщение.'
            : runNow
              ? 'Новая конфигурация применена, очередь запустится сразу.'
              : 'Новая конфигурация фоновой очереди уже активна.',
        tone: 'success',
      });

      if (runNow) {
        requestImmediateSyncRun();
      }

      return true;
    } catch (error) {
      showToast({
        title: 'Сохранение не выполнено',
        description: error instanceof Error ? error.message : 'Повтори попытку ещё раз.',
        tone: 'error',
      });
      return false;
    } finally {
      setSavingMode(null);
    }
  }

  async function handleTelegramTest() {
    if (!form.telegram_token.trim() || !form.telegram_chat_id.trim()) {
      showToast({
        title: 'Нужны token и chat ID',
        description: 'Сначала заполни оба поля Telegram, затем отправляй тест.',
        tone: 'warning',
      });
      return;
    }

    if (telegramErrors.length > 0) {
      showToast({
        title: 'Проверь Telegram-поля',
        description: telegramErrors[0],
        tone: 'warning',
      });
      return;
    }

    setTesting(true);

    try {
      if (telegramDirty) {
        const saved = await saveSettings('telegram');
        if (!saved) {
          return;
        }
      }

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: form.telegram_token.trim(),
          chatId: form.telegram_chat_id.trim(),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Telegram не ответил');
      }

      showToast({
        title: 'Тестовое сообщение отправлено',
        description: 'Проверь Telegram-чат. Сообщение должно прийти сразу.',
        tone: 'success',
      });
    } catch (error) {
      showToast({
        title: 'Telegram test не прошёл',
        description: error instanceof Error ? error.message : 'Проверь token и chat ID.',
        tone: 'error',
      });
    } finally {
      setTesting(false);
    }
  }

  const queueInterval = readPositiveNumber(form.auto_check_interval) ?? 15;
  const queueDelay = readNonNegativeNumber(form.auto_check_delay_ms) ?? 2500;
  const queueConcurrency = readPositiveNumber(form.auto_check_concurrency) ?? 1;

  return (
    <div className="px-4 py-5 md:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] md:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Scheduler control
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">
            Настройки фонового обновления
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-soft)] md:text-base">
            Здесь настраивается общая очередь проверки. Пока локальное окно открыто, приложение
            само проходит по всем активным заявлениям. Архивные и завершённые записи исключаются
            автоматически.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Автообновление
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                {sync.enabled ? 'Включено' : 'Выключено'}
              </p>
            </div>
            <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                Интервал
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                {sync.intervalMinutes} мин
              </p>
            </div>
            <div className="rounded-[24px] bg-[var(--panel-strong)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                В очереди
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                {sync.queueLength}
              </p>
            </div>
            <button
              onClick={() => requestImmediateSyncRun()}
              className="rounded-[24px] bg-[var(--accent)] px-4 py-4 text-sm font-semibold text-white transition hover:brightness-105"
            >
              Запустить цикл сейчас
            </button>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                    Автообновление
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    Очередь проверки
                  </h2>
                </div>
                {queueDirty && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
                    Есть несохранённые изменения
                  </span>
                )}
              </div>

              <div className="mt-5 space-y-5">
                <label className="flex items-center justify-between gap-4 rounded-[24px] bg-[var(--panel-strong)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">Включить общую очередь</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-soft)]">
                      Когда переключатель активен, приложение само проходит по всем активным
                      заявлениям и запускает новый цикл по расписанию.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.auto_check_enabled}
                    onChange={(event) => update('auto_check_enabled', event.target.checked)}
                    className="h-5 w-5 accent-[var(--accent)]"
                  />
                </label>

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-[24px] bg-[var(--panel)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      Интервал
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[5, 15, 30, 60].map((minutes) => (
                        <button
                          key={minutes}
                          onClick={() => update('auto_check_interval', String(minutes))}
                          className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                            form.auto_check_interval === String(minutes)
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[var(--panel-strong)] text-[var(--text-soft)]'
                          }`}
                        >
                          {minutes} мин
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={form.auto_check_interval}
                      onChange={(event) => update('auto_check_interval', event.target.value)}
                      className="mt-3 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="rounded-[24px] bg-[var(--panel)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      Пауза между стартами
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[0, 1000, 2500, 5000].map((delay) => (
                        <button
                          key={delay}
                          onClick={() => update('auto_check_delay_ms', String(delay))}
                          className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                            form.auto_check_delay_ms === String(delay)
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[var(--panel-strong)] text-[var(--text-soft)]'
                          }`}
                        >
                          {delay === 0 ? 'без паузы' : `${delay} мс`}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={form.auto_check_delay_ms}
                      onChange={(event) => update('auto_check_delay_ms', event.target.value)}
                      className="mt-3 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="rounded-[24px] bg-[var(--panel)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      Параллельность
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[1, 2, 3].map((limit) => (
                        <button
                          key={limit}
                          onClick={() => update('auto_check_concurrency', String(limit))}
                          className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                            form.auto_check_concurrency === String(limit)
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[var(--panel-strong)] text-[var(--text-soft)]'
                          }`}
                        >
                          {limit}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={form.auto_check_concurrency}
                      onChange={(event) => update('auto_check_concurrency', event.target.value)}
                      className="mt-3 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                <div className="rounded-[24px] bg-[var(--panel-strong)] p-4 text-sm leading-6 text-[var(--text-soft)]">
                  <p>
                    Текущая конфигурация:
                    {' '}
                    <span className="font-semibold text-[var(--text)]">{queueInterval} мин</span>
                    {' '}между циклами,
                    {' '}
                    <span className="font-semibold text-[var(--text)]">{queueDelay} мс</span>
                    {' '}между стартами проверок,
                    {' '}
                    <span className="font-semibold text-[var(--text)]">{queueConcurrency}</span>
                    {' '}одновременных запросов.
                  </p>
                  <p className="mt-2">
                    Лимит параллельности теперь реально применяется внутри очереди. Если my.gov
                    начнёт отвечать нестабильно, снижай параллельность до `1`.
                  </p>
                </div>

                {queueErrors.length > 0 && (
                  <div className="rounded-[24px] border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                    <p className="font-semibold">Параметры очереди требуют правки</p>
                    <ul className="mt-2 space-y-1">
                      {queueErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => void saveSettings('queue')}
                    disabled={savingMode !== null || !queueDirty}
                    className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                  >
                    {savingMode === 'queue' ? 'Сохраняю…' : 'Сохранить очередь'}
                  </button>
                  <button
                    onClick={() => void saveSettings('queue', true)}
                    disabled={savingMode !== null}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)] disabled:opacity-60"
                  >
                    Сохранить и запустить цикл
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                    Telegram
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    Уведомления
                  </h2>
                </div>
                {telegramDirty && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
                    Не сохранено
                  </span>
                )}
              </div>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-[var(--text)]">Bot token</span>
                  <input
                    value={form.telegram_token}
                    onChange={(event) => update('telegram_token', event.target.value)}
                    placeholder="1234567890:AA..."
                    className="mt-2 w-full rounded-[20px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-[var(--text)]">Chat ID</span>
                  <input
                    value={form.telegram_chat_id}
                    onChange={(event) => update('telegram_chat_id', event.target.value)}
                    placeholder="-100..."
                    className="mt-2 w-full rounded-[20px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <div className="rounded-[24px] bg-[var(--panel-strong)] p-4 text-sm leading-6 text-[var(--text-soft)]">
                  Сначала сохрани token и chat ID. Кнопка теста сама подхватит свежие значения и
                  отправит сообщение без отдельной перезагрузки страницы.
                </div>

                {telegramErrors.length > 0 && (
                  <div className="rounded-[24px] border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                    <p className="font-semibold">Telegram-поля требуют правки</p>
                    <ul className="mt-2 space-y-1">
                      {telegramErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => void saveSettings('telegram')}
                    disabled={savingMode !== null || !telegramDirty}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)] disabled:opacity-60"
                  >
                    {savingMode === 'telegram' ? 'Сохраняю…' : 'Сохранить Telegram'}
                  </button>
                  <button
                    onClick={handleTelegramTest}
                    disabled={testing || savingMode !== null}
                    className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                  >
                    {testing ? 'Отправляю…' : 'Отправить тест'}
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                Поведение системы
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--text-soft)]">
                <li>Завершённые заявления автоматически исключаются из очереди.</li>
                <li>Архив не участвует в проверках, пока запись не вернётся обратно в активные.</li>
                <li>Toast-уведомления справа снизу показывают ошибки, ручной запуск и новые изменения.</li>
                <li>Если открыть другой раздел, очередь продолжит работать. После закрытия приложения цикл останавливается.</li>
              </ul>
            </section>

            {anythingDirty && (
              <section className="rounded-[32px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[var(--shadow-card)]">
                <p className="text-sm font-semibold text-[var(--text)]">Есть несохранённые изменения</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
                  Очередь и Telegram сохраняются независимо. Можно обновить только нужный блок,
                  без перезаписи всех настроек сразу.
                </p>
              </section>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
