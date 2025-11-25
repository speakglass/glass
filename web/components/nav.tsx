'use client';

import { Button } from './ui/button';
import Github from './logos/git-hub';
import Discord from './logos/discord';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { UserMenu } from './user-menu';
import Feedback from './feedback';
import { Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLangNavigation } from '@/hooks/use-lang-navigation';

export interface NavProps {
  userMenuOpen?: boolean;
  onUserMenuOpenChange?: (open: boolean) => void;
}

export const Nav = ({ userMenuOpen, onUserMenuOpenChange }: NavProps = {}) => {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { langSegment, dashboardHref, historyHref, billingHref } = useLangNavigation();

  useEffect(() => {
    setMounted(true);
  }, []);

  // 뷰포트가 데스크톱 사이즈가 되면 모바일 메뉴를 강제로 닫고 언마운트
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const mobile = window.innerWidth < 768; // tailwind md 브레이크포인트 기준
      setIsMobile(mobile);
      if (!mobile) {
        setMobileMenuOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isDark = mounted ? theme === 'dark' : false;
  const logoSrc = isDark ? '/logo-white.png' : '/logo-black.png';

  // Check if this is the opensource version (via environment variable)
  const isOpenSource = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_IS_OPENSOURCE === 'true' : false;

  return (
    <div
      className={
        'fixed top-0 left-0 right-0 px-3 py-1.5 flex items-center bg-white justify-between h-12 z-50 border-b border-border sm:px-4 sm:py-2 sm:h-14'
      }
    >
      <div className={'flex items-center gap-1.5 sm:gap-2'}>
        <a href={dashboardHref} aria-label="Go to dashboard">
          <Image
            src={logoSrc}
            alt="Glass"
            width={48}
            height={24}
            className={'object-contain w-10 h-auto sm:w-12'}
            style={{ height: 'auto' }}
          />
        </a>
      </div>
      <div className={'flex items-center gap-1.5 sm:gap-2'}>
        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          {/* Show GitHub only on opensource version */}
          {isOpenSource && (
            <Button
              onClick={() => {
                window.open('https://github.com/speakglass/glass', '_blank', 'noopener noreferrer');
              }}
              variant={'outline'}
              size={'sm'}
              aria-label="Open GitHub"
              className={'flex items-center gap-1.5 h-7 px-2.5 sm:h-8 sm:px-3'}
            >
              <Github className={'size-3 sm:size-3.5'} />
              <span>
                <Trans>Star on GitHub</Trans>
              </span>
            </Button>
          )}
          <Feedback />
          <Button
            onClick={() => {
              window.open('https://discord.gg/GxJwcgnchM', '_blank', 'noopener noreferrer');
            }}
            variant={'default'}
            size={'sm'}
            aria-label="Join Community"
            className={'gap-1.5 h-7 px-2.5 cursor-pointer sm:h-8 sm:px-3'}
          >
            <Discord className={'size-3 sm:size-3.5'} />
            <span>
              <Trans>Community</Trans>
            </span>
          </Button>
        </div>

        {/* Mobile hamburger menu */}
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full cursor-pointer md:hidden sm:h-8 sm:w-8"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        )}

        {/* Dropdown panel */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 top-12 bg-black/20 z-30 md:hidden sm:top-14"
                onClick={() => setMobileMenuOpen(false)}
              />
              {/* Menu panel */}
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: 0.25,
                  ease: [0.4, 0, 0.2, 1],
                }}
                className="fixed top-12 left-0 right-0 bg-background border-b border-border shadow-lg z-40 md:hidden overflow-hidden sm:top-14"
              >
                <div className="flex flex-col gap-2.5 p-3 sm:gap-3 sm:p-4">
                  <Feedback />
                  <Button
                    onClick={() => {
                      window.open('https://discord.gg/GxJwcgnchM', '_blank', 'noopener noreferrer');
                      setMobileMenuOpen(false);
                    }}
                    variant="default"
                    size="sm"
                    aria-label="Join Community"
                    className="gap-1.5 h-7 px-2.5 cursor-pointer w-full justify-center sm:h-8 sm:px-3"
                  >
                    <Discord className="size-3 sm:size-3.5" />
                    <span>
                      <Trans>Community</Trans>
                    </span>
                  </Button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* User menu - visible on all screen sizes */}
        <UserMenu
          historyHref={historyHref}
          billingHref={billingHref}
          open={userMenuOpen}
          onOpenChange={onUserMenuOpenChange}
        />
      </div>
    </div>
  );
};
