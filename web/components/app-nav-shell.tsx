'use client';

import { useEffect, useState } from 'react';
import { isNativePlatform } from '@/lib/capacitor';
import { Nav, type NavProps } from './nav';
import { MobileAppTabBar } from './mobile-app-tab-bar';

const BODY_CLASS = 'has-native-tab-bar';

const detectNativePlatform = () => (typeof window !== 'undefined' ? isNativePlatform() : false);

export const AppNavShell = (props: NavProps = {}) => {
  const [isNativeApp, setIsNativeApp] = useState<boolean>(() => detectNativePlatform());

  useEffect(() => {
    setIsNativeApp(detectNativePlatform());
  }, []);

  useEffect(() => {
    if (!isNativeApp || typeof document === 'undefined') {
      return;
    }

    document.body.classList.add(BODY_CLASS);
    return () => {
      document.body.classList.remove(BODY_CLASS);
    };
  }, [isNativeApp]);

  if (isNativeApp) {
    return <MobileAppTabBar {...props} />;
  }

  return <Nav {...props} />;
};
