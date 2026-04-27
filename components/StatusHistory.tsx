import type { StatusHistory as TStatusHistory } from '@/types';
import { getStatusType } from '@/types';

interface Props {
  history: TStatusHistory[];
}

export function StatusHistory({ history }: Props) {
  if (history.length === 0) return <p className="text-sm text-[var(--text2)]">История статусов пуста</p>;

  return (
    <div className="flex flex-col gap-3">
      {history.map((entry, i) => {
        const type = getStatusType(entry.acting_party, entry.status);
        const dotColor = {
          action_required: '#ff3b30',
          in_progress: '#ff9500',
          completed: '#34c759',
        }[type];

        return (
          <div key={entry.id} className="flex items-start gap-3">
            <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{
              background: i === 0 ? dotColor : 'var(--border)'
            }} />
            <div>
              <div className={`text-sm font-medium ${i === 0 ? 'text-[var(--text)]' : 'text-[var(--text2)]'}`}>
                {entry.status}
              </div>
              {entry.current_action && (
                <div className="text-xs text-[var(--text3)] mt-0.5">{entry.current_action}</div>
              )}
              <div className="text-xs text-[var(--text3)] mt-0.5">
                {new Date(entry.recorded_at).toLocaleString('ru-RU')}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
