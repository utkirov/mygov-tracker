'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { requestImmediateSyncRun } from '@/lib/sync-engine';

export function TrayListeners() {
  const router = useRouter();

  useEffect(() => {
    // Only in Electron environment
    if (typeof window === 'undefined' || !window.electron) {
      return;
    }

    const handleSyncCheckNow = () => {
      requestImmediateSyncRun();
    };

    const handleNavigateToSettings = () => {
      router.push('/settings');
    };

    // Register listeners
    window.electron.onSyncCheckNow(handleSyncCheckNow);
    window.electron.onNavigateToSettings(handleNavigateToSettings);

    // Cleanup: unregister when component unmounts
    return () => {
      window.electron.removeSyncCheckNowListener(handleSyncCheckNow);
      window.electron.removeNavigateToSettingsListener(handleNavigateToSettings);
    };
  }, [router]);

  // This component renders nothing, just sets up listeners
  return null;
}
