import { Trans } from '@lingui/react/macro';
import { Button } from './ui/button';
import { cn } from '@/utils';
import { Loader2, Phone } from 'lucide-react';
import type { ConversationPartner } from '@/lib/account-api';
import { ReactNode } from 'react';

interface StartCallInstructionsProps {
  selectedMode: 'roleplay' | 'live_call';
  selectedRoleplayPartner: ConversationPartner | undefined;
  getTextClass: (type: 'title' | 'body' | 'muted') => string;
  getBackButtonClass: () => string;
  canStartCall: boolean;
  isStartingCall: boolean;
  onBack: () => void;
  onStartCall: () => void;
  liveCallSteps: ReactNode;
}

export function StartCallInstructions({
  selectedMode,
  selectedRoleplayPartner,
  getTextClass,
  getBackButtonClass,
  canStartCall,
  isStartingCall,
  onBack,
  onStartCall,
  liveCallSteps,
}: StartCallInstructionsProps) {
  return (
    <div
      className={
        'flex flex-col items-center gap-5 sm:gap-6 max-w-lg mx-auto px-1.5'
      }
    >
      <div className={'text-center'}>
        <h2
          className={`${getTextClass(
            'title'
          )} text-xl sm:text-2xl font-medium mb-1.5 sm:mb-2`}
        >
          {selectedMode === 'roleplay' ? (
            <Trans>AI Language Exchange</Trans>
          ) : (
            <Trans>Live Language Exchange</Trans>
          )}
        </h2>
      </div>

      <div
        className={cn(
          'rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6',
          'bg-card border border-border'
        )}
      >
        {selectedMode === 'roleplay' ? (
          <div className={getTextClass('title')}>
            {selectedRoleplayPartner ? (
              <div>
                <p
                  className={`text-[10px] sm:text-xs ${getTextClass(
                    'muted'
                  )} mb-1 sm:mb-1.5 md:mb-2`}
                >
                  <Trans>Partner</Trans>
                </p>
                <p className={'text-sm sm:text-base font-medium'}>
                  {selectedRoleplayPartner.name}
                </p>
                {(selectedRoleplayPartner.descriptionTranslation ||
                  selectedRoleplayPartner.description) && (
                  <p
                    className={`${getTextClass(
                      'body'
                    )} text-xs sm:text-sm mt-0.5 sm:mt-1`}
                  >
                    {selectedRoleplayPartner.descriptionTranslation ||
                      selectedRoleplayPartner.description}
                  </p>
                )}
              </div>
            ) : (
              <p className={`${getTextClass('muted')} text-xs sm:text-sm`}>
                <Trans>Select a partner to see details.</Trans>
              </p>
            )}
          </div>
        ) : (
          liveCallSteps
        )}
      </div>

      <div className={'flex justify-between items-center w-full'}>
        <button
          onClick={onBack}
          className={cn(getBackButtonClass(), 'cursor-pointer')}
          disabled={isStartingCall}
        >
          <Trans>← Back</Trans>
        </button>
        <Button
          variant="default"
          onClick={onStartCall}
          disabled={!canStartCall || isStartingCall}
          className={cn(
            'cursor-pointer rounded-full px-4 py-1.5 sm:px-6 sm:py-2 md:px-7 md:py-2.5 inline-flex items-center gap-1 sm:gap-1.5 font-semibold tracking-tight text-xs sm:text-sm text-white bg-emerald-500 hover:bg-emerald-600',
            (!canStartCall || isStartingCall) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isStartingCall ? (
            <Loader2
              className="size-3.5 sm:size-4 opacity-80 animate-spin"
              strokeWidth={2.25}
            />
          ) : (
            <Phone
              className="size-3.5 sm:size-4 opacity-50 fill-current"
              strokeWidth={0}
            />
          )}
          {isStartingCall ? (
            <Trans>Connecting...</Trans>
          ) : (
            <Trans>Start Call</Trans>
          )}
        </Button>
      </div>
    </div>
  );
}
