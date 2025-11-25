'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Loader2,
  Sparkles,
  MessageCircleMore,
  Volume2,
  X,
  SlidersHorizontal,
  Languages,
} from 'lucide-react';
// @ts-ignore - no types provided
import Typewriter from 'typewriter-effect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useGlass, FeedbackMode, SuggestMode } from '@/contexts/glass-context';
import { SparkleGlyph } from '@/components/sparkle-glyph';

export type MockSuggestion = {
  text?: string;
  targetText?: string;
  pronunciation?: string;
  translation?: string;
  progress?: number;
};

export type MockFeedback = {
  translation?: string;
  targetText?: string;
  pronunciation?: string;
  progress?: number;
};

export type OnboardingBottomPanelProps = {
  suggestion?: MockSuggestion;
  feedback?: MockFeedback;
  hintInput?: string;
  requestingHint?: boolean;
  showHintResult?: boolean;
  showTyping?: boolean;
  simulateFocus?: boolean;
  typewriterText?: string;
  onTypingComplete?: () => void;
  onHintChange?: (value: string) => void;
  currentStep?: number;
};

export default function OnboardingBottomPanel({
  suggestion,
  feedback,
  hintInput = '',
  requestingHint = false,
  showHintResult = false,
  showTyping = false,
  simulateFocus = false,
  typewriterText = 'Nice to meet you',
  onTypingComplete,
  onHintChange,
  currentStep = 0,
}: OnboardingBottomPanelProps) {
  const { settings, isSpeaking } = useGlass();
  const [showManualButtons, setShowManualButtons] = useState(false);
  const manualButtonsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const hintInputRef = useRef<HTMLInputElement>(null);
  const [hintFocused, setHintFocused] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Sync simulated focus with actual focus state
  useEffect(() => {
    setHintFocused(simulateFocus);
  }, [simulateFocus]);
  const feedbackModeLabels: Record<FeedbackMode, string> = {
    always: t`Always`,
    auto: t`Auto`,
    off: t`Off`,
  };

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (suggestion || feedback || isSpeaking) {
      setShowManualButtons(false);
      if (manualButtonsTimerRef.current) {
        clearTimeout(manualButtonsTimerRef.current);
        manualButtonsTimerRef.current = null;
      }
      return;
    }
    manualButtonsTimerRef.current = setTimeout(
      () => setShowManualButtons(true),
      2000
    );
    return () => {
      if (manualButtonsTimerRef.current) {
        clearTimeout(manualButtonsTimerRef.current);
        manualButtonsTimerRef.current = null;
      }
    };
  }, [suggestion, feedback, isSpeaking]);

  const getHintPlaceholder = (short = false) => {
    const nativeLang = settings.languages.nativeLang.toLowerCase();
    const langNames: Record<string, string> = {
      ja: t`Japanese`,
      ko: t`Korean`,
      es: t`Spanish`,
      fr: t`French`,
      en: t`English`,
    };
    const nativeLangName = langNames[nativeLang] || 'your language';
    return short
      ? t`What do you want to say...`
      : t`Type what you want to say in ${nativeLangName}`;
  };

  const handleHintKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
    }
  };
  const hasHintInput = hintInput.trim().length > 0 || showTyping;
  const shouldShowEnter = hintFocused && hasHintInput && !requestingHint;
  const showButtonLabel = hintFocused && !hasHintInput && !requestingHint;

  const renderMockSuggestion = () => {
    if (!suggestion) return null;
    return (
      <motion.div
        key={'mock-suggestion'}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={'relative'}>
          <div
            className={
              'p-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden'
            }
          >
            <div className={'flex items-start justify-between gap-2 mb-2'}>
              <div className={'flex items-center gap-2'}>
                <Sparkles className={'size-4 text-primary'} />
                <span
                  className={'text-xs font-medium text-muted-foreground'}
                >{t`Suggested Answer`}</span>
              </div>
              <div className={'flex items-center gap-1'}>
                <button
                  className={
                    'text-muted-foreground/70 cursor-not-allowed transition-colors p-1 rounded-md hover:bg-accent/50'
                  }
                  aria-label="Speak"
                  type="button"
                  disabled
                >
                  <Volume2 className={'size-3.5'} />
                </button>
                <button
                  className={
                    'text-muted-foreground/70 cursor-not-allowed transition-colors p-1'
                  }
                  aria-label="Close"
                  type="button"
                  disabled
                >
                  <X className={'size-3.5'} />
                </button>
              </div>
            </div>
            <div className={'space-y-1.5'}>
              {suggestion.targetText && (
                <div className={'text-sm text-foreground'}>
                  {suggestion.targetText}
                </div>
              )}
              {suggestion.pronunciation && (
                <div className={'text-sm text-sky-600 opacity-80'}>
                  {suggestion.pronunciation}
                </div>
              )}
              {suggestion.translation && (
                <div className={'text-sm text-muted-foreground'}>
                  {suggestion.translation}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderMockFeedback = () => {
    if (!feedback) return null;
    return (
      <motion.div
        key={'mock-feedback'}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className={'relative'}
          id="glass-feedback-message"
          data-tour="feedback"
        >
          <div
            className={
              'p-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden'
            }
          >
            <div className={'flex items-start justify-between gap-2 mb-2'}>
              <div className={'flex items-center gap-2'}>
                <MessageCircleMore className={'size-4 text-primary'} />
                <span className={'text-xs font-medium text-muted-foreground'}>
                  <Trans>Feedback</Trans>
                </span>
              </div>
              <button
                className={
                  'text-muted-foreground/70 cursor-not-allowed transition-colors p-1'
                }
                aria-label="Close"
                type="button"
                disabled
              >
                <X className={'size-3.5'} />
              </button>
            </div>
            <div className={'space-y-1.5'}>
              {feedback.translation && (
                <div className={'text-sm text-foreground'}>
                  {feedback.translation}
                </div>
              )}
              {feedback.targetText && (
                <div className={'text-sm text-muted-foreground'}>
                  {feedback.targetText}
                </div>
              )}
              {feedback.pronunciation && (
                <div className={'text-sm text-sky-600 opacity-80'}>
                  {feedback.pronunciation}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const suggestMode: SuggestMode = settings.suggestMode ?? 'auto';

  // Adjust height based on current step
  const minHeight = currentStep === 1 ? 'min-h-[40vh]' : 'min-h-[50vh]';

  return (
    <div className={cn('mx-auto w-full', minHeight)}>
      <div
        className={
          'max-w-2xl mx-auto w-full px-4 h-full flex flex-col pt-20 sm:pt-32'
        }
      >
        <div id="glass-input-and-suggestion">
          <div
            id="glass-translate-section"
            className={'border-t border-border/30 pt-3 pb-3 shrink-0'}
          >
            <div className={'flex items-center gap-2 md:gap-3 mb-3'}>
              <div className={'relative flex-1 min-w-0'}>
                <Languages
                  className={
                    'absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none z-10'
                  }
                />
                {showTyping ? (
                  <div
                    className={cn(
                      'h-10 pl-9 pr-20 text-sm w-full bg-muted rounded-md border border-input flex items-center',
                      'text-foreground'
                    )}
                  >
                    <Typewriter
                      onInit={(typewriter) => {
                        typewriter
                          .changeDelay(80)
                          .typeString(typewriterText || 'Nice to meet you')
                          .callFunction(() => {
                            onTypingComplete?.();
                          })
                          .start();
                      }}
                      options={{
                        cursor: '|',
                        cursorClassName: 'text-foreground',
                      }}
                    />
                  </div>
                ) : (
                  <Input
                    ref={hintInputRef}
                    type="text"
                    value={hintInput}
                    onChange={(e) => onHintChange?.(e.target.value)}
                    onFocus={() => setHintFocused(true)}
                    onBlur={() => setHintFocused(false)}
                    onKeyDown={handleHintKeyDown}
                    placeholder={getHintPlaceholder(isMobile)}
                    className={cn(
                      'h-10 pl-9 pr-20 text-sm placeholder:text-sm w-full bg-muted',
                      'text-foreground'
                    )}
                    disabled
                  />
                )}
                <button
                  type="button"
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2 flex h-7 items-center rounded-md bg-primary px-2 text-primary-foreground group-hover:px-3.5 transition-all duration-300 cursor-pointer group overflow-hidden shadow-md hover:shadow-lg active:scale-95'
                  )}
                  disabled
                >
                  {requestingHint ? (
                    <Loader2 className={'size-3.5 animate-spin'} />
                  ) : (
                    <>
                      <AnimatePresence mode="wait" initial={false}>
                        {shouldShowEnter ? (
                          <motion.span
                            key="enter"
                            initial={{ opacity: 0, x: 6, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -6, scale: 0.9 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className={'text-sm relative z-10'}
                          >
                            ⏎
                          </motion.span>
                        ) : (
                          <motion.span
                            key="sparkle"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className={'relative z-10 flex'}
                          >
                            <SparkleGlyph />
                          </motion.span>
                        )}
                      </AnimatePresence>
                      <motion.span
                        className={
                          'text-xs font-medium whitespace-nowrap overflow-hidden relative z-10'
                        }
                        animate={{
                          maxWidth: showButtonLabel ? 120 : 0,
                          opacity: showButtonLabel ? 1 : 0,
                          marginLeft: showButtonLabel ? 4 : 0,
                        }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        aria-hidden={!showButtonLabel}
                      >
                        <Trans>Get Suggestions</Trans>
                      </motion.span>
                    </>
                  )}
                </button>
              </div>

              <div className={'flex items-center gap-2 shrink-0'}>
                <div className={'relative'}>
                  <Button
                    id="glass-settings-button"
                    variant="outline"
                    size="sm"
                    className={'h-10 w-10 p-0 cursor-pointer opacity-60'}
                    disabled
                  >
                    <SlidersHorizontal className={'size-3.5'} />
                  </Button>

                  <AnimatePresence>
                    {showOptionsMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={
                          'absolute right-0 top-full mt-1 min-w-[260px] bg-card border border-border/50 rounded-lg shadow-lg overflow-hidden z-50 p-3 opacity-60 pointer-events-none'
                        }
                      >
                        <div className={'space-y-3'}>
                          <div>
                            <div
                              className={
                                'text-[11px] font-medium text-muted-foreground mb-2'
                              }
                            >
                              <Trans>Suggest</Trans>
                            </div>
                            <div
                              className={
                                'inline-flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5 w-full'
                              }
                            >
                              {(
                                ['always', 'auto', 'off'] as FeedbackMode[]
                              ).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  className={cn(
                                    'flex-1 rounded-sm px-2 py-1 text-[11px] font-medium transition-colors',
                                    mode === settings.feedbackMode &&
                                      'bg-primary text-primary-foreground'
                                  )}
                                  disabled
                                >
                                  {feedbackModeLabels[mode]}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div
                              className={
                                'text-[11px] font-medium text-muted-foreground mb-2'
                              }
                            >
                              <Trans>Auto Response</Trans>
                            </div>
                            <div
                              className={
                                'inline-flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5 w-full'
                              }
                            >
                              {(['always', 'auto', 'off'] as SuggestMode[]).map(
                                (mode) => (
                                  <button
                                    key={mode}
                                    type="button"
                                    className={cn(
                                      'flex-1 rounded-sm px-2 py-1 text-[11px] font-medium transition-colors',
                                      mode === suggestMode &&
                                        'bg-primary text-primary-foreground'
                                    )}
                                    disabled
                                  >
                                    {feedbackModeLabels[mode as FeedbackMode] ??
                                      mode}
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          <div
            id="glass-ai-panel"
            data-tour="suggestions"
            className={'flex items-start gap-3 pb-4 flex-1'}
          >
            <div
              id="glass-ai-with-feedback"
              className={'flex items-start gap-3 w-full'}
            >
              {/* Avatar */}
              <div className={'shrink-0 relative pt-1'}>
                <div
                  className={
                    'size-10 rounded-full overflow-hidden bg-card/80 border border-border/50'
                  }
                >
                  <img
                    src="/glass-ai.png"
                    alt="Glass AI"
                    className={'w-full h-full object-cover'}
                  />
                </div>
                {/* Message count badge - show when multiple messages */}
                {suggestion && feedback && (
                  <div
                    className={
                      'absolute -top-1 -right-1 bg-gray-700 text-white text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center'
                    }
                  >
                    2
                  </div>
                )}
              </div>

              {/* Content area */}
              <div className={'flex-1 space-y-3 pr-1'}>
                <AnimatePresence mode="popLayout">
                  {suggestion || feedback ? (
                    <>
                      {renderMockFeedback()}
                      {renderMockSuggestion()}
                    </>
                  ) : (
                    <motion.div
                      key={'listening-fallback'}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div
                        className={
                          'p-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl'
                        }
                      >
                        <div className={'flex items-center justify-between'}>
                          <div className={'flex items-center gap-2'}>
                            <span className={'relative flex h-2.5 w-2.5'}>
                              <span
                                className={
                                  'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40'
                                }
                              />
                              <span
                                className={
                                  'relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400'
                                }
                              />
                            </span>
                            <span className={'text-sm text-muted-foreground'}>
                              <Trans>
                                Listening. Say anything when you're ready.
                              </Trans>
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
