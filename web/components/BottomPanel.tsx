'use client';
import { useState, useRef, useEffect, forwardRef, ComponentRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Sparkles, MessageCircleMore, Volume2, X, SlidersHorizontal, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils';
import { useGlass, AISuggestion, AIFeedback, AITranslation, FeedbackMode, SuggestMode } from '@/contexts/GlassContext';

type SuggestionBubbleProps = {
  suggestion: AISuggestion;
  onClose: () => void;
  durationSec: number | null; // null = no time limit
  contentOpacity?: number; // Opacity for content only (not border/background)
};

const SuggestionBubble = forwardRef<HTMLDivElement, SuggestionBubbleProps>(
  ({ suggestion, onClose, durationSec, contentOpacity = 1 }, ref) => {
    const {
      speakText,
      isSpeaking,
      stopSpeaking,
      pauseSuggestionTimer,
      resumeSuggestionTimer,
      getSuggestionRemainingMs,
    } = useGlass();
    const [isPlayingThis, setIsPlayingThis] = useState(false);
    const progressRef = useRef<HTMLDivElement | null>(null);
    const [showPronLoading, setShowPronLoading] = useState(false);

    const typeLabels = {
      answer: 'Suggested Answer',
      follow_up: 'Follow-up Suggestion',
    } as const;

    const handleSpeak = async () => {
      if (isPlayingThis) {
        stopSpeaking();
        setIsPlayingThis(false);
        return;
      }
      const textToSpeak = suggestion.target_text;
      if (textToSpeak) {
        try {
          setIsPlayingThis(true);
          await speakText(textToSpeak);
          const interval = setInterval(() => {
            if (!isSpeaking) {
              setIsPlayingThis(false);
              clearInterval(interval);
            }
          }, 100);
        } catch {
          setIsPlayingThis(false);
        }
      }
    };

    // Smooth visual countdown via requestAnimationFrame (no React state churn)
    useEffect(() => {
      if (durationSec === null) {
        // No time limit - keep progress bar at 100%
        if (progressRef.current) {
          progressRef.current.style.width = '100%';
        }
        return;
      }
      let rafId: number;
      const tick = () => {
        const ms = getSuggestionRemainingMs(suggestion.id);
        const ratio = Math.max(0, Math.min(1, ms / (durationSec * 1000)));
        if (progressRef.current) {
          progressRef.current.style.width = `${ratio * 100}%`;
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [getSuggestionRemainingMs, suggestion.id, durationSec]);

    // Subtle pronunciation loading shimmer (appears only if it takes > ~220ms)
    useEffect(() => {
      if (suggestion?.target_text && !suggestion?.pronunciation) {
        const t = setTimeout(() => setShowPronLoading(true), 220);
        return () => clearTimeout(t);
      }
      setShowPronLoading(false);
    }, [suggestion?.target_text, suggestion?.pronunciation]);

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        onPointerEnter={() => pauseSuggestionTimer(suggestion.id)}
        onPointerLeave={() => resumeSuggestionTimer(suggestion.id)}
        onPointerCancel={() => resumeSuggestionTimer(suggestion.id)}
      >
        <div className={'relative'}>
          <div className={'p-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden'}>
            <div style={{ opacity: contentOpacity }}>
              <div className={'flex items-start justify-between gap-2 mb-2'}>
                <div className={'flex items-center gap-2'}>
                  <Sparkles className={'size-4 text-primary'} />
                  <span className={'text-xs font-medium text-muted-foreground'}>{typeLabels[suggestion.type]}</span>
                </div>
                <div className={'flex items-center gap-1'}>
                  <button
                    onClick={handleSpeak}
                    className={cn(
                      'text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-accent/50',
                      isPlayingThis && 'text-primary'
                    )}
                    aria-label="Speak"
                  >
                    <Volume2 className={cn('size-3.5', isPlayingThis && 'animate-pulse')} />
                  </button>
                  <button
                    onClick={onClose}
                    className={'text-muted-foreground hover:text-foreground transition-colors p-1'}
                    aria-label="Close"
                  >
                    <X className={'size-3.5'} />
                  </button>
                </div>
              </div>
              <div className={'space-y-1.5'}>
                {suggestion.target_text && <div className={'text-sm text-foreground'}>{suggestion.target_text}</div>}
                {suggestion.pronunciation && (
                  <div className={'text-sm text-sky-600 opacity-80'}>{suggestion.pronunciation}</div>
                )}
                {!suggestion.pronunciation && showPronLoading && (
                  <div className={'h-3 w-24 rounded bg-sky-400/10 animate-pulse'} />
                )}
                {suggestion.native_translation && (
                  <div className={'text-xs text-muted-foreground'}>{suggestion.native_translation}</div>
                )}
              </div>
            </div>
            {durationSec !== null && (
              <div className={'absolute bottom-0 left-0 right-0 h-[2px] bg-border/30'}>
                <div ref={progressRef} className={'h-full bg-primary/40'} style={{ width: '100%' }} />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
);

SuggestionBubble.displayName = 'SuggestionBubble';

type FeedbackBubbleProps = {
  feedback: AIFeedback;
  onClose: () => void;
  durationSec: number | null; // null = no time limit
  contentOpacity?: number; // Opacity for content only (not border/background)
};

const FeedbackBubble = forwardRef<HTMLDivElement, FeedbackBubbleProps>(
  ({ feedback, onClose, durationSec, contentOpacity = 1 }, ref) => {
    const { pauseFeedbackTimer, resumeFeedbackTimer, getFeedbackRemainingMs } = useGlass();
    const progressRef = useRef<HTMLDivElement | null>(null);

    // Smooth visual countdown
    useEffect(() => {
      if (durationSec === null) {
        // No time limit - keep progress bar at 100%
        if (progressRef.current) {
          progressRef.current.style.width = '100%';
        }
        return;
      }
      let rafId: number;
      const tick = () => {
        const ms = getFeedbackRemainingMs(feedback.id);
        const ratio = Math.max(0, Math.min(1, ms / (durationSec * 1000)));
        if (progressRef.current) {
          progressRef.current.style.width = `${ratio * 100}%`;
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [getFeedbackRemainingMs, feedback.id, durationSec]);

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        onPointerEnter={() => pauseFeedbackTimer(feedback.id)}
        onPointerLeave={() => resumeFeedbackTimer(feedback.id)}
        onPointerCancel={() => resumeFeedbackTimer(feedback.id)}
      >
        <div className={'relative'}>
          <div className={'p-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden'}>
            <div style={{ opacity: contentOpacity }}>
              <div className={'flex items-start justify-between gap-2 mb-2'}>
                <div className={'flex items-center gap-2'}>
                  <MessageCircleMore className={'size-4 text-primary'} />
                  <span className={'text-xs font-medium text-muted-foreground'}>Feedback</span>
                </div>
                <button
                  onClick={onClose}
                  className={'text-muted-foreground hover:text-foreground transition-colors p-1'}
                  aria-label="Close"
                >
                  <X className={'size-3.5'} />
                </button>
              </div>
              <div className={'space-y-1.5'}>
                {feedback.reason_native && <div className={'text-sm text-foreground'}>{feedback.reason_native}</div>}
                {feedback.target_text && <div className={'text-sm text-muted-foreground'}>{feedback.target_text}</div>}
                {feedback.pronunciation && (
                  <div className={'text-sm text-sky-600 opacity-80'}>{feedback.pronunciation}</div>
                )}
                {!feedback.target_text && !feedback.pronunciation && feedback.text && (
                  <p className={'text-sm'}>{feedback.text}</p>
                )}
              </div>
            </div>
            {durationSec !== null && (
              <div className={'absolute bottom-0 left-0 right-0 h-[2px] bg-border/30'}>
                <div ref={progressRef} className={'h-full bg-primary/40'} style={{ width: '100%' }} />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
);

FeedbackBubble.displayName = 'FeedbackBubble';

type TranslationBubbleProps = {
  translation: AITranslation;
  onClose: () => void;
  durationSec: number | null; // null = no time limit
  contentOpacity?: number; // Opacity for content only (not border/background)
};

const TranslationBubble = forwardRef<HTMLDivElement, TranslationBubbleProps>(
  ({ translation, onClose, durationSec, contentOpacity = 1 }, ref) => {
    const {
      speakText,
      isSpeaking,
      stopSpeaking,
      pauseTranslationTimer,
      resumeTranslationTimer,
      getTranslationRemainingMs,
    } = useGlass();
    const [isPlayingThis, setIsPlayingThis] = useState(false);
    const progressRef = useRef<HTMLDivElement | null>(null);
    const [showPronLoading, setShowPronLoading] = useState(false);

    const handleSpeak = async () => {
      if (isPlayingThis) {
        stopSpeaking();
        setIsPlayingThis(false);
        return;
      }
      if (translation.target_text) {
        try {
          setIsPlayingThis(true);
          await speakText(translation.target_text);
          const interval = setInterval(() => {
            if (!isSpeaking) {
              setIsPlayingThis(false);
              clearInterval(interval);
            }
          }, 100);
        } catch {
          setIsPlayingThis(false);
        }
      }
    };

    // Smooth visual countdown
    useEffect(() => {
      if (durationSec === null) {
        // No time limit - keep progress bar at 100%
        if (progressRef.current) {
          progressRef.current.style.width = '100%';
        }
        return;
      }
      let rafId: number;
      const tick = () => {
        const ms = getTranslationRemainingMs(translation.id);
        const ratio = Math.max(0, Math.min(1, ms / (durationSec * 1000)));
        if (progressRef.current) {
          progressRef.current.style.width = `${ratio * 100}%`;
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [getTranslationRemainingMs, translation.id, durationSec]);

    // Subtle pronunciation loading shimmer (appears only if it takes > ~220ms)
    useEffect(() => {
      if (translation?.target_text && !translation?.pronunciation) {
        const t = setTimeout(() => setShowPronLoading(true), 220);
        return () => clearTimeout(t);
      }
      setShowPronLoading(false);
    }, [translation?.target_text, translation?.pronunciation]);

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        onPointerEnter={() => pauseTranslationTimer(translation.id)}
        onPointerLeave={() => resumeTranslationTimer(translation.id)}
        onPointerCancel={() => resumeTranslationTimer(translation.id)}
      >
        <div className={'relative'}>
          <div className={'p-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden'}>
            <div style={{ opacity: contentOpacity }}>
              <div className={'flex items-start justify-between gap-2 mb-2'}>
                <div className={'flex items-center gap-2'}>
                  <Languages className={'size-4 text-primary'} />
                  <span className={'text-xs font-medium text-muted-foreground'}>Translation</span>
                </div>
                <div className={'flex items-center gap-1'}>
                  <button
                    onClick={handleSpeak}
                    className={cn(
                      'text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-accent/50',
                      isPlayingThis && 'text-primary'
                    )}
                    aria-label="Speak"
                  >
                    <Volume2 className={cn('size-3.5', isPlayingThis && 'animate-pulse')} />
                  </button>
                  <button
                    onClick={onClose}
                    className={'text-muted-foreground hover:text-foreground transition-colors p-1'}
                    aria-label="Close"
                  >
                    <X className={'size-3.5'} />
                  </button>
                </div>
              </div>
              <div className={'space-y-1.5'}>
                {translation.target_text && <div className={'text-sm text-foreground'}>{translation.target_text}</div>}
                {translation.pronunciation && (
                  <div className={'text-sm text-sky-600 opacity-80'}>{translation.pronunciation}</div>
                )}
                {!translation.pronunciation && showPronLoading && (
                  <div className={'h-3 w-24 rounded bg-sky-400/10 animate-pulse'} />
                )}
                {translation.native_translation && (
                  <div className={'text-xs text-muted-foreground'}>{translation.native_translation}</div>
                )}
              </div>
            </div>
            {durationSec !== null && (
              <div className={'absolute bottom-0 left-0 right-0 h-[2px] bg-border/30'}>
                <div ref={progressRef} className={'h-full bg-primary/40'} style={{ width: '100%' }} />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
);

TranslationBubble.displayName = 'TranslationBubble';

type MockSuggestion = {
  type: 'answer' | 'feedback' | 'translate';
  text?: string;
  targetText?: string;
  pronunciation?: string;
  translation?: string;
  progress?: number;
};

type BottomPanelProps = {
  // Mock mode props
  isMockMode?: boolean;
  mockSuggestion?: MockSuggestion;
  mockTranslateInput?: string;
  mockTranslating?: boolean;
  mockShowTranslateResult?: boolean;
  onMockTranslateChange?: (value: string) => void;
};

export default function BottomPanel({
  isMockMode = false,
  mockSuggestion,
  mockTranslateInput = '',
  mockTranslating = false,
  mockShowTranslateResult = false,
  onMockTranslateChange,
}: BottomPanelProps) {
  const {
    requestSuggestion,
    requestTranslate,
    updateFeedbackMode,
    updateSuggestMode,
    settings,
    suggestions,
    feedbacks,
    translations,
    addSuggestion,
    removeSuggestion,
    addTranslation,
    removeFeedback,
    removeTranslation,
    isSpeaking,
  } = useGlass();

  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [translateInput, setTranslateInput] = useState('');
  const [loadingTranslate, setLoadingTranslate] = useState(false);
  const [showManualButtons, setShowManualButtons] = useState(false);
  const manualButtonsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateInputRef = useRef<HTMLInputElement>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const suggestMode: SuggestMode = settings.suggestMode ?? 'auto';
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Get language-specific placeholder for translate input
  const getTranslatePlaceholder = (short: boolean = false) => {
    const learningLang = settings.languages.learningLang.toLowerCase();
    const langNames: Record<string, string> = {
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      en: 'English',
    };
    const langName = langNames[learningLang] || 'target language';
    return short ? `To ${langName}...` : `Translate to ${langName}...`;
  };

  const feedbackModeLabels = {
    always: 'Always',
    auto: 'Auto',
    off: 'Off',
  };

  const handleSuggestion = async () => {
    if (isMockMode) return;
    setLoadingSuggestion(true);
    try {
      const { type, suggestion } = await requestSuggestion();
      addSuggestion(type, suggestion);
    } catch (e) {
      // no-op
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const handleTranslate = async () => {
    if (isMockMode) return;
    if (!translateInput.trim() || loadingTranslate) return;

    setLoadingTranslate(true);
    try {
      const result = await requestTranslate(translateInput.trim());
      addTranslation(result);
      setTranslateInput('');
    } catch (e) {
      // no-op
    } finally {
      setLoadingTranslate(false);
    }
  };

  const handleTranslateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && translateInput.trim()) {
      e.preventDefault();
      handleTranslate();
    }
  };

  // Auto-show manual buttons when idle (no suggestions/feedbacks/translations) for 2s; hide on activity
  useEffect(() => {
    if (isMockMode) {
      setShowManualButtons(!mockSuggestion);
      return;
    }

    const isIdle =
      suggestions.length === 0 &&
      feedbacks.length === 0 &&
      translations.length === 0 &&
      !isSpeaking &&
      !loadingSuggestion;
    if (isIdle) {
      if (manualButtonsTimerRef.current) clearTimeout(manualButtonsTimerRef.current);
      manualButtonsTimerRef.current = setTimeout(() => setShowManualButtons(true), 2000);
    } else {
      setShowManualButtons(false);
      if (manualButtonsTimerRef.current) {
        clearTimeout(manualButtonsTimerRef.current);
        manualButtonsTimerRef.current = null;
      }
    }
    return () => {
      if (manualButtonsTimerRef.current) {
        clearTimeout(manualButtonsTimerRef.current);
        manualButtonsTimerRef.current = null;
      }
    };
  }, [
    isMockMode,
    mockSuggestion,
    suggestions.length,
    feedbacks.length,
    translations.length,
    isSpeaking,
    loadingSuggestion,
  ]);

  const currentTranslateInput = isMockMode ? mockTranslateInput : translateInput;
  const currentLoadingTranslate = isMockMode ? mockTranslating : loadingTranslate;

  return (
    <div className={'mx-auto w-full min-h-[40vh]'}>
      <div className={'max-w-2xl mx-auto w-full px-4 h-full flex flex-col'}>
        <div id="glass-translate-section" className={'border-t border-border/30 pt-3 pb-3 shrink-0'}>
          <div className={'flex items-center gap-2 md:gap-3 mb-3'}>
            {/* Translate input - always visible, grows to fill space */}
            <div className={'relative flex-1 min-w-0'}>
              <Languages
                className={'absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none'}
              />
              <Input
                ref={translateInputRef}
                type="text"
                value={currentTranslateInput}
                onChange={(e) => {
                  if (isMockMode) {
                    onMockTranslateChange?.(e.target.value);
                  } else {
                    setTranslateInput(e.target.value);
                  }
                }}
                onKeyDown={handleTranslateKeyDown}
                placeholder={getTranslatePlaceholder(isMobile)}
                className={'h-8 pl-9 pr-12 text-xs w-full bg-muted'}
                disabled={isMockMode}
              />
              {currentTranslateInput && !currentLoadingTranslate && !mockShowTranslateResult && (
                <button
                  type="button"
                  onClick={handleTranslate}
                  className={
                    'absolute right-2 top-1/2 -translate-y-1/2 flex h-5 items-center justify-center rounded bg-primary px-1.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90'
                  }
                  disabled={isMockMode}
                >
                  ⏎
                </button>
              )}
              {currentLoadingTranslate && (
                <Loader2
                  className={'absolute right-3 top-1/2 -translate-y-1/2 size-3 animate-spin text-muted-foreground'}
                />
              )}
            </div>

            {/* Suggest button - only when idle */}
            <AnimatePresence>
              {showManualButtons && (
                <motion.div
                  key={'suggest-button'}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSuggestion}
                    disabled={loadingSuggestion || isMockMode}
                    className={'text-xs h-8 px-3 cursor-pointer whitespace-nowrap gap-1.5 shrink-0'}
                  >
                    {loadingSuggestion ? (
                      <Loader2 className={'size-3 animate-spin'} />
                    ) : (
                      <Sparkles className={'size-3.5'} />
                    )}
                    <span>Suggest</span>
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Right group: Settings */}
            <div className={'flex items-center gap-2 shrink-0'}>
              {/* Unified Options button for both mobile and desktop */}
              <div className={'relative'}>
                <Button
                  id="glass-settings-button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                  className={'h-8 w-8 p-0 cursor-pointer'}
                  disabled={isMockMode}
                >
                  <SlidersHorizontal className={'size-3.5'} />
                </Button>

                <AnimatePresence>
                  {showOptionsMenu && !isMockMode && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className={
                        'absolute right-0 top-full mt-1 min-w-[260px] bg-card border border-border/50 rounded-lg shadow-lg overflow-hidden z-50 p-3'
                      }
                    >
                      <div className={'space-y-3'}>
                        {/* Suggest Mode */}
                        <div>
                          <div className={'text-[11px] font-medium text-muted-foreground mb-2'}>Suggest</div>
                          <div
                            className={
                              'inline-flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5 w-full'
                            }
                          >
                            {(['always', 'auto', 'off'] as SuggestMode[]).map((mode) => (
                              <button
                                key={`sug-${mode}`}
                                type="button"
                                onClick={() => updateSuggestMode(mode)}
                                className={cn(
                                  'inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-xs font-medium transition-colors flex-1',
                                  suggestMode === mode
                                    ? 'bg-accent text-accent-foreground'
                                    : 'hover:bg-accent/60 text-muted-foreground'
                                )}
                              >
                                {feedbackModeLabels[mode]}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Feedback Mode */}
                        <div>
                          <div className={'text-[11px] font-medium text-muted-foreground mb-2'}>Feedback</div>
                          <div
                            className={
                              'inline-flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5 w-full'
                            }
                          >
                            {(['always', 'auto', 'off'] as FeedbackMode[]).map((mode) => (
                              <button
                                key={`fb-${mode}`}
                                type="button"
                                onClick={() => updateFeedbackMode(mode)}
                                className={cn(
                                  'inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-xs font-medium transition-colors flex-1',
                                  settings.feedbackMode === mode
                                    ? 'bg-accent text-accent-foreground'
                                    : 'hover:bg-accent/60 text-muted-foreground'
                                )}
                              >
                                {feedbackModeLabels[mode]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div id="glass-ai-panel" className={'flex items-start gap-3 pb-4 flex-1'}>
            {/* Avatar */}
            <div className={'shrink-0 relative pt-1'}>
              <div className={'size-10 rounded-full overflow-hidden bg-card/80 border border-border/50'}>
                <img src="/glass-ai.png" alt="Glass AI" className={'w-full h-full object-cover'} />
              </div>
              {/* Message count badge */}
              {suggestions.length + feedbacks.length + translations.length > 1 && (
                <div
                  className={
                    'absolute -top-1 -right-1 bg-gray-700 text-white text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center'
                  }
                >
                  {suggestions.length + feedbacks.length + translations.length}
                </div>
              )}
            </div>

            {/* Content area */}
            <div className={'flex-1 space-y-3 pr-1'}>
              <AnimatePresence mode="popLayout">
                {isMockMode ? (
                  mockSuggestion ? (
                    <motion.div key={'mock-suggestion'} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                      <div className={'relative'}>
                        <div
                          className={
                            'p-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden'
                          }
                        >
                          <div className={'flex items-start justify-between gap-2 mb-2'}>
                            <div className={'flex items-center gap-2'}>
                              {mockSuggestion.type === 'feedback' ? (
                                <MessageCircleMore className={'size-4 text-primary'} />
                              ) : mockSuggestion.type === 'translate' ? (
                                <Languages className={'size-4 text-primary'} />
                              ) : (
                                <Sparkles className={'size-4 text-primary'} />
                              )}
                              <span className={'text-xs font-medium text-muted-foreground'}>
                                {mockSuggestion.type === 'feedback'
                                  ? 'Feedback'
                                  : mockSuggestion.type === 'translate'
                                  ? 'Translation'
                                  : 'Suggested Answer'}
                              </span>
                            </div>
                            <div className={'flex items-center gap-1'}>
                              {mockSuggestion.type !== 'feedback' && (
                                <button
                                  className={
                                    'text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-accent/50'
                                  }
                                  aria-label="Speak"
                                >
                                  <Volume2 className={'size-3.5'} />
                                </button>
                              )}
                              <button
                                className={'text-muted-foreground hover:text-foreground transition-colors p-1'}
                                aria-label="Close"
                              >
                                <X className={'size-3.5'} />
                              </button>
                            </div>
                          </div>
                          <div className={'space-y-1.5'}>
                            {mockSuggestion.type === 'feedback' ? (
                              <>
                                {/* Feedback: translation is the feedback message (black) */}
                                {mockSuggestion.translation && (
                                  <div className={'text-sm text-foreground'}>{mockSuggestion.translation}</div>
                                )}
                                {/* targetText is the corrected sentence (gray) */}
                                {mockSuggestion.targetText && (
                                  <div className={'text-sm text-muted-foreground'}>{mockSuggestion.targetText}</div>
                                )}
                                {/* pronunciation (teal) */}
                                {mockSuggestion.pronunciation && (
                                  <div className={'text-sm text-sky-600 opacity-80'}>
                                    {mockSuggestion.pronunciation}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {/* Non-feedback: targetText is main text (black) */}
                                {mockSuggestion.targetText && (
                                  <div className={'text-sm text-foreground'}>{mockSuggestion.targetText}</div>
                                )}
                                {/* pronunciation (teal) */}
                                {mockSuggestion.pronunciation && (
                                  <div className={'text-sm text-sky-600 opacity-80'}>
                                    {mockSuggestion.pronunciation}
                                  </div>
                                )}
                                {/* translation is the native translation (gray) */}
                                {mockSuggestion.translation && (
                                  <div className={'text-xs text-muted-foreground'}>{mockSuggestion.translation}</div>
                                )}
                                {mockSuggestion.text && !mockSuggestion.targetText && (
                                  <div className={'text-sm text-foreground'}>{mockSuggestion.text}</div>
                                )}
                              </>
                            )}
                          </div>
                          {mockSuggestion.progress !== undefined && (
                            <div className={'absolute bottom-0 left-0 right-0 h-[2px] bg-border/30'}>
                              <div
                                className={'h-full bg-primary/40 transition-all duration-100 ease-linear'}
                                style={{ width: `${mockSuggestion.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={'listening-fallback'}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className={'p-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl'}>
                        <div className={'flex items-center justify-between'}>
                          <div className={'flex items-center gap-2'}>
                            <span className={'relative flex h-2.5 w-2.5'}>
                              <span
                                className={
                                  'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40'
                                }
                              />
                              <span className={'relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400'} />
                            </span>
                            <span className={'text-sm text-muted-foreground'}>
                              Listening. Say anything when you're ready.
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )
                ) : suggestions.length > 0 || feedbacks.length > 0 || translations.length > 0 ? (
                  <div className={'relative'}>
                    {/* Merge and sort all AI messages by timestamp (oldest on top, newest at bottom) */}
                    {(() => {
                      const allItems = [
                        ...suggestions.map((s) => ({ type: 'suggestion' as const, data: s, timestamp: s.timestamp })),
                        ...feedbacks.map((f) => ({ type: 'feedback' as const, data: f, timestamp: f.timestamp })),
                        ...translations.map((t) => ({ type: 'translation' as const, data: t, timestamp: t.timestamp })),
                      ].sort((a, b) => b.timestamp - a.timestamp);

                      return (
                        <>
                          {allItems.map((item, index, arr) => {
                            const stackIndex = arr.length - 1 - index; // Reverse: first item (most recent) = highest stack, last (oldest) = 0 (top)
                            const maxVisible = 3; // Show max 3 cards in stack
                            const isVisible = stackIndex < maxVisible;
                            // Stack visibility - uniform spacing
                            const baseOffset = 28; // Uniform spacing
                            const offset = Math.min(stackIndex, maxVisible - 1) * baseOffset;
                            // Gentler scale difference for uniform look
                            const baseScale = 1 - Math.min(stackIndex, maxVisible - 1) * 0.06;
                            const scale = baseScale;
                            const zIndex = arr.length - stackIndex; // Higher z-index for top cards
                            const isTop = stackIndex === 0; // First card is the top one

                            // iOS-style opacity - card stays visible but content fades
                            const contentOpacity = stackIndex === 0 ? 1 : stackIndex === 1 ? 0.2 : 0.1;

                            // Top card is relative, others are absolute
                            const wrapperProps = isTop
                              ? {
                                  initial: { opacity: 0, y: -20, scale: 0.95 },
                                  animate: {
                                    opacity: 1,
                                    y: 0,
                                    scale: 1,
                                  },
                                  exit: { opacity: 0, x: 100, scale: 0.9 },
                                  transition: { duration: 0.25 },
                                  style: {
                                    position: 'relative' as const,
                                    zIndex,
                                    marginBottom: `${(maxVisible - 1) * baseOffset}px`,
                                  },
                                }
                              : {
                                  initial: { opacity: 0, y: -20, scale: 0.95 },
                                  animate: {
                                    opacity: isVisible ? 1 : 0,
                                    y: offset,
                                    scale,
                                  },
                                  exit: { opacity: 0, x: 100, scale: 0.9 },
                                  transition: { duration: 0.25 },
                                  style: {
                                    position: 'absolute' as const,
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    zIndex,
                                    pointerEvents: 'none' as const,
                                  },
                                };

                            if (item.type === 'suggestion') {
                              return (
                                <motion.div key={item.data.id} {...wrapperProps}>
                                  <SuggestionBubble
                                    suggestion={item.data}
                                    onClose={() => removeSuggestion(item.data.id)}
                                    durationSec={settings.aiMessageDurationSec ?? null}
                                    contentOpacity={contentOpacity}
                                  />
                                </motion.div>
                              );
                            } else if (item.type === 'feedback') {
                              return (
                                <motion.div key={item.data.id} {...wrapperProps}>
                                  <FeedbackBubble
                                    feedback={item.data}
                                    onClose={() => removeFeedback(item.data.id)}
                                    durationSec={settings.aiMessageDurationSec ?? null}
                                    contentOpacity={contentOpacity}
                                  />
                                </motion.div>
                              );
                            } else {
                              return (
                                <motion.div key={item.data.id} {...wrapperProps}>
                                  <TranslationBubble
                                    translation={item.data}
                                    onClose={() => removeTranslation(item.data.id)}
                                    durationSec={settings.aiMessageDurationSec ?? null}
                                    contentOpacity={contentOpacity}
                                  />
                                </motion.div>
                              );
                            }
                          })}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <motion.div key={'listening-fallback'} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                    <div className={'p-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl'}>
                      <div className={'flex items-center justify-between'}>
                        <div className={'flex items-center gap-2'}>
                          <span className={'relative flex h-2.5 w-2.5'}>
                            <span
                              className={
                                'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40'
                              }
                            />
                            <span className={'relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400'} />
                          </span>
                          <span className={'text-sm text-muted-foreground'}>
                            Listening… say anything when you're ready.
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
  );
}
