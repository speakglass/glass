'use client';
import { useGlass } from '@/contexts/glass-context';
import { Button } from './ui/button';
import { Mic, MicOff, Phone } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Toggle } from './ui/toggle';
import MicFFT from './mic-fft';
import { cn } from '@/utils';
import { Trans } from '@lingui/react/macro';

export default function Controls() {
  const { disconnect, status, isMuted, unmute, mute, micFft, elapsedSeconds } =
    useGlass();

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

  const elapsedLabel =
    typeof elapsedSeconds === 'number' ? fmt(elapsedSeconds) : null;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 w-full p-3 pb-4 sm:p-4 sm:pb-6 flex items-center justify-center z-50',
        'bg-gradient-to-t from-card via-card/90 to-card/0 pointer-events-none'
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
            className={
              'p-2 bg-card/80 backdrop-blur-md border border-border/50 rounded-full flex items-center gap-1.5 sm:gap-4 sm:p-4 pointer-events-auto'
            }
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
              {isMuted ? (
                <MicOff className={'size-3.5 sm:size-4'} />
              ) : (
                <Mic className={'size-3.5 sm:size-4'} />
              )}
            </Toggle>

            <div
              className={'relative grid h-7 w-20 shrink grow-0 sm:h-8 sm:w-48'}
            >
              <MicFFT fft={micFft} className={'fill-current'} />
            </div>

            {status.value === 'connected' ? (
              <div
                className={
                  'text-xs sm:text-sm tabular-nums text-muted-foreground'
                }
              >
                {elapsedLabel ?? '00:00'}
              </div>
            ) : null}

            <Button
              className={
                'flex items-center gap-0.5 sm:gap-1 rounded-full h-8 sm:h-auto'
              }
              size="sm"
              onClick={() => {
                disconnect();
              }}
              variant={'destructive'}
            >
              <span>
                <Phone
                  className={'size-3.5 opacity-50 fill-current sm:size-4'}
                  strokeWidth={0}
                />
              </span>
              <span className={'hidden sm:inline'}>
                <Trans>End Call</Trans>
              </span>
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
