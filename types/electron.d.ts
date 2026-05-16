declare global {
  interface Window {
    electron: {
      version: string;
      platform: string;
      onSyncCheckNow(callback: () => void): void;
      onNavigateToSettings(callback: () => void): void;
      removeSyncCheckNowListener(callback: () => void): void;
      removeNavigateToSettingsListener(callback: () => void): void;
    };
  }
}

export {};
