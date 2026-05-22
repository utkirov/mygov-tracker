'use client';

import { useEffect, useRef } from 'react';
import { syncEngineEvents } from '@/lib/sync-engine';
import { soundNotificationManager } from '@/lib/sound-notification';

export function SoundNotificationProvider() {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetch('/api/settings', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { sound_enabled?: boolean }) => {
        soundNotificationManager.setEnabled(data.sound_enabled !== false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleComplete = () => soundNotificationManager.playSound('success');
    const handleError = () => soundNotificationManager.playSound('error');
    window.addEventListener(syncEngineEvents.complete, handleComplete);
    window.addEventListener(syncEngineEvents.error, handleError);
    return () => {
      window.removeEventListener(syncEngineEvents.complete, handleComplete);
      window.removeEventListener(syncEngineEvents.error, handleError);
    };
  }, []);

  return null;
}
