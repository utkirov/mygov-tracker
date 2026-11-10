import { useColorScheme } from 'react-native';

// Same tokens as the website (app/globals.css) and the approved Figma design:
// TURON PROJECT brand: cream / ink, one violet accent, status shown as a dot.
const light = {
  bg: '#F3F1EC',
  surface: '#FFFFFF',
  panel: '#ECE9E2',
  border: '#E2DED5',
  text: '#0C0C0E',
  textSoft: '#52525B',
  textMuted: '#8E8B94',
  primary: '#0B0B0D',
  onPrimary: '#FFFFFF',
  accent: '#7C4DFF',
  danger: '#DC2626',
  status: {
    new: '#2563EB',
    processing: '#D97706',
    waiting: '#DC2626',
    done: '#16A34A',
    rejected: '#BE123C',
    canceled: '#71717A',
  },
};

const dark: typeof light = {
  bg: '#0C0C0E',
  surface: '#151518',
  panel: '#1C1B20',
  border: '#27272A',
  text: '#F3F1EC',
  textSoft: '#A1A1AA',
  textMuted: '#8E8B94',
  primary: '#F4F4F5',
  onPrimary: '#0B0B0D',
  accent: '#A688FF',
  danger: '#F87171',
  status: {
    new: '#60A5FA',
    processing: '#FBBF24',
    waiting: '#F87171',
    done: '#4ADE80',
    rejected: '#FB7185',
    canceled: '#A1A1AA',
  },
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  mono: 'monospace',
};

export const radius = { card: 12, inner: 8 };
