import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';
import { Style } from '@capacitor/status-bar';

const config: CapacitorConfig = {
  appId: 'com.glass.app',
  appName: 'Glass',
  webDir: 'out',
  server: {
    // Development mode: using local dev server
    url: 'http://localhost:3000',
    cleartext: true,
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#000000',
      showSpinner: false,
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      style: KeyboardStyle.Dark,
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: Style.Dark,
      backgroundColor: '#000000',
    },
  },
};

export default config;
