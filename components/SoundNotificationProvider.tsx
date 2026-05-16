'use client';

import { useEffect } from 'react';
import { syncEngineEvents } from '@/lib/sync-engine';
import { useSoundNotification } from '@/lib/sound-notification';

export function SoundNotificationProvider() {
  const sound = useSoundNotification();

  useEffect(() => {
    const handleSyncComplete = () => {
      sound.success();
    };

    const handleSyncError = () => {
      sound.error();
    };

    window.addEventListener(syncEngineEvents.complete, handleSyncComplete);
    window.addEventListener(syncEngineEvents.error, handleSyncError);

    return () => {
      window.removeEventListener(syncEngineEvents.complete, handleSyncComplete);
      window.removeEventListener(syncEngineEvents.error, handleSyncError);
    };
  }, [sound]);

  // This component renders nothing, just sets up listeners
  return null;
}
