export const theme = {
  colors: {
    // Background colors
    background: {
      primary: '#1A1A1E',
      secondary: '#2A2A2E',
      tertiary: '#36363C',
    },
    // Text colors
    text: {
      primary: '#FFFFFF',
      secondary: '#A9A9B4',
      disabled: '#6C6C76',
    },
    // Brand colors
    brand: {
      primary: '#5D8DE1',
      secondary: '#4A71B9',
      accent: '#7C5DE1',
    },
    // Status colors
    status: {
      success: '#4CAF50',
      error: '#FF5252',
      warning: '#FFC107',
      info: '#2196F3',
    },
    // Annotation colors
    annotation: {
      red: '#FF5252',
      blue: '#2196F3',
      green: '#4CAF50',
      yellow: '#FFC107',
      purple: '#9C27B0',
      white: '#FFFFFF',
    },
  },
  // Border radius
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  // Shadows
  shadows: {
    sm: '0 2px 4px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.1)',
  },
  // Typography
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      md: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
    },
    fontWeights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  // Transitions
  transitions: {
    fast: '150ms ease',
    normal: '250ms ease',
    slow: '350ms ease',
  },
  // Z-index
  zIndex: {
    modal: 1000,
    dropdown: 100,
    header: 50,
    sidebar: 40,
  },
} as const;

export type Theme = typeof theme;
