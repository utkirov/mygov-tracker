import { requireOptionalNativeModule } from 'expo';

interface LiveUpdateNative {
  isPromotionSupported(): boolean;
  show(id: number, title: string, text: string, progress: number, max: number, indeterminate: boolean): void;
  end(id: number): void;
  showStatus?(id: number, title: string, text: string, semantic: string): void;
}

export type Semantic = 'danger' | 'caution' | 'info' | 'safe';

// Optional: an older APK (or Expo Go) without the native part simply shows nothing.
const native = requireOptionalNativeModule<LiveUpdateNative>('LiveUpdate');

/** Android 16 Live Update; on Nothing OS 4 it also drives Glyph Progress. */
export const liveUpdate = {
  available: native !== null,
  promoted: native?.isPromotionSupported() ?? false,
  show(id: number, title: string, text: string, progress = 0, max = 100, indeterminate = false): void {
    try { native?.show(id, title, text, Math.round(progress), Math.round(max), indeterminate); } catch { /* notifications blocked */ }
  },
  end(id: number): void {
    try { native?.end(id); } catch { /* ignore */ }
  },
  /** Ongoing reminder; on Android 17 the text is tinted by meaning (red = danger, …). */
  showStatus(id: number, title: string, text: string, semantic: Semantic): void {
    try { native?.showStatus?.(id, title, text, semantic); } catch { /* ignore */ }
  },
};
