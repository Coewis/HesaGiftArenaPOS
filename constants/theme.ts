// HESA GIFT ARENA POS - Design System
// Sky Blue + Dark Navy palette — updated 2026

export const Colors = {
  // Brand Core — Dark navy backgrounds
  navy: '#060E1C',
  navyMid: '#0A1628',
  navyLight: '#0F1E38',
  navyCard: '#122244',

  // White / Light
  white: '#FFFFFF',
  offWhite: '#F0F7FF',

  // Primary: Sky Blue
  skyBlue: '#38B6FF',
  skyBlueDark: '#1A9FE8',
  skyBlueLight: '#6DCEFF',
  skyBlueMuted: 'rgba(56, 182, 255, 0.15)',

  // Gold alias → sky blue (primary accent)
  gold: '#38B6FF',
  goldBright: '#6DCEFF',
  goldDark: '#1A9FE8',
  goldMuted: 'rgba(56, 182, 255, 0.15)',
  goldSubtle: 'rgba(56, 182, 255, 0.07)',
  borderGold: 'rgba(56, 182, 255, 0.28)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0B8D0',
  textMuted: '#4A6A88',
  textGold: '#38B6FF',
  textNavy: '#060E1C',

  // UI Elements
  surface: '#0A1628',
  surfaceElevated: '#0F1E38',
  surfaceCard: '#122244',
  border: 'rgba(56, 182, 255, 0.12)',
  divider: 'rgba(160, 184, 208, 0.08)',

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
  overlay: 'rgba(6, 14, 28, 0.88)',
  overlayLight: 'rgba(6, 14, 28, 0.5)',
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
    shadowOpacity: 0.25,
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
    shadowColor: '#38B6FF',
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
