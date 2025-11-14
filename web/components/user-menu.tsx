'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { LogOut, History, Loader2, Clock, Settings as SettingsIcon, Brain } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import Settings from './Settings';

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

function formatMinutes(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return '∞';
  return `${Math.max(0, Math.floor(seconds / 60))}`;
}

async function fetchUsage(token: string | null) {
  if (!token) throw new Error('No token');

  const response = await fetch('/api/session', {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch usage');
  }

  const data = await response.json();
  return data.snapshot.usage;
}

export function UserMenu({
  historyHref,
  open,
  onOpenChange,
}: {
  historyHref: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { data: session, status: sessionStatus } = useSession();
  const { snapshot, token } = useAccountSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auto-refresh usage every 30 seconds
  const { data: usage } = useQuery({
    queryKey: ['usage', token],
    queryFn: () => fetchUsage(token),
    enabled: !!token,
    refetchInterval: 30000, // 30 seconds
    initialData: snapshot?.usage,
  });

  const user = session?.user;
  const avatar = user?.image || null;
  const initials =
    user?.name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  const remainingMinutes = formatMinutes(usage?.remainingSeconds ?? null);
  const totalMinutes = formatMinutes(usage?.totalSeconds ?? null);
  // Show usage only if quotas are configured (both total and remaining are defined)
  const showUsage = usage && typeof usage.totalSeconds === 'number' && typeof usage.remainingSeconds === 'number';

  if (!session?.user) {
    if (sessionStatus === 'loading') {
      return <div className="h-8 w-8 rounded-full border border-border/60 bg-muted animate-pulse" aria-hidden />;
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
            className="relative h-8 w-8 rounded-full p-0 hover:bg-transparent cursor-pointer"
            aria-label="Open user menu"
          >
            <Avatar className="h-8 w-8 cursor-pointer">
              <AvatarImage src={avatar || undefined} alt={user?.name || 'User'} />
              <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64 border-t-2 border-border" align="end" sideOffset={8}>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2.5 px-2 py-2">
              <Avatar className="h-9 w-9">
                <AvatarImage src={avatar || undefined} alt={user?.name || 'User'} />
                <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-0.5 flex-1 min-w-0">
                <p className="text-sm font-semibold leading-none truncate">{user?.name || '—'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email || ''}</p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            {showUsage && (
              <DropdownMenuItem className="cursor-default focus:bg-transparent py-1.5">
                <Clock className="size-4" />
                <span className="flex-1 text-sm">
                  <Trans>Free minutes</Trans>
                </span>
                {!usage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-sm font-semibold tabular-nums">
                    {remainingMinutes}
                    {totalMinutes !== '∞' && (
                      <span className="text-muted-foreground font-normal">
                        {' / '}
                        {totalMinutes}
                      </span>
                    )}
                    <span className="text-muted-foreground font-normal ml-0.5">min</span>
                  </span>
                )}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link id="glass-history-link" href={historyHref} className="cursor-pointer">
                <History />
                <Trans>Conversation history</Trans>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={historyHref.replace('/history', '/memory')} className="cursor-pointer">
                <Brain />
                <Trans>Memory</Trans>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSettingsOpen(true)} className="cursor-pointer">
              <SettingsIcon />
              <Trans>Settings</Trans>
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
