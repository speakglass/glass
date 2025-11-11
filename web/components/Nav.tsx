'use client';

import { Button } from './ui/button';
import Github from './logos/GitHub';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import Settings from './Settings';
import { Trans } from '@lingui/react/macro';

export const Nav = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme === 'dark' : false;
  const logoSrc = isDark ? '/logo-white.png' : '/logo-black.png';

  return (
    <div
      className={
        'fixed top-0 left-0 right-0 px-4 py-2 flex items-center justify-between h-14 z-50'
      }
    >
      <div className={'flex items-center gap-2'}>
        <a href="https://www.speakglass.com" aria-label="Go to speakglass.com">
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
      <div className={'flex items-center gap-1'}>
        <Button
          onClick={() => {
            window.open(
              'https://github.com/speakglass/glass',
              '_blank',
              'noopener noreferrer'
            );
          }}
          variant={'outline'}
          size={'icon'}
          aria-label="Open GitHub"
          className={
            'ml-auto flex items-center gap-1.5 rounded-full w-9 sm:w-auto sm:px-3'
          }
        >
          <span>
            <Github className={'size-4'} />
          </span>
          <span className={'hidden sm:inline'}>
            <Trans>Star on GitHub</Trans>
          </span>
        </Button>
        <Settings />
        {/* Theme toggle removed; use Settings panel switch instead */}
      </div>
    </div>
  );
};
