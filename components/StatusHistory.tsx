// components/StatusHistory.tsx
import type { StatusHistory as TStatusHistory } from '@/types';
import { getStatusType } from '@/types';

interface Props {
  history: TStatusHistory[];
}

export function StatusHistory({ history }: Props) {
  if (history.length === 0) return <p className="text-sm text-gray-400">История статусов пуста</p>;

  return (
    <div className="flex flex-col gap-3">
      {history.map((entry, i) => {
        const type = getStatusType(entry.acting_party, entry.status);
        const dotColor = {
          action_required: 'bg-red-500',
          in_progress: 'bg-yellow-400',
          completed: 'bg-green-500',
        }[type];

        return (
          <div key={entry.id} className="flex items-start gap-3">
            <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${i === 0 ? dotColor : 'bg-gray-300'}`} />
            <div>
              <div className={`text-sm font-medium ${i === 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                {entry.status}
              </div>
              {entry.current_action && (
                <div className="text-xs text-gray-400">{entry.current_action}</div>
              )}
              <div className="text-xs text-gray-400 mt-0.5">
                {new Date(entry.recorded_at).toLocaleString('ru-RU')}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
