// components/StatusBadge.tsx
import { getStatusType } from '@/types';

interface Props {
  status: string;
  acting_party: string;
}

export function StatusBadge({ status, acting_party }: Props) {
  const type = getStatusType(acting_party, status);

  const styles = {
    action_required: 'bg-red-100 text-red-700',
    in_progress: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-700',
  };

  const icons = {
    action_required: '⚠ ',
    in_progress: '',
    completed: '✓ ',
  };

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${styles[type]}`}>
      {icons[type]}{status}
    </span>
  );
}
