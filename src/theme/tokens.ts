// Design tokens — dark-mode native.
// Single source of truth for color, spacing, radius, and typography.
// Consume via StyleSheet.create; never hardcode raw values in components.

export const colors = {
  // Surfaces (deep charcoal / obsidian)
  background: '#0B0D10',
  surface: '#14181F',
  surfaceElevated: '#1B212B',
  surfaceInput: '#171C24',

  // Borders (steel gray)
  border: '#2A313D',
  borderStrong: '#3A4351',
  borderFocus: '#4A5568',

  // Text (crisp, high contrast)
  textPrimary: '#F5F7FA',
  textSecondary: '#A8B0BD',
  textMuted: '#6B7482',
  textInverse: '#0B0D10',

  // Primary accent (energetic orange)
  accent: '#FF5A1F',
  accentPressed: '#E04A0F',
  accentMuted: '#3A2418',

  // Semantic status
  success: '#2ECC71',
  successMuted: '#12331F',
  warning: '#F5A623',
  warningMuted: '#3A2E12',
  danger: '#FF4D4F',
  dangerMuted: '#3A1A1C',

  // Utility
  overlay: 'rgba(0, 0, 0, 0.6)',
  transparent: 'transparent',
} as const;

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 34,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Typography = typeof typography;
