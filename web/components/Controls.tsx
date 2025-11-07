'use client';
import { useGlass } from '@/contexts/GlassContext';
import { Button } from './ui/button';
import { Mic, MicOff, Phone, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { AnimatePresence, motion } from 'motion/react';
import { Toggle } from './ui/toggle';
import MicFFT from './MicFFT';
import { cn } from '@/utils';
import { useMemo } from 'react';

export default function Controls() {
  const {
    disconnect,
    status,
    isMuted,
    unmute,
    mute,
    micFft,
    budgetStatus,
    remainingSeconds,
    totalSeconds,
    startRemainingSeconds,
    elapsedSeconds,
  } = useGlass();

  const fmt = (secs?: number) => {
    if (typeof secs !== 'number' || !isFinite(secs) || secs < 0) secs = 0;
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = Math.floor(secs % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  };

  const lowTime = useMemo(() => {
    return typeof remainingSeconds === 'number' && remainingSeconds <= 300;
  }, [remainingSeconds]);

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 w-full p-4 pb-6 flex items-center justify-center',
        'bg-gradient-to-t from-card via-card/90 to-card/0'
      )}
    >
      <AnimatePresence>
        {status.value === 'connected' ? (
          <motion.div
            initial={{
              y: '100%',
              opacity: 0,
            }}
            animate={{
              y: 0,
              opacity: 1,
            }}
            exit={{
              y: '100%',
              opacity: 0,
            }}
            className={'p-4 bg-card border border-border/50 rounded-full flex items-center gap-4'}
          >
            <Toggle
              className={'rounded-full'}
              pressed={!isMuted}
              onPressedChange={() => {
                if (isMuted) {
                  unmute();
                } else {
                  mute();
                }
              }}
            >
              {isMuted ? <MicOff className={'size-4'} /> : <Mic className={'size-4'} />}
            </Toggle>

            <div className={'relative grid h-8 w-48 shrink grow-0'}>
              <MicFFT fft={micFft} className={'fill-current'} />
            </div>

            {status.value === 'connected' &&
            (budgetStatus === 'unknown' || typeof startRemainingSeconds === 'number') ? (
              <div className={'relative flex items-center gap-2'}>
                {(() => {
                  const baseKnown = typeof startRemainingSeconds === 'number';
                  const base = baseKnown
                    ? (startRemainingSeconds as number)
                    : typeof totalSeconds === 'number'
                    ? (totalSeconds as number)
                    : undefined;
                  const elapsed = typeof elapsedSeconds === 'number' ? elapsedSeconds : 0;
                  return (
                    <span className={'text-sm tabular-nums'}>
                      <span className={lowTime ? 'text-rose-600 dark:text-rose-400' : undefined}>{fmt(elapsed)}</span>
                      {' / '}
                      {baseKnown ? (
                        <span>{fmt(base)}</span>
                      ) : (
                        <span className={'inline-block align-middle w-10 h-4 rounded bg-muted/60 animate-pulse'} />
                      )}
                    </span>
                  );
                })()}
                {/* Info tooltip appears when lowTime; no effect on time colors */}
                {lowTime ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={'inline-flex items-center justify-center w-4 h-4 rounded-full'}
                        aria-label="Remaining time info"
                      >
                        <Info className={'size-3 text-rose-600 dark:text-rose-400'} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">Ending soon: under 5 minutes left</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            ) : null}

            <Button
              className={'flex items-center gap-1 rounded-full'}
              onClick={() => {
                disconnect();
              }}
              variant={'destructive'}
            >
              <span>
                <Phone className={'size-4 opacity-50 fill-current'} strokeWidth={0} />
              </span>
              <span>End Call</span>
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
