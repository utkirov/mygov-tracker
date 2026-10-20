import { requireOptionalNativeModule } from 'expo';

interface LiveUpdateNative {
  isPromotionSupported(): boolean;
  show(id: number, title: string, text: string, progress: number, max: number, indeterminate: boolean): void;
  end(id: number): void;
}

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
};
