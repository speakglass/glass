'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import {
  LogOut,
  History,
  Settings as SettingsIcon,
  Brain,
  BookOpen,
  ArrowUpRight,
  CreditCard,
  MessageSquare,
  Users,
} from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import Settings from './settings';
import Feedback from './feedback';
import Discord from './logos/discord';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAccountSession } from '@/contexts/account-session-context';

export function UserMenu({
  historyHref,
  billingHref,
  open,
  onOpenChange,
}: {
  historyHref: string;
  billingHref: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { data: session, status: sessionStatus } = useSession();
  const { snapshot } = useAccountSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const showBillingLink = Boolean(
    snapshot?.billing && !snapshot.billing.selfHosted
  );

  const user = session?.user;
  const avatar = user?.image || null;
  const initials =
    user?.name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  if (!session?.user) {
    if (sessionStatus === 'loading') {
      return (
        <div
          className="h-8 w-8 rounded-full border border-border/60 bg-muted animate-pulse"
          aria-hidden
        />
      );
    }
    return null;
  }

  return (
    <>
      <Settings open={settingsOpen} onOpenChange={setSettingsOpen} />
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            id="glass-user-menu"
            variant="ghost"
            className="relative sm:h-8 sm:w-8 h-7 w-7 rounded-full p-0 hover:bg-transparent cursor-pointer"
            aria-label="Open user menu"
          >
            <Avatar className="sm:h-8 sm:w-8 h-7 w-7 cursor-pointer">
              <AvatarImage
                src={avatar || undefined}
                alt={user?.name || 'User'}
              />
              <AvatarFallback className="text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-64 border-t-2 border-border"
          align="end"
          sideOffset={8}
        >
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2.5 px-2 py-2">
              <Avatar className="h-9 w-9">
                <AvatarImage
                  src={avatar || undefined}
                  alt={user?.name || 'User'}
                />
                <AvatarFallback className="text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-0.5 flex-1 min-w-0">
                <p className="text-sm font-semibold leading-none truncate">
                  {user?.name || '—'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email || ''}
                </p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link
                id="glass-history-link"
                href={historyHref}
                className="cursor-pointer"
              >
                <History />
                <Trans>Conversation history</Trans>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={historyHref.replace('/history', '/memory')}
                className="cursor-pointer"
              >
                <Brain />
                <Trans>Memory</Trans>
              </Link>
            </DropdownMenuItem>
            {showBillingLink && (
              <DropdownMenuItem asChild>
                <Link href={billingHref} className="cursor-pointer">
                  <CreditCard />
                  <Trans>Billing</Trans>
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => setSettingsOpen(true)}
              className="cursor-pointer"
            >
              <SettingsIcon />
              <Trans>Settings</Trans>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild className="cursor-pointer">
              <a
                href="https://docs.speakglass.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center"
              >
                <BookOpen />
                <span className="flex-1">
                  <Trans>Documentation</Trans>
                </span>
                <ArrowUpRight className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </DropdownMenuItem>
            <Feedback variant="menu" />
            <DropdownMenuItem asChild className="cursor-pointer">
              <button
                onClick={() => {
                  window.open(
                    'https://discord.gg/GxJwcgnchM',
                    '_blank',
                    'noopener noreferrer'
                  );
                }}
                className="flex w-full items-center"
              >
                <Discord className="size-4" />
                <Trans>Community</Trans>
              </button>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void signOut()}
            className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
          >
            <LogOut />
            <Trans>Sign out</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
