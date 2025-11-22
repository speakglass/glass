import { Trans } from '@lingui/react/macro';
import { motion } from 'motion/react';
import { Phone } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/utils';

interface ModeSelectionProps {
  glassMode: boolean;
  selectedMode: 'roleplay' | 'live_call' | null;
  onSelectMode: (mode: 'roleplay' | 'live_call') => void;
  onBack: () => void;
  onNext: () => void;
  getTextClass: (type: 'title' | 'body') => string;
  getCardClass: () => string;
  getScaleClass: () => string;
  getBackButtonClass: () => string;
}

export function ModeSelection({
  glassMode,
  selectedMode,
  onSelectMode,
  onBack,
  onNext,
  getTextClass,
  getCardClass,
  getScaleClass,
  getBackButtonClass,
}: ModeSelectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={'flex flex-col items-center gap-6 sm:gap-8 px-3 sm:px-1.5'}
    >
      <div className={'text-center'}>
        <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
          <Trans>How would you like to use Glass?</Trans>
        </h2>
        <p className={`${getTextClass('body')} text-sm`}>
          <Trans>Choose your preferred mode</Trans>
        </p>
      </div>

      <div className={'flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch sm:items-start w-full sm:w-auto'}>
        <button
          onClick={() => onSelectMode('roleplay')}
          className={cn(
            'px-5 py-4 sm:px-8 sm:py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-full sm:w-[280px]',
            getCardClass(),
            getScaleClass()
          )}
        >
          <div className={'flex flex-col items-center gap-3'}>
            <img
              src="https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=facearea&facepad=2&w=80&h=80&q=80"
              alt="AI Roleplay person"
              className={'h-[24px] w-[24px] sm:h-[28px] sm:w-[28px] object-cover rounded-full'}
            />
            <div className={'text-center'}>
              <div className={`${getTextClass('title')} font-medium mb-1 text-base`}>
                <Trans>AI Roleplay</Trans>
              </div>
              <div className={`${getTextClass('body')} text-xs`}>
                <Trans>Practice Conversations</Trans>
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => onSelectMode('live_call')}
          className={cn(
            'px-5 py-4 sm:px-8 sm:py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-full sm:w-[280px] relative',
            getCardClass(),
            getScaleClass(),
            'pointer-events-none opacity-60 sm:pointer-events-auto sm:opacity-100'
          )}
        >
          <div
            className={
              'absolute -top-2 -right-2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[10px] font-bold shadow-lg'
            }
          >
            <Trans>RECOMMENDED</Trans>
          </div>

          <div className={'flex flex-col items-center gap-3'}>
            <div className={'flex gap-2 items-center justify-center'}>
              <Phone className={'h-6 w-6 text-blue-500'} />
            </div>
            <div className={'text-center'}>
              <div className={`${getTextClass('title')} font-medium mb-1 text-base`}>
                <Trans>Live Call</Trans>
              </div>
              <div className={`${getTextClass('body')} text-xs`}>
                <Trans>Language Exchange • Calls</Trans>
              </div>
              <div
                className={
                  'sm:hidden inline-flex items-center gap-1 mt-2 text-[11px] px-2 py-1 rounded-full border ' +
                  (glassMode ? 'border-white/30 text-white/70' : 'border-border text-muted-foreground')
                }
              >
                <span className={'leading-none text-xs'}>
                  <Trans>Unavailable on mobile</Trans>
                </span>
              </div>
            </div>
          </div>
        </button>
      </div>

      <div className={'flex justify-between items-center w-full'}>
        <button onClick={onBack} className={cn(getBackButtonClass(), 'cursor-pointer')}>
          <Trans>← Back</Trans>
        </button>
        <Button
          onClick={onNext}
          disabled={!selectedMode}
          variant={glassMode ? 'translucent' : 'default'}
          size="sm"
          className={cn('text-sm cursor-pointer', !selectedMode && 'opacity-50 cursor-not-allowed')}
        >
          <Trans>Next →</Trans>
        </Button>
      </div>
    </motion.div>
  );
}
