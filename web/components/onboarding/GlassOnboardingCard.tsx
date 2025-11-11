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

  return (
    <div
      className={cn(
        'relative z-9999 w-[400px] max-w-[90vw] rounded-lg border border-border bg-background p-6 shadow-lg',
        'animate-in fade-in slide-in-from-top-2 duration-300'
      )}
    >
      {/* Glass AI Avatar */}
      <div className={'mb-4 flex items-center gap-3'}>
        <div
          className={
            'flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-2xl'
          }
        >
          {step.icon || '✨'}
        </div>
        <div className={'flex-1'}>
          <h3 className={'text-lg font-semibold'}>{step.title}</h3>
        </div>
      </div>

      {/* Content */}
      <div className={'mb-6 text-sm leading-relaxed text-foreground'}>
        {step.content}
      </div>

      {/* Step Indicators */}
      <div className={'mb-4 flex items-center justify-center gap-1.5'}>
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
      <div className={'flex items-center justify-between gap-2'}>
        {!isLastStep && (
          <Button
            variant="ghost"
            size="sm"
            onClick={skipTour}
            className={'text-xs text-muted-foreground'}
          >
            <Trans>Skip tour</Trans>
          </Button>
        )}
        {isLastStep && <div />}

        <div className={'flex gap-2'}>
          {!isFirstStep && (
            <Button
              variant="outline"
              size="sm"
              onClick={prevStep}
              className={'text-xs'}
            >
              <Trans>Back</Trans>
            </Button>
          )}
          <Button size="sm" onClick={nextStep} className={'text-xs'}>
            {isLastStep ? <Trans>Let's Go! 🎉</Trans> : <Trans>Next →</Trans>}
          </Button>
        </div>
      </div>

      {/* Arrow pointing to target */}
      {arrow}
    </div>
  );
};
