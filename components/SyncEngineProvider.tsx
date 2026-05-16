'use client';

import { useEffect } from 'react';
import { startSyncEngine } from '@/lib/sync-engine';

export function SyncEngineProvider() {
  useEffect(() => {
    startSyncEngine();
  }, []);

  return null;
}
