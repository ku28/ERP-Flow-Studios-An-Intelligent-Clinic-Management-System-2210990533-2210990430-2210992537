import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.erpflowstudios.app',
  appName: 'ERP Flow Studios',
  webDir: 'public',
  server: {
    // Load the app from the canonical production domain so Android WebView
    // stays in-app and does not hand off cross-domain redirects to a browser.
    url: 'https://www.erpflowstudios.com/app',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      'www.erpflowstudios.com',
      'erpflowstudios.com',
      'erpflowstudios.vercel.app',
      '*.vercel.app'
    ]
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0f172a',
      showSpinner: false,
      androidSplashResourceName: 'splash'
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#0f172a',
      style: 'DARK'
    }
  }
};

export default config;