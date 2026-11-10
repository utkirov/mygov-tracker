import Link from 'next/link';

import type { PipelineStep } from '@/lib/project-pipeline';

const LOOK: Record<PipelineStep['state'], { bg: string; fg: string; mark: string; text: string }> = {
  done: { bg: 'var(--success)', fg: '#fff', mark: '✓', text: 'одобрено' },
  active: { bg: 'var(--accent)', fg: '#fff', mark: '•', text: 'в работе' },
  rejected: { bg: 'var(--danger)', fg: '#fff', mark: '✕', text: 'отказ — подать снова' },
  none: { bg: 'transparent', fg: 'var(--text-muted)', mark: '', text: 'не подавали' },
};

/** АПЗ → ПСД → СМР → приёмка → кадастр for one project (lib/project-pipeline.ts). */
export function ProjectPipeline({ steps, compact = false }: { steps: PipelineStep[]; compact?: boolean }) {
  return (
    <ol className={`grid gap-2 ${compact ? 'grid-cols-5' : 'sm:grid-cols-5'}`}>
      {steps.map((s, i) => {
        const look = LOOK[s.state];
        const body = (
          <>
            <span className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: look.bg, color: look.fg, border: s.state === 'none' ? '1.5px dashed var(--border-strong)' : 'none' }}>
                {look.mark || i + 1}
              </span>
              {!compact && <span className="text-[12px] font-semibold leading-[1.25]" style={{ color: s.state === 'none' ? 'var(--text-muted)' : 'var(--text)' }}>{s.label}</span>}
            </span>
            {!compact && (
              <span className="mt-1 block text-[11px]" style={{ color: s.state === 'rejected' ? 'var(--danger)' : 'var(--text-muted)' }}>
                {look.text}{s.attempts > 1 ? ` · подач: ${s.attempts}` : ''}
              </span>
            )}
          </>
        );
        return (
          <li key={s.id} title={`${s.label}: ${look.text}`} className={compact ? '' : 'rounded-[10px] p-2.5'} style={compact ? undefined : { background: 'var(--panel)' }}>
            {!compact && s.applicationIds[0] ? <Link href={`/applications/${s.applicationIds[0]}`} className="block hover:opacity-80">{body}</Link> : body}
          </li>
        );
      })}
    </ol>
  );
}
