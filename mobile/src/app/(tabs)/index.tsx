import { View } from 'react-native';

import { ApplicationList } from '@/components/ApplicationList';
import { AttentionCard } from '@/components/AttentionCard';
import { UpdateCard } from '@/components/UpdateCard';
import { useAvailableUpdate } from '@/lib/updates';

export default function BoardScreen() {
  const { update, dismiss } = useAvailableUpdate();
  return (
    <ApplicationList
      archived={false}
      header={(
        <View style={{ gap: 12 }}>
          {update && <UpdateCard release={update} onDismiss={dismiss} />}
          <AttentionCard />
        </View>
      )}
    />
  );
}
