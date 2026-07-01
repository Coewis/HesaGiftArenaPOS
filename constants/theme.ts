// HESA GIFT ARENA POS - Design System
// Luxury Navy + Sky Blue + Gold palette

export const Colors = {
  // Brand Core
  navy: '#0A1628',
  navyMid: '#0F1F3D',
  navyLight: '#152847',
  navyCard: '#1A3055',

  // Sky Blue
  skyBlue: '#38B6FF',
  skyBlueDark: '#1A9FE8',
  skyBlueLight: '#6DCEFF',
  skyBlueMuted: 'rgba(56, 182, 255, 0.15)',

  // Gold
  gold: '#D4AF37',
  goldBright: '#FFD700',
  goldDark: '#B8922E',
  goldMuted: 'rgba(212, 175, 55, 0.15)',
  goldSubtle: 'rgba(212, 175, 55, 0.08)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A8BFCC',
  textMuted: '#6B8299',
  textGold: '#D4AF37',
  textNavy: '#0A1628',

  // UI Elements
  surface: '#0F1F3D',
  surfaceElevated: '#152847',
  surfaceCard: '#1A3055',
  border: 'rgba(56, 182, 255, 0.15)',
  borderGold: 'rgba(212, 175, 55, 0.25)',
  divider: 'rgba(168, 191, 204, 0.1)',

  // Semantic
  success: '#2ECC71',
  successMuted: 'rgba(46, 204, 113, 0.15)',
  warning: '#F39C12',
  warningMuted: 'rgba(243, 156, 18, 0.15)',
  danger: '#E74C3C',
  dangerMuted: 'rgba(231, 76, 60, 0.15)',
  info: '#38B6FF',
  infoMuted: 'rgba(56, 182, 255, 0.15)',

  // Payment Methods
  mtn: '#FFCC00',
  mtnDark: '#E6B800',
  airtel: '#E8001E',
  cash: '#2ECC71',
  card: '#38B6FF',

  // Overlay
  overlay: 'rgba(10, 22, 40, 0.85)',
  overlayLight: 'rgba(10, 22, 40, 0.5)',
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
    shadowColor: '#D4AF37',
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
