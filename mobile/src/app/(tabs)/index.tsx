import { ApplicationList } from '@/components/ApplicationList';
import { UpdateCard } from '@/components/UpdateCard';
import { useAvailableUpdate } from '@/lib/updates';

export default function BoardScreen() {
  const { update, dismiss } = useAvailableUpdate();
  return <ApplicationList archived={false} header={update ? <UpdateCard release={update} onDismiss={dismiss} /> : undefined} />;
}
