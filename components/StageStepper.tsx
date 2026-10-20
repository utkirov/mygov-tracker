'use client';

import { useState } from 'react';

import type { Checklist, ProgressStep } from '@/types';

const DOT: Record<ProgressStep['state'], { bg: string; fg: string; mark: string }> = {
  done: { bg: 'var(--success)', fg: '#fff', mark: '✓' },
  current: { bg: 'var(--warning)', fg: '#fff', mark: '•••' },
  pending: { bg: 'var(--panel)', fg: 'var(--text-muted)', mark: '' },
  skipped: { bg: 'transparent', fg: 'var(--text-muted)', mark: '–' },
};

function shortDate(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  return m ? `${m[3]}.${m[2]} ${m[4]}:${m[5]}` : value;
}

/**
 * «На какой стадии находится заявка?» as a stepper — the portal's own
 * progress block. Steps of branches the application didn't take are hidden
 * by default; the final outcome is the last step.
 */
export function StageStepper({ checklist, compact = false }: { checklist: Pick<Checklist, 'progress' | 'outcome'>; compact?: boolean }) {
  const [showSkipped, setShowSkipped] = useState(false);
  const skippedCount = checklist.progress.filter(s => s.state === 'skipped').length;
  const steps = checklist.progress.filter(s => showSkipped || s.state !== 'skipped');
  const outcome = checklist.outcome === 'rejected' ? { label: 'Отклонено', bg: 'var(--danger)', mark: '✕' }
    : checklist.outcome === 'approved' ? { label: 'Обработано', bg: 'var(--success)', mark: '✓' }
      : null;
  if (steps.length === 0) return null;
  const size = compact ? 28 : 36;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <ol className="flex min-w-max items-start">
          {steps.map((step, i) => {
            const dot = DOT[step.state];
            const next = steps[i + 1];
            const lineDone = step.state === 'done' && (!next || next.state === 'done' || next.state === 'current');
            return (
              <li key={`${step.title}-${i}`} className="flex items-start">
                <div className="flex flex-col items-center text-center" style={{ width: compact ? 84 : 112 }}>
                  <span
                    className={`flex items-center justify-center rounded-full text-[12px] font-bold ${step.state === 'current' ? 'animate-pulse' : ''}`}
                    style={{
                      width: size, height: size, background: dot.bg, color: dot.fg,
                      border: step.state === 'pending' ? '1px solid var(--border-strong)' : step.state === 'skipped' ? '1px dashed var(--border-strong)' : 'none',
                    }}
                  >
                    {dot.mark}
                  </span>
                  <span className="mt-1.5 line-clamp-2 px-1 text-[11px] font-medium leading-[1.3]"
                    style={{ color: step.state === 'pending' || step.state === 'skipped' ? 'var(--text-muted)' : 'var(--text)' }}
                    title={step.title}>
                    {step.title}
                  </span>
                  {step.date && <span className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">{shortDate(step.date)}</span>}
                </div>
                {(next || outcome) && (
                  <span className="mt-[17px] h-[3px] w-6 shrink-0 rounded-full"
                    style={{ background: lineDone ? 'var(--success)' : 'var(--border)', marginTop: size / 2 - 1 }} />
                )}
              </li>
            );
          })}
          {outcome && (
            <li className="flex flex-col items-center text-center" style={{ width: compact ? 84 : 112 }}>
              <span className="flex items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ width: size, height: size, background: outcome.bg }}>
                {outcome.mark}
              </span>
              <span className="mt-1.5 text-[11px] font-semibold" style={{ color: outcome.bg }}>{outcome.label}</span>
            </li>
          )}
        </ol>
      </div>
      {skippedCount > 0 && (
        <button type="button" onClick={() => setShowSkipped(v => !v)} className="mt-1 text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
          {showSkipped ? 'Скрыть другие ветки' : `Другие возможные этапы (${skippedCount})`}
        </button>
      )}
    </div>
  );
}
