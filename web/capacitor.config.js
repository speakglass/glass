const { KeyboardResize, KeyboardStyle } = require('@capacitor/keyboard');
const { Style } = require('@capacitor/status-bar');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Load environment variables
const googleWebClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const capacitorServerUrl = process.env.CAPACITOR_SERVER_URL;

console.log('[Capacitor Config] Loading configuration...');
console.log('[Capacitor Config] CAPACITOR_SERVER_URL:', capacitorServerUrl || 'not set');

const config = {
  appId: 'com.speakglass.app',
  appName: 'Glass',
  webDir: 'out',
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

// Development server configuration
// Set CAPACITOR_SERVER_URL to enable live reload during development
// - iOS Simulator: use http://localhost:3000
// - Android Emulator: use http://10.0.2.2:3000
// - Physical Device: use http://[YOUR_MAC_IP]:3000
if (capacitorServerUrl) {
  config.server = {
    url: capacitorServerUrl,
    cleartext: true,
    androidScheme: 'https',
    iosScheme: 'https',
  };
  console.log(`[Capacitor Config] ✅ Using dev server: ${config.server.url}`);
} else {
  // Production: use static files from 'out' directory
  config.server = {
    androidScheme: 'https',
    iosScheme: 'https',
  };
  console.log('[Capacitor Config] ℹ️  Using production mode (static files from out/)');
}

// Configure GoogleAuth plugin if credentials are available
if (googleWebClientId) {
  config.plugins.GoogleAuth = {
    scopes: ['profile', 'email'],
    serverClientId: googleWebClientId,
    iosClientId: process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    forceCodeForRefreshToken: true,
  };
}

module.exports = config;
