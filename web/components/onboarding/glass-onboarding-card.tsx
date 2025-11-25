'use client';

import type { CardComponentProps } from 'nextstepjs';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils';
import { Trans } from '@lingui/react/macro';

export const GlassOnboardingCard = ({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) => {
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  // Pre-calculate positioning to avoid visual jumps when switching steps
  const positioningClasses = (() => {
    if (typeof window === 'undefined') return '';

    const width = window.innerWidth;
    const isMobile = width < 768;

    // Step 2 (I help you speak) - card is now above input (side: bottom)
    if (currentStep === 2) {
      return '';
    }
    // Step 4 (After each conversation) - adjust positioning
    if (currentStep === 4) {
      if (isMobile) {
        // On mobile, move card down to prevent top cutoff
        return '!translate-y-[100px]';
      }
      // On tablet/small desktop, adjust vertical position
      const shouldApply = width >= 768 && width <= 1366;
      return shouldApply ? 'my-[-100px]' : '';
    }
    // Step 5 (I remember you) - position card just above memory section highlight
    if (currentStep === 5) {
      return '';
    }
    return '';
  })();

  return (
    <div
      className={cn(
        'relative z-9999 w-[320px] sm:w-[400px] max-w-[90vw] rounded-lg border border-border bg-background p-4 sm:p-6 shadow-lg',
        positioningClasses
      )}
    >
      {/* Glass AI Avatar */}
      <div className={'mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3'}>
        <div
          className={
            'flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-primary/10 text-xl sm:text-2xl'
          }
        >
          {step.icon || '✨'}
        </div>
        <div className={'flex-1'}>
          <h3 className={'text-base sm:text-lg font-semibold'}>{step.title}</h3>
        </div>
      </div>

      {/* Content */}
      <div
        className={
          'mb-4 sm:mb-6 text-xs sm:text-sm leading-relaxed text-foreground'
        }
      >
        {step.content}
      </div>

      {/* Step Indicators */}
      <div className={'mb-3 sm:mb-4 flex items-center justify-center gap-1.5'}>
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div
            key={index}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              index === currentStep
                ? 'w-6 bg-primary'
                : index < currentStep
                ? 'w-1.5 bg-primary/40'
                : 'w-1.5 bg-muted-foreground/20'
            )}
          />
        ))}
      </div>

      {/* Controls */}
      <div className={'flex items-center justify-between gap-1.5 sm:gap-2'}>
        {!isLastStep && (
          <Button
            variant="ghost"
            size="sm"
            onClick={skipTour}
            className={
              'text-[10px] sm:text-xs text-muted-foreground h-7 sm:h-8 px-2 sm:px-3'
            }
          >
            <Trans>Skip tour</Trans>
          </Button>
        )}
        {isLastStep && <div />}

        <div className={'flex gap-1.5 sm:gap-2'}>
          {!isFirstStep && (
            <Button
              variant="outline"
              size="sm"
              onClick={prevStep}
              className={'text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3'}
            >
              <Trans>Back</Trans>
            </Button>
          )}
          <Button
            size="sm"
            onClick={nextStep}
            className={'text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3'}
          >
            {isLastStep ? <Trans>Let's Go! 🎉</Trans> : <Trans>Next →</Trans>}
          </Button>
        </div>
      </div>

      {/* Arrow pointing to target */}
      {arrow}
    </div>
  );
};
