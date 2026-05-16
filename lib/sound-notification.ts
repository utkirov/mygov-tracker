'use client';

type SoundType = 'success' | 'error' | 'info';

class SoundNotificationManager {
  private audioContexts: Map<SoundType, AudioContext> = new Map();
  private isEnabled = true;

  async playSound(type: SoundType) {
    if (!this.isEnabled || typeof window === 'undefined') return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Frequency and duration based on type
      const sounds: Record<SoundType, { freq: number; duration: number }> = {
        success: { freq: 800, duration: 0.1 },
        error: { freq: 300, duration: 0.15 },
        info: { freq: 600, duration: 0.08 },
      };

      const { freq, duration } = sounds[type];
      oscillator.frequency.value = freq;

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      console.debug('Sound notification failed:', error);
    }
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }
}

export const soundNotificationManager = new SoundNotificationManager();

export function useSoundNotification() {
  return {
    success: () => soundNotificationManager.playSound('success'),
    error: () => soundNotificationManager.playSound('error'),
    info: () => soundNotificationManager.playSound('info'),
  };
}
