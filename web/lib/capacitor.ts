/**
 * Capacitor helper utilities for iOS/Android integration
 */

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

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
 * Initialize mobile-specific features
 */
export const initializeNativeFeatures = async (): Promise<void> => {
  if (!isNativePlatform()) {
    return;
  }

  try {
    // Set status bar style
    if (isIOS()) {
      await StatusBar.setStyle({ style: Style.Dark });
    }

    // Listen for app state changes
    CapApp.addListener('appStateChange', ({ isActive }) => {
      console.log('App state changed. Active:', isActive);
    });

    // Listen for back button on Android
    if (isAndroid()) {
      CapApp.addListener('backButton', ({ canGoBack }) => {
        if (!canGoBack) {
          CapApp.exitApp();
        }
      });
    }

    // Keyboard listeners
    Keyboard.addListener('keyboardWillShow', (info) => {
      console.log('Keyboard will show:', info);
    });

    Keyboard.addListener('keyboardWillHide', () => {
      console.log('Keyboard will hide');
    });
  } catch (error) {
    console.error('Error initializing native features:', error);
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
