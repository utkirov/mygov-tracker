'use client';

import { useState } from 'react';

import { showToast } from '@/lib/toast';
import type { ApprovalStatus, Checklist } from '@/types';

const COLOR: Record<ApprovalStatus, string> = {
  ok: 'var(--success)',
  bad: 'var(--danger)',
  other: 'var(--text-muted)',
  wait: 'var(--border-strong)',
};
const LABEL: Record<ApprovalStatus, string> = { ok: 'Согласовано', bad: 'Отказ', other: 'Ответ', wait: 'Ожидается' };

function Bar({ counts }: { counts: Checklist['counts'] }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--panel)' }}>
      {(['ok', 'other', 'bad', 'wait'] as const).map(k => counts[k] > 0 && (
        <span key={k} style={{ flex: counts[k], background: COLOR[k] }} />
      ))}
    </div>
  );
}

interface Props {
  applicationId: string;
  checklist: Checklist | null;
  onChange: (next: Checklist) => void;
}

/** «Чек-лист» from the mygov-extension: who approved, who is pending, why it was rejected. */
export default function ChecklistSection({ applicationId, checklist, onChange }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [showAllCriteria, setShowAllCriteria] = useState(false);
  const [openText, setOpenText] = useState<number | null>(0);

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}/checklist`, { method: 'POST' });
      const payload = await response.json().catch(() => null) as { checklist?: Checklist; error?: string } | null;
      if (!response.ok || !payload?.checklist) throw new Error(payload?.error ?? 'Не удалось обновить');
      onChange(payload.checklist);
    } catch (error) {
      showToast({ title: 'Согласования не обновлены', description: error instanceof Error ? error.message : '', tone: 'error' });
    } finally {
      setRefreshing(false);
    }
  }

  const refreshButton = (
    <button type="button" onClick={() => void refresh()} disabled={refreshing}
      className="rounded-[8px] border px-2.5 py-1 text-[11px] font-medium disabled:opacity-60"
      style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}>
      {refreshing ? 'Обновляю…' : 'Обновить'}
    </button>
  );

  if (!checklist) {
    return (
      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Согласования</h2>
          {refreshButton}
        </div>
        <p className="text-xs text-[var(--text-muted)]">Появятся после следующей проверки — или нажмите «Обновить».</p>
      </section>
    );
  }

  const { orgs, counts, result } = checklist;
  const failed = result?.criteria.filter(c => c.status === 'bad') ?? [];
  const criteria = showAllCriteria ? result?.criteria ?? [] : failed;

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--text)]">Согласования</h2>
          {counts.total > 0 && (
            <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
              <b style={{ color: 'var(--success)' }}>{counts.ok}</b> из {counts.total} согласовано
              {counts.bad > 0 && <> · <b style={{ color: 'var(--danger)' }}>{counts.bad} отказ</b></>}
              {counts.wait > 0 && <> · ждём {counts.wait}</>}
            </p>
          )}
        </div>
        {refreshButton}
      </div>

      {result && (
        <div className="mb-4 rounded-[10px] p-3.5"
          style={{ background: result.kind === 'rejected' ? 'var(--danger-soft)' : 'var(--success-soft)' }}>
          <p className="text-[13px] font-semibold" style={{ color: result.kind === 'rejected' ? 'var(--danger)' : 'var(--success)' }}>
            {result.kind === 'rejected' ? '✕ Отказ' : '✓ Заключение выдано'}
            {result.number && <span className="font-normal"> · № {result.number}</span>}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {[result.stage, result.date, result.actor].filter(Boolean).join(' · ')}
          </p>

          {criteria.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {criteria.map(c => (
                <li key={c.label} className="flex items-start gap-2 text-[12px]">
                  <span className="mt-0.5 shrink-0 font-bold" style={{ color: COLOR[c.status] }}>{c.status === 'bad' ? '✕' : c.status === 'ok' ? '✓' : '•'}</span>
                  <span className="text-[var(--text)]">{c.label}</span>
                  <span className="ml-auto shrink-0 text-[var(--text-muted)]">{c.value}</span>
                </li>
              ))}
            </ul>
          )}
          {result.criteria.length > failed.length && (
            <button type="button" onClick={() => setShowAllCriteria(v => !v)} className="mt-2 text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
              {showAllCriteria ? 'Только невыполненные' : `Все критерии (${result.criteria.length})`}
            </button>
          )}

          {result.texts.map((t, i) => (
            <div key={i} className="mt-2.5 rounded-[8px] p-2.5" style={{ background: 'var(--surface)' }}>
              <button type="button" onClick={() => setOpenText(openText === i ? null : i)} className="flex w-full items-center justify-between gap-2 text-left">
                <span className="text-[12px] font-semibold text-[var(--text)]">{t.label}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{openText === i ? '▴' : '▾'}</span>
              </button>
              {openText === i && <p className="mt-1.5 whitespace-pre-line text-[12px] leading-[1.55] text-[var(--text-soft)]">{t.text}</p>}
            </div>
          ))}
        </div>
      )}

      {counts.total > 0 && <Bar counts={counts} />}

      {orgs.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {orgs.map(o => (
            <li key={o.name} className="flex items-start gap-2.5 py-2">
              <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR[o.status] }} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-[var(--text)]">{o.name}</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  {o.status === 'wait' ? 'Ожидается ответ' : [o.verdict || LABEL[o.status], o.date].filter(Boolean).join(' · ')}
                </p>
                {o.comment && o.comment !== o.verdict && (
                  <p className="mt-1 whitespace-pre-line text-[11px] leading-[1.5] text-[var(--text-soft)]">{o.comment}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {counts.total === 0 && !result && (
        <p className="text-xs text-[var(--text-muted)]">По этой услуге согласования с комиссиями не проводятся — смотрите этапы ниже.</p>
      )}

      {checklist.stages.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-medium" style={{ color: 'var(--accent)' }}>Этапы рассмотрения ({checklist.stages.length})</summary>
          <ol className="mt-2 space-y-1.5">
            {checklist.stages.map((s, i) => (
              <li key={i} className="text-[11px]">
                <span className="font-semibold text-[var(--text)]">{s.title}</span>
                <span className="text-[var(--text-muted)]"> · {s.date}{s.actor ? ` · ${s.actor}` : ''}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {checklist.correction && (
        <p className="mt-3 rounded-[8px] p-2.5 text-[11px] leading-[1.5]" style={{ background: 'var(--panel)', color: 'var(--text-soft)' }}>
          <b>Исправление заявки:</b> {checklist.correction}
        </p>
      )}
      {checklist.chain.length > 1 && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">Повторные подачи: {checklist.chain.map(n => `№ ${n}`).join(' → ')}</p>
      )}
    </section>
  );
}
