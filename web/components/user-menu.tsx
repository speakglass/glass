'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { LogOut, History, Settings as SettingsIcon, Brain } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import Settings from './settings';

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
import { cn } from '@/utils';

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

  // Format usage display
  // Show usage only if daily quota is configured
  const showUsage = usage && usage.dailyTotalSeconds !== null;
  const isUsingBonus = usage && usage.dailyRemainingSeconds === 0 && (usage.bonusRemainingSeconds ?? 0) > 0;
  const hasBonusMinutes = usage?.bonusTotalSeconds != null && usage.bonusTotalSeconds > 0;

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
          {showUsage && (
            <div className="px-3 pb-2 space-y-2">
              <UsageBar
                label={<Trans>Daily free minutes</Trans>}
                remainingSeconds={usage?.dailyRemainingSeconds ?? 0}
                totalSeconds={usage?.dailyTotalSeconds ?? undefined}
                highlight={isUsingBonus ? 'bg-amber-500' : 'bg-primary'}
                minLabel="min"
              />
              {hasBonusMinutes && (
                <UsageBar
                  label={<Trans>Bonus minutes</Trans>}
                  remainingSeconds={usage?.bonusRemainingSeconds ?? 0}
                  totalSeconds={usage?.bonusTotalSeconds ?? undefined}
                  highlight="bg-purple-500"
                  minLabel="min"
                />
              )}
            </div>
          )}
          <DropdownMenuSeparator />

          <DropdownMenuGroup>
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

type UsageBarProps = {
  label: ReactNode;
  remainingSeconds?: number | null;
  totalSeconds?: number | null;
  highlight?: string;
  minLabel?: string;
};

function UsageBar({ label, remainingSeconds, totalSeconds, highlight = 'bg-primary', minLabel = 'min' }: UsageBarProps) {
  const rawRemaining = typeof remainingSeconds === 'number' ? Math.max(0, remainingSeconds) : 0;
  const rawTotal = typeof totalSeconds === 'number' && totalSeconds > 0 ? totalSeconds : null;
  const remainingMinutes = Math.max(0, Math.floor(rawRemaining / 60));
  const totalMinutes = rawTotal ? Math.max(0, Math.floor(rawTotal / 60)) : null;
  const percent = rawTotal ? Math.min(100, (rawRemaining / rawTotal) * 100) : rawRemaining > 0 ? 100 : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] uppercase">
        <span className="font-semibold tracking-wide text-muted-foreground">{label}</span>
        <span className="tabular-nums text-[11px] font-semibold text-foreground">
          {totalMinutes !== null ? (
            <>
              {remainingMinutes} / {totalMinutes}
            </>
          ) : (
            remainingMinutes
          )}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{minLabel}</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-border/70 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-300', highlight)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
