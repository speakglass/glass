/**
 * Capacitor helper utilities for iOS/Android integration
 */

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

/**
 * Check if the app is running as a native mobile app
 */
export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Check if running on iOS
 */
export const isIOS = (): boolean => {
  return Capacitor.getPlatform() === 'ios';
};

/**
 * Check if running on Android
 */
export const isAndroid = (): boolean => {
  return Capacitor.getPlatform() === 'android';
};

/**
 * Initialize Google Auth plugin for all platforms
 * Must be called before using GoogleAuth.signIn()
 */
export const initializeGoogleAuth = (): void => {
  const platform = Capacitor.getPlatform();
  const clientIdMap = {
    ios: process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    web: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  };

  const clientId = clientIdMap[platform as keyof typeof clientIdMap];

  if (!clientId) {
    throw new Error(`Google OAuth client ID not found for platform: ${platform}`);
  }

  GoogleAuth.initialize({
    clientId,
    scopes: ['profile', 'email'],
    grantOfflineAccess: true,
  });
};

/**
 * Initialize mobile-specific features
 */
export const initializeNativeFeatures = async (): Promise<void> => {
  initializeGoogleAuth();

  if (!isNativePlatform()) return;

  try {
    if (isIOS()) {
      await StatusBar.setStyle({ style: Style.Dark });
    }

    CapApp.addListener('appStateChange', ({ isActive }) => {
      console.log('[Capacitor] App state:', isActive ? 'active' : 'inactive');
    });

    if (isAndroid()) {
      CapApp.addListener('backButton', ({ canGoBack }) => {
        if (!canGoBack) CapApp.exitApp();
      });
    }
  } catch (error) {
    console.error('[Capacitor] Error initializing native features:', error);
  }
};

/**
 * Provide haptic feedback
 */
export const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Medium): Promise<void> => {
  if (!isNativePlatform()) {
    return;
  }

  try {
    await Haptics.impact({ style });
  } catch (error) {
    console.error('Error triggering haptic:', error);
  }
};

/**
 * Hide the status bar
 */
export const hideStatusBar = async (): Promise<void> => {
  if (!isNativePlatform()) {
    return;
  }

  try {
    await StatusBar.hide();
  } catch (error) {
    console.error('Error hiding status bar:', error);
  }
};

/**
 * Show the status bar
 */
export const showStatusBar = async (): Promise<void> => {
  if (!isNativePlatform()) {
    return;
  }

  try {
    await StatusBar.show();
  } catch (error) {
    console.error('Error showing status bar:', error);
  }
};

/**
 * Get app info
 */
export const getAppInfo = async () => {
  if (!isNativePlatform()) {
    return null;
  }

  try {
    const info = await CapApp.getInfo();
    return info;
  } catch (error) {
    console.error('Error getting app info:', error);
    return null;
  }
};
