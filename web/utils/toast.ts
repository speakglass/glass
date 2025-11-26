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

type ToastId = string | number;
type ToastFunction = (message: string, data?: ExternalToast) => ToastId;

// For native platforms, we generate fake IDs since Capacitor Toast doesn't support dismissal
let nativeToastIdCounter = 0;

const showNativeToast = async (message: string, duration: 'short' | 'long' = 'short'): Promise<ToastId> => {
  const id = ++nativeToastIdCounter;
  try {
    await CapacitorToast.show({
      text: message,
      duration,
      position: 'bottom',
    });
  } catch (error) {
    console.error('[Toast] Failed to show native toast:', error);
    // Fallback to sonner on error
    return sonnerToast(message);
  }
  return id;
};

const success: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    // Return a promise that resolves to the ID
    let id: ToastId = 0;
    showNativeToast(`✓ ${message}`, 'short').then((toastId) => (id = toastId));
    return id || ++nativeToastIdCounter;
  } else {
    return sonnerToast.success(message, data);
  }
};

const error: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    let id: ToastId = 0;
    showNativeToast(`✗ ${message}`, 'long').then((toastId) => (id = toastId));
    return id || ++nativeToastIdCounter;
  } else {
    return sonnerToast.error(message, data);
  }
};

const info: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    let id: ToastId = 0;
    showNativeToast(message, 'short').then((toastId) => (id = toastId));
    return id || ++nativeToastIdCounter;
  } else {
    return sonnerToast.info(message, data);
  }
};

const warning: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    let id: ToastId = 0;
    showNativeToast(`⚠ ${message}`, 'short').then((toastId) => (id = toastId));
    return id || ++nativeToastIdCounter;
  } else {
    return sonnerToast.warning(message, data);
  }
};

const loading: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    let id: ToastId = 0;
    showNativeToast(message, 'short').then((toastId) => (id = toastId));
    return id || ++nativeToastIdCounter;
  } else {
    return sonnerToast.loading(message, data);
  }
};

// Default toast (no icon)
const defaultToast: ToastFunction = (message, data) => {
  if (isNativePlatform()) {
    let id: ToastId = 0;
    showNativeToast(message, 'short').then((toastId) => (id = toastId));
    return id || ++nativeToastIdCounter;
  } else {
    return sonnerToast(message, data);
  }
};

// Dismiss function (only works on web with sonner)
const dismiss = (id?: ToastId) => {
  if (!isNativePlatform()) {
    sonnerToast.dismiss(id);
  }
  // On native, we can't dismiss toasts, so we just do nothing
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
  dismiss,
});
