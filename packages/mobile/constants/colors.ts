/**
 * Brand colors for Glass mobile app
 */
export const Colors = {
  // Primary brand color
  primary: '#0052FF',
  primaryLight: '#E8F0FF',
  primaryDark: '#0041CC',

  // Text colors
  text: '#000000',
  textSecondary: '#666666',
  textTertiary: '#999999',

  // Background colors
  background: '#FFFFFF',
  backgroundSecondary: '#F8F9FA',

  // UI colors
  border: '#DDDDDD',
  borderLight: '#E0E0E0',
  
  // Status colors
  success: '#34C759',
  error: '#FF3B30',
  warning: '#FF9500',
  info: '#007AFF',

  // Accent colors
  gold: '#FFD700',
} as const;

export type ColorKey = keyof typeof Colors;

