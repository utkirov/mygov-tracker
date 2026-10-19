import { useColorScheme } from 'react-native';

// Same tokens as the website (app/globals.css) and the approved Figma design:
// neutral greys, black primary, one blue accent, status shown as a dot.
const light = {
  bg: '#F7F7F8',
  surface: '#FFFFFF',
  panel: '#F2F2F4',
  border: '#E4E4E7',
  text: '#0B0B0D',
  textSoft: '#52525B',
  textMuted: '#8B8B94',
  primary: '#0B0B0D',
  onPrimary: '#FFFFFF',
  accent: '#2563EB',
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
  bg: '#0B0B0D',
  surface: '#141416',
  panel: '#1C1C1F',
  border: '#27272A',
  text: '#F4F4F5',
  textSoft: '#A1A1AA',
  textMuted: '#71717A',
  primary: '#F4F4F5',
  onPrimary: '#0B0B0D',
  accent: '#60A5FA',
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
