'use client';

import { Button } from './ui/button';
import Github from './logos/git-hub';
import Discord from './logos/discord';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { usePathname } from 'next/navigation';
import { UserMenu } from './user-menu';
import Feedback from './feedback';

export interface NavProps {
  userMenuOpen?: boolean;
  onUserMenuOpenChange?: (open: boolean) => void;
}

export const Nav = ({ userMenuOpen, onUserMenuOpenChange }: NavProps = {}) => {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme === 'dark' : false;
  const logoSrc = isDark ? '/logo-white.png' : '/logo-black.png';

  const segments = pathname?.split('/').filter(Boolean) ?? [];
  const langSegment = segments[0] || 'en';
  const historyHref = `/${langSegment}/history`;

  // Check if this is the opensource version (via environment variable)
  const isOpenSource = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_IS_OPENSOURCE === 'true' : false;

  return (
    <div
      className={
        'fixed top-0 left-0 right-0 px-4 py-2 flex items-center justify-between h-14 z-50 border-b border-border'
      }
    >
      <div className={'flex items-center gap-2'}>
        <a href={`/${langSegment}/dashboard`} aria-label="Go to dashboard">
          <Image
            src={logoSrc}
            alt="Glass"
            width={48}
            height={24}
            className={'object-contain'}
            style={{ height: 'auto' }}
          />
        </a>
      </div>
      <div className={'flex items-center gap-2'}>
        {/* Show GitHub only on opensource version */}
        {isOpenSource && (
          <Button
            onClick={() => {
              window.open('https://github.com/speakglass/glass', '_blank', 'noopener noreferrer');
            }}
            variant={'outline'}
            size={'sm'}
            aria-label="Open GitHub"
            className={'flex items-center gap-1.5 h-8 px-3'}
          >
            <Github className={'size-3.5'} />
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
          className={'gap-1.5 h-8 px-3 cursor-pointer'}
        >
          <Discord className={'size-3.5'} />
          <span>
            <Trans>Community</Trans>
          </span>
        </Button>
        <UserMenu historyHref={historyHref} open={userMenuOpen} onOpenChange={onUserMenuOpenChange} />
      </div>
    </div>
  );
};
