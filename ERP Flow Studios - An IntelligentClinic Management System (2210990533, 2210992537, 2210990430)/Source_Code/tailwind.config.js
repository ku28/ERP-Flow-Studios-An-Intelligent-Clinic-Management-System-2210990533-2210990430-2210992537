module.exports = {
  darkMode: 'class', // use class strategy so we can toggle dark mode via document.documentElement
  content: ["./pages/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Blue/Sky/Indigo scales driven by CSS custom properties.
        // Every Tailwind utility that uses these scales (bg-*, text-*, from-*,
        // to-*, shadow-*, border-*, ring-* including dark:/hover:/<alpha>) will
        // automatically change colour when data-theme changes at runtime.
        blue: {
          50:  'rgb(var(--tw-blue-50)  / <alpha-value>)',
          100: 'rgb(var(--tw-blue-100) / <alpha-value>)',
          200: 'rgb(var(--tw-blue-200) / <alpha-value>)',
          300: 'rgb(var(--tw-blue-300) / <alpha-value>)',
          400: 'rgb(var(--tw-blue-400) / <alpha-value>)',
          500: 'rgb(var(--tw-blue-500) / <alpha-value>)',
          600: 'rgb(var(--tw-blue-600) / <alpha-value>)',
          700: 'rgb(var(--tw-blue-700) / <alpha-value>)',
          800: 'rgb(var(--tw-blue-800) / <alpha-value>)',
          900: 'rgb(var(--tw-blue-900) / <alpha-value>)',
          950: 'rgb(var(--tw-blue-950) / <alpha-value>)',
        },
        sky: {
          50:  'rgb(var(--tw-sky-50)  / <alpha-value>)',
          100: 'rgb(var(--tw-sky-100) / <alpha-value>)',
          200: 'rgb(var(--tw-sky-200) / <alpha-value>)',
          300: 'rgb(var(--tw-sky-300) / <alpha-value>)',
          400: 'rgb(var(--tw-sky-400) / <alpha-value>)',
          500: 'rgb(var(--tw-sky-500) / <alpha-value>)',
          600: 'rgb(var(--tw-sky-600) / <alpha-value>)',
          700: 'rgb(var(--tw-sky-700) / <alpha-value>)',
          800: 'rgb(var(--tw-sky-800) / <alpha-value>)',
          900: 'rgb(var(--tw-sky-900) / <alpha-value>)',
          950: 'rgb(var(--tw-sky-950) / <alpha-value>)',
        },
        indigo: {
          50:  'rgb(var(--tw-indigo-50)  / <alpha-value>)',
          100: 'rgb(var(--tw-indigo-100) / <alpha-value>)',
          200: 'rgb(var(--tw-indigo-200) / <alpha-value>)',
          300: 'rgb(var(--tw-indigo-300) / <alpha-value>)',
          400: 'rgb(var(--tw-indigo-400) / <alpha-value>)',
          500: 'rgb(var(--tw-indigo-500) / <alpha-value>)',
          600: 'rgb(var(--tw-indigo-600) / <alpha-value>)',
          700: 'rgb(var(--tw-indigo-700) / <alpha-value>)',
          800: 'rgb(var(--tw-indigo-800) / <alpha-value>)',
          900: 'rgb(var(--tw-indigo-900) / <alpha-value>)',
          950: 'rgb(var(--tw-indigo-950) / <alpha-value>)',
        },
        // Primary brand color
        primary: {
          DEFAULT: '#3b82f6', // blue-500
          50: '#eff6ff',      // blue-50
          100: '#dbeafe',     // blue-100
          200: '#bfdbfe',     // blue-200
          300: '#93c5fd',     // blue-300
          400: '#60a5fa',     // blue-400
          500: '#3b82f6',     // blue-500
          600: '#2563eb',     // blue-600
          700: '#1d4ed8',     // blue-700
          800: '#1e40af',     // blue-800
          900: '#1e3a8a',     // blue-900
          950: '#172554',     // blue-950
        },
        // Secondary/accent color (sky)
        secondary: {
          DEFAULT: '#0ea5e9', // sky-500
          50: '#f0f9ff',      // sky-50
          100: '#e0f2fe',     // sky-100
          200: '#bae6fd',     // sky-200
          300: '#7dd3fc',     // sky-300
          400: '#38bdf8',     // sky-400
          500: '#0ea5e9',     // sky-500
          600: '#0284c7',     // sky-600
          700: '#0369a1',     // sky-700
          800: '#075985',     // sky-800
          900: '#0c4a6e',     // sky-900
          950: '#082f49',     // sky-950
        },
        // Keep the old 'brand' name for backward compatibility
        brand: {
          DEFAULT: '#0ea5e9', // sky-500 (brighter)
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e'
        }
      }
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          /* Firefox */
          'scrollbar-width': 'none',
          /* Safari and Chrome */
          '&::-webkit-scrollbar': {
            display: 'none'
          }
        },
        '.input-uppercase': {
          'text-transform': 'uppercase',
        }
      })
    }
  ],
}
