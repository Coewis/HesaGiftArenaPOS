// HESA GIFT ARENA POS - Design System
// Fresh Green + White palette — brand refresh 2026

export const Colors = {
  // Brand Core — Dark green backgrounds
  navy: '#0A1F0E',
  navyMid: '#0D2613',
  navyLight: '#122C17',
  navyCard: '#163520',

  // White / Light
  white: '#FFFFFF',
  offWhite: '#F4FAF5',

  // Sky Blue (accent — kept for payment badges)
  skyBlue: '#38B6FF',
  skyBlueDark: '#1A9FE8',
  skyBlueLight: '#6DCEFF',
  skyBlueMuted: 'rgba(56, 182, 255, 0.15)',

  // Primary Green (replaces gold)
  gold: '#22C55E',
  goldBright: '#4ADE80',
  goldDark: '#16A34A',
  goldMuted: 'rgba(34, 197, 94, 0.15)',
  goldSubtle: 'rgba(34, 197, 94, 0.07)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A3C4A8',
  textMuted: '#5A8A65',
  textGold: '#22C55E',
  textNavy: '#0A1F0E',

  // UI Elements
  surface: '#0D2613',
  surfaceElevated: '#122C17',
  surfaceCard: '#163520',
  border: 'rgba(34, 197, 94, 0.15)',
  borderGold: 'rgba(34, 197, 94, 0.28)',
  divider: 'rgba(163, 196, 168, 0.1)',

  // Semantic
  success: '#22C55E',
  successMuted: 'rgba(34, 197, 94, 0.15)',
  warning: '#F59E0B',
  warningMuted: 'rgba(245, 158, 11, 0.15)',
  danger: '#EF4444',
  dangerMuted: 'rgba(239, 68, 68, 0.15)',
  info: '#38B6FF',
  infoMuted: 'rgba(56, 182, 255, 0.15)',

  // Payment Methods
  mtn: '#FFCC00',
  mtnDark: '#E6B800',
  airtel: '#E8001E',
  cash: '#22C55E',
  card: '#38B6FF',

  // Overlay
  overlay: 'rgba(10, 31, 14, 0.88)',
  overlayLight: 'rgba(10, 31, 14, 0.5)',
};

export const Typography = {
  // Font sizes
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  display: 34,

  // Weights
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,

  // Line heights
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.7,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
  giant: 64,
};

export const BorderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  round: 50,
  circle: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  gold: {
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  blue: {
    shadowColor: '#38B6FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
};
