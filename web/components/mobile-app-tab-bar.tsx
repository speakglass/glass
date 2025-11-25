'use client';

import type { ComponentType, ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Trans } from '@lingui/react/macro';
import { History, MessageCircleMore } from 'lucide-react';
import { cn } from '@/utils';
import { useLangNavigation } from '@/hooks/use-lang-navigation';
import { UserMenu } from './user-menu';
import type { NavProps } from './nav';

type TabItem = {
  id: string;
  label: ReactNode;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  activePath?: string;
  ariaLabel: string;
  hidden?: boolean;
};

export const MobileAppTabBar = ({ userMenuOpen, onUserMenuOpenChange }: NavProps = {}) => {
  const pathname = usePathname();
  const { langSegment, dashboardHref, historyHref, billingHref } = useLangNavigation();
  const safeAreaPadding = 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)';
  const tabBaseClass =
    'flex flex-1 flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-[11px] font-medium leading-tight transition-colors';

  const tabs: TabItem[] = [
    {
      id: 'history',
      label: <Trans>History</Trans>,
      href: historyHref,
      icon: History,
      activePath: '/history',
      ariaLabel: 'Go to history',
    },
    {
      id: 'dashboard',
      label: <Trans>Practice</Trans>,
      href: dashboardHref,
      icon: MessageCircleMore,
      activePath: '/dashboard',
      ariaLabel: 'Go to dashboard',
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-2" style={{ paddingBottom: safeAreaPadding }}>
        <div className="flex items-center gap-1.5 bg-transparent p-1" style={{ transform: 'translateY(-0.5rem)' }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const activePath = `/${langSegment}${tab.activePath ?? ''}`;
            const isActive = !!pathname && (pathname === tab.href || pathname.startsWith(activePath));

            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-label={tab.ariaLabel}
                className={cn(tabBaseClass, isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span>{tab.label}</span>
              </Link>
            );
          })}

          <UserMenu
            historyHref={historyHref}
            billingHref={billingHref}
            open={userMenuOpen}
            onOpenChange={onUserMenuOpenChange}
            variant="tab"
            className={tabBaseClass}
          />
        </div>
      </div>
    </nav>
  );
};
