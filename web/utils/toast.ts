/**
 * Unified toast notification utility
 *
 * Automatically uses:
 * - Native toast on iOS/Android (Capacitor Toast)
 * - Sonner toast on web
 *
 * API compatible with sonner for easy migration
 */

import { Toast as CapacitorToast } from '@capacitor/toast';
import { toast as sonnerToast, type ExternalToast } from 'sonner';
import { isNativePlatform } from '@/lib/capacitor';

type ToastFunction = (message: string, data?: ExternalToast) => void;

const showNativeToast = async (message: string, duration: 'short' | 'long' = 'short') => {
  try {
    await CapacitorToast.show({
      text: message,
      duration,
      position: 'bottom',
    });
  } catch (error) {
    console.error('[Toast] Failed to show native toast:', error);
    // Fallback to sonner on error
    sonnerToast(message);
  }
};

const success: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    showNativeToast(`✓ ${message}`, 'short');
  } else {
    sonnerToast.success(message, data);
  }
};

const error: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    showNativeToast(`✗ ${message}`, 'long');
  } else {
    sonnerToast.error(message, data);
  }
};

const info: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    showNativeToast(message, 'short');
  } else {
    sonnerToast.info(message, data);
  }
};

const warning: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    showNativeToast(`⚠ ${message}`, 'short');
  } else {
    sonnerToast.warning(message, data);
  }
};

const loading: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    showNativeToast(message, 'short');
  } else {
    sonnerToast.loading(message, data);
  }
};

// Default toast (no icon)
const defaultToast: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    showNativeToast(message, 'short');
  } else {
    sonnerToast(message, data);
  }
};

/**
 * Unified toast API
 * Drop-in replacement for sonner's toast
 */
export const toast = Object.assign(defaultToast, {
  success,
  error,
  info,
  warning,
  loading,
});
