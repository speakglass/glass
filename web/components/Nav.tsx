'use client';

import { Button } from './ui/button';
import { Moon, Sun } from 'lucide-react';
import Github from './logos/GitHub';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import Settings from './Settings';

export const Nav = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme === 'dark' : false;
  const logoSrc = isDark ? '/logo-white.png' : '/logo-black.png';

  return (
    <div className={'fixed top-0 left-0 right-0 px-4 py-2 flex items-center justify-between h-14 z-50'}>
      <div className={'flex items-center gap-2'}>
        <Image src={logoSrc} alt="Glass" width={48} height={24} className={'object-contain'} />
      </div>
      <div className={'flex items-center gap-1'}>
        <Button
          onClick={() => {
            window.open('https://github.com/speakglass/glass', '_blank', 'noopener noreferrer');
          }}
          variant={'ghost'}
          className={'ml-auto flex items-center gap-1.5 rounded-full'}
        >
          <span>
            <Github className={'size-4'} />
          </span>
          <span>Star on GitHub</span>
        </Button>
        <Settings />
        {/* Theme toggle removed; use Settings panel switch instead */}
      </div>
    </div>
  );
};
