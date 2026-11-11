// Design tokens — dark-mode native.
// Single source of truth for color, spacing, radius, typography and layout.
// Consume via StyleSheet.create; never hardcode raw values in components.
//
// Palette (exactly 5 brand colors):
//   Licorice  #131112 — background, dark text on bright buttons
//   GhostWhite#F7F7FF — primary text, light surfaces
//   RoyalBlue #2563EB — brand color, active tabs, secondary buttons, focus
//   Lime      #CCFF00 — primary CTAs (always with dark text), timers, progress
//   Magenta   #D81159 — destructive, error, warning, high-intensity badges
//
// Card surfaces and borders are subtle tints of Licorice/Ghost White so
// contrast stays sharp without introducing extra hues.

export const palette = {
  licorice: '#131112',
  ghostWhite: '#F7F7FF',
  royalBlue: '#2563EB',
  electricLime: '#CCFF00',
  rubyMagenta: '#D81159',
} as const;

export const colors = {
  // Surfaces — licorice darkened/lightened with a ghost-white tint.
  background: palette.licorice,
  surface: '#1A1819', // ~4% ghost white over licorice
  surfaceElevated: '#211F20', // ~7%
  surfaceInput: '#171516',

  // Borders — ghost-white tints over licorice.
  border: '#2B282A', // ~10%
  borderStrong: '#383536', // ~16%
  borderFocus: palette.royalBlue,

  // Text
  textPrimary: palette.ghostWhite,
  textSecondary: '#B7B5BF',
  textMuted: '#8C8A93',
  textInverse: palette.licorice,

  // Brand accent (royal blue): active nav, secondary buttons, focus rings.
  accent: palette.royalBlue,
  accentPressed: '#1D4ED8',
  accentMuted: '#17233B', // blue tint over licorice
  accentText: palette.ghostWhite,

  // Primary CTA (electric lime): always paired with licorice text.
  cta: palette.electricLime,
  ctaPressed: '#B3E600',
  ctaMuted: '#2A2F12',
  ctaText: palette.licorice,

  // Highlights: active workout timers and progress/completion.
  timer: palette.electricLime,
  timerMuted: '#2A2F12',
  progress: palette.electricLime,
  progressMuted: '#2A2F12',

  // Semantic status
  success: palette.electricLime,
  successMuted: '#2A2F12',
  warning: palette.rubyMagenta,
  warningMuted: '#2B101A',
  danger: palette.rubyMagenta,
  dangerPressed: '#B00D49',
  dangerMuted: '#3C1122',

  // Utility
  overlay: 'rgba(19, 17, 18, 0.72)',
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

export const layout = {
  /** Phone-shaped column width; screens centre inside it on wide desktops. */
  contentMaxWidth: 720,
  /** Minimum readable desktop height for the tab scaffold. */
  tabBarMaxWidth: 720,
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Typography = typeof typography;
export type Layout = typeof layout;
