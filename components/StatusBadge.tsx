import { getStatusType } from '@/types';

interface Props {
  status: string;
  acting_party: string;
}

export function StatusBadge({ status, acting_party }: Props) {
  const type = getStatusType(acting_party, status);

  const styles = {
    action_required: 'bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400',
    in_progress: 'bg-orange-500/10 text-orange-500 dark:bg-orange-500/20 dark:text-orange-400',
    completed: 'bg-green-500/10 text-green-500 dark:bg-green-500/20 dark:text-green-400',
  };

  const icons = {
    action_required: '⚠ ',
    in_progress: '⏳ ',
    completed: '✓ ',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${styles[type]}`}>
      <span>{icons[type]}</span>
      {status}
    </span>
  );
}
