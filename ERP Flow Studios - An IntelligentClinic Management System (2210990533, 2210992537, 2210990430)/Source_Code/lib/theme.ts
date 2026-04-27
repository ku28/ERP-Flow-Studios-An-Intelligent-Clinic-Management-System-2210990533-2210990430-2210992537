/**
 * Centralized Theme Configuration
 * 
 * Change colors here to update BOTH:
 * - Tailwind classes (via tailwind.config.js)
 * - Inline styles (via these constants)
 */

// Primary Theme Color (Blue/Sky)
export const THEME_COLORS = {
  // Primary color shades
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',   // Main primary color
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },
  
  // Secondary/Accent color shades
  secondary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',   // Main secondary color
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  },
} as const

// RGB values for use in rgba() and charts
export const THEME_COLORS_RGB = {
  primary: {
    500: '59, 130, 246',  // rgb(59, 130, 246) = #3b82f6
  },
  secondary: {
    500: '14, 165, 233',  // rgb(14, 165, 233) = #0ea5e9
    600: '2, 132, 199',   // rgb(2, 132, 199) = #0284c7
  },
  // Chart colors
  red: '239, 68, 68',      // rgb(239, 68, 68)
  green: '59, 130, 246',   // rgb(59, 130, 246) - blue themed
  purple: '168, 85, 247',  // rgb(168, 85, 247)
  teal: '56, 189, 248',    // rgb(56, 189, 248) - sky themed
} as const

// Document/Print Colors (for prescriptions, invoices, etc.)
// These are typically fixed for professional documents
export const DOCUMENT_COLORS = {
  // Border colors
  border: '#FF8C00',       // Orange border
  sectionBorder: '#0000FF', // Blue section divider
  
  // Background colors
  headerGradient: 'linear-gradient(to right, #ffffff, #e1c699)',
  white: '#ffffff',
  lightGray: '#f0f0f0',
  
  // Text colors
  black: '#000',
  textPrimary: '#000000',
  textSecondary: '#999',
  textHighlight: '#0000FF',  // Blue highlight
  textError: '#FF0000',      // Red for missing data
  textWarning: '#C80000',    // Dark red for warnings
  
  // Status colors
  success: 'blue',
  error: 'red',
} as const

// Helper functions to use theme colors in inline styles
export const themeStyle = {
  // Background colors
  bgPrimary: (opacity = 1) => `rgba(${THEME_COLORS_RGB.primary[500]}, ${opacity})`,
  bgSecondary: (opacity = 1) => `rgba(${THEME_COLORS_RGB.secondary[500]}, ${opacity})`,
  
  // Text colors  
  textPrimary: THEME_COLORS.primary[500],
  textSecondary: THEME_COLORS.secondary[500],
  
  // Border colors
  borderPrimary: THEME_COLORS.primary[500],
  borderSecondary: THEME_COLORS.secondary[500],
  
  // Chart colors
  chartRed: (opacity = 1) => `rgba(${THEME_COLORS_RGB.red}, ${opacity})`,
  chartGreen: (opacity = 1) => `rgba(${THEME_COLORS_RGB.green}, ${opacity})`,
  chartPurple: (opacity = 1) => `rgba(${THEME_COLORS_RGB.purple}, ${opacity})`,
  chartTeal: (opacity = 1) => `rgba(${THEME_COLORS_RGB.teal}, ${opacity})`,
} as const

/**
 * USAGE EXAMPLES:
 * 
 * For inline styles:
 * import { themeStyle, DOCUMENT_COLORS } from '@/lib/theme'
 * 
 * <div style={{ backgroundColor: themeStyle.bgPrimary(0.5) }}>
 * <div style={{ color: themeStyle.textPrimary }}>
 * <div style={{ borderColor: DOCUMENT_COLORS.border }}>
 * 
 * For Tailwind classes (automatically synced via tailwind.config.js):
 * <div className="bg-primary-500 text-primary-600">
 * <div className="border-secondary-400">
 */

export default THEME_COLORS
