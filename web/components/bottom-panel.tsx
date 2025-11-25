'use client';
import { useState, useRef, useEffect, forwardRef } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
  useGlass,
  AISuggestion,
  AIFeedback,
  FeedbackMode,
  SuggestMode,
  SuggestionLengthMode,
} from '@/contexts/glass-context';
import { SparkleGlyph } from '@/components/sparkle-glyph';
import { needsPronunciationSupport } from '@/types/learning-level';
import { LiveHighlightedText } from '@/components/live-highlighted-text';

type SuggestionBubbleProps = {
  suggestion: AISuggestion;
  onClose: () => void;
  durationSec: number | null; // null = no time limit
  contentOpacity?: number; // Opacity for content only (not border/background)
  pronunciationEnabled: boolean;
};

const SuggestionBubble = forwardRef<HTMLDivElement, SuggestionBubbleProps>(
  (
    {
      suggestion,
      onClose,
      durationSec: _durationIgnored,
      contentOpacity = 1,
      pronunciationEnabled,
    },
    ref
  ) => {
    const {
      speakText,
      isSpeaking,
      stopSpeaking,
      pauseSuggestionTimer,
      resumeSuggestionTimer,
      ttsHighlight,
    } = useGlass();
    const [isPlayingThis, setIsPlayingThis] = useState(false);
    const [showPronLoading, setShowPronLoading] = useState(false);
    const activeHighlight =
      ttsHighlight?.context === 'suggestion' &&
      ttsHighlight.targetId === suggestion.id
        ? ttsHighlight
        : null;

    const typeLabel = t`Suggested Answer`;

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
          await speakText(textToSpeak, {
            context: 'suggestion',
            targetId: suggestion.id,
          });
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

    // Subtle pronunciation loading shimmer (appears only if it takes > ~220ms)
    useEffect(() => {
      if (!pronunciationEnabled) {
        setShowPronLoading(false);
        return;
      }
      if (suggestion?.target_text && !suggestion?.pronunciation) {
        const t = setTimeout(() => setShowPronLoading(true), 220);
        return () => clearTimeout(t);
      }
      setShowPronLoading(false);
    }, [
      suggestion?.target_text,
      suggestion?.pronunciation,
      pronunciationEnabled,
    ]);

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
          <div
            className={
              'p-3 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden sm:p-4'
            }
          >
            <div style={{ opacity: contentOpacity }}>
              <div
                className={
                  'flex items-start justify-between gap-1.5 mb-1.5 sm:gap-2 sm:mb-2'
                }
              >
                <div className={'flex items-center gap-1.5 sm:gap-2'}>
                  <Sparkles className={'size-3.5 text-primary sm:size-4'} />
                  <span className={'text-xs font-medium text-muted-foreground'}>
                    {typeLabel}
                  </span>
                </div>
                <div className={'flex items-center gap-0.5 sm:gap-1'}>
                  <button
                    onClick={handleSpeak}
                    className={cn(
                      'text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-accent/50 sm:p-1',
                      isPlayingThis && 'text-primary'
                    )}
                    aria-label="Speak"
                  >
                    <Volume2
                      className={cn(
                        'size-3',
                        isPlayingThis && 'animate-pulse',
                        'sm:size-3.5'
                      )}
                    />
                  </button>
                  <button
                    onClick={onClose}
                    className={
                      'text-muted-foreground hover:text-foreground transition-colors p-0.5 sm:p-1'
                    }
                    aria-label="Close"
                  >
                    <X className={'size-3 sm:size-3.5'} />
                  </button>
                </div>
              </div>
              <div className={'space-y-1.5'}>
                {suggestion.target_text && (
                  <LiveHighlightedText
                    text={suggestion.target_text}
                    highlight={activeHighlight}
                    className={'text-sm text-foreground block'}
                  />
                )}
                {suggestion.pronunciation && (
                  <div className={'text-sm text-sky-600 opacity-80'}>
                    {suggestion.pronunciation}
                  </div>
                )}
                {pronunciationEnabled &&
                  !suggestion.pronunciation &&
                  showPronLoading && (
                    <div
                      className={'h-3 w-24 rounded bg-sky-400/10 animate-pulse'}
                    />
                  )}
                {suggestion.native_translation && (
                  <div className={'text-sm text-muted-foreground'}>
                    {suggestion.native_translation}
                  </div>
                )}
              </div>
            </div>
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
  (
    { feedback, onClose, durationSec: _durationIgnored, contentOpacity = 1 },
    ref
  ) => {
    const { pauseFeedbackTimer, resumeFeedbackTimer } = useGlass();

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
          <div
            className={
              'p-3 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden sm:p-4'
            }
          >
            <div style={{ opacity: contentOpacity }}>
              <div
                className={
                  'flex items-start justify-between gap-1.5 mb-1.5 sm:gap-2 sm:mb-2'
                }
              >
                <div className={'flex items-center gap-1.5 sm:gap-2'}>
                  <MessageCircleMore
                    className={'size-3.5 text-primary sm:size-4'}
                  />
                  <span className={'text-xs font-medium text-muted-foreground'}>
                    <Trans>Feedback</Trans>
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className={
                    'text-muted-foreground hover:text-foreground transition-colors p-0.5 sm:p-1'
                  }
                  aria-label="Close"
                >
                  <X className={'size-3 sm:size-3.5'} />
                </button>
              </div>
              <div className={'space-y-1 sm:space-y-1.5'}>
                {feedback.reason_native && (
                  <div className={'text-sm text-foreground'}>
                    {feedback.reason_native}
                  </div>
                )}
                {feedback.target_text && (
                  <div className={'text-sm text-muted-foreground'}>
                    {feedback.target_text}
                  </div>
                )}
                {feedback.pronunciation && (
                  <div className={'text-sm text-sky-600 opacity-80'}>
                    {feedback.pronunciation}
                  </div>
                )}
                {!feedback.target_text &&
                  !feedback.pronunciation &&
                  feedback.text && <p className={'text-sm'}>{feedback.text}</p>}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }
);

FeedbackBubble.displayName = 'FeedbackBubble';

export default function BottomPanel() {
  const {
    requestSuggestion,
    updateFeedbackMode,
    updateSuggestMode,
    updateSuggestionLengthMode,
    settings,
    suggestions,
    feedbacks,
    addSuggestion,
    removeSuggestion,
    removeFeedback,
    isSpeaking,
  } = useGlass();

  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [hintInput, setHintInput] = useState('');
  const [loadingHint, setLoadingHint] = useState(false);
  const [showManualButtons, setShowManualButtons] = useState(false);
  const manualButtonsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const hintInputRef = useRef<HTMLInputElement>(null);
  const [hintFocused, setHintFocused] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  const suggestMode: SuggestMode = settings.suggestMode ?? 'auto';
  const suggestionLengthMode: SuggestionLengthMode =
    settings.suggestionLengthMode ?? 'auto';
  const [isMobile, setIsMobile] = useState(false);
  const pronunciationEnabled = needsPronunciationSupport(
    settings.languageLevel
  );

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Get language-specific placeholder for the suggestion hint input
  const getHintPlaceholder = (short: boolean = false) => {
    const nativeLang = settings.languages.nativeLang.toLowerCase();
    const langNames: Record<string, string> = {
      ja: t`Japanese`,
      ko: t`Korean`,
      es: t`Spanish`,
      fr: t`French`,
      en: t`English`,
    };
    const nativeLangName = langNames[nativeLang] || 'your language';
    // Mobile: short version, Desktop: full version
    return short
      ? t`What do you want to say...`
      : t`Type what you want to say in ${nativeLangName}`;
  };

  const feedbackModeLabels = {
    always: t`Always`,
    auto: t`Auto`,
    off: t`Off`,
  };

  const suggestionLengthModeLabels = {
    short: t`Short`,
    auto: t`Auto`,
    long: t`Long`,
  };

  const handleSuggestion = async () => {
    setLoadingSuggestion(true);
    try {
      const suggestion = await requestSuggestion();
      addSuggestion(suggestion);
    } catch (e) {
      // no-op
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const handleHintSubmit = async () => {
    if (loadingHint) return;

    setLoadingHint(true);
    try {
      const result = await requestSuggestion(hintInput.trim() || undefined);
      addSuggestion(result);
      setHintInput('');
    } catch (e) {
      // no-op
    } finally {
      setLoadingHint(false);
    }
  };

  const handleHintKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleHintSubmit();
    }
  };

  const hasHintInput = hintInput.trim().length > 0;
  const shouldShowEnter = hintFocused && hasHintInput && !loadingHint;
  const showButtonLabel = !shouldShowEnter && isButtonHovered;

  // Auto-show manual buttons when idle (no suggestions/feedbacks) for 2s; hide on activity
  useEffect(() => {
    const isIdle =
      suggestions.length === 0 &&
      feedbacks.length === 0 &&
      !isSpeaking &&
      !loadingSuggestion;
    if (isIdle) {
      if (manualButtonsTimerRef.current)
        clearTimeout(manualButtonsTimerRef.current);
      manualButtonsTimerRef.current = setTimeout(
        () => setShowManualButtons(true),
        2000
      );
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
  }, [suggestions.length, feedbacks.length, isSpeaking, loadingSuggestion]);

  return (
    <div className={'mx-auto w-full min-h-[50vh]'}>
      <div
        className={
          'max-w-2xl mx-auto w-full px-4 h-full flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-none'
        }
      >
        <div
          id="glass-suggestion-section"
          className={
            'border-t h-full border-border/30 pt-2.5 pb-2.5 shrink-0 sm:pt-3 sm:pb-3'
          }
        >
          <div className={'flex items-center gap-1.5 mb-2 md:gap-3 sm:mb-3'}>
            {/* Suggestion hint input - always visible, grows to fill space */}
            <div className={'relative flex-1 min-w-0'}>
              <Languages
                className={
                  'absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none z-10 sm:left-3 sm:size-4'
                }
              />
              <Input
                ref={hintInputRef}
                type="text"
                value={hintInput}
                onChange={(e) => setHintInput(e.target.value)}
                onFocus={() => setHintFocused(true)}
                onBlur={() => setHintFocused(false)}
                onKeyDown={handleHintKeyDown}
                placeholder={getHintPlaceholder(isMobile)}
                className={
                  'h-9 pl-8 pr-16 text-sm placeholder:text-sm w-full bg-muted sm:h-10 sm:pl-9 sm:pr-20'
                }
              />
              <button
                type="button"
                onClick={handleHintSubmit}
                onMouseEnter={() => setIsButtonHovered(true)}
                onMouseLeave={() => setIsButtonHovered(false)}
                disabled={loadingHint}
                className={cn(
                  'absolute right-1.5 top-1/2 -translate-y-1/2 flex h-6 items-center rounded-md bg-primary px-1.5 text-primary-foreground group-hover:px-3.5 transition-all duration-300 cursor-pointer group overflow-hidden shadow-md hover:shadow-lg active:scale-95 sm:right-2 sm:h-7 sm:px-2',
                  loadingHint && 'cursor-not-allowed opacity-70'
                )}
              >
                <>
                  {loadingHint ? (
                    <Loader2 className={'size-3 animate-spin sm:size-3.5'} />
                  ) : (
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
                  )}
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
              </button>
            </div>

            {/* Right group: Settings */}
            <div className={'flex items-center gap-2 shrink-0'}>
              {/* Unified Options button for both mobile and desktop */}
              <div className={'relative'}>
                <Button
                  id="glass-settings-button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                  className={'h-9 w-9 p-0 cursor-pointer sm:h-10 sm:w-10'}
                >
                  <SlidersHorizontal className={'size-3 sm:size-3.5'} />
                </Button>

                <AnimatePresence>
                  {showOptionsMenu && (
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
                            {(['always', 'auto', 'off'] as SuggestMode[]).map(
                              (mode) => (
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
                              )
                            )}
                          </div>
                        </div>

                        {/* Feedback Mode */}
                        <div>
                          <div
                            className={
                              'text-[11px] font-medium text-muted-foreground mb-2'
                            }
                          >
                            <Trans>Feedback</Trans>
                          </div>
                          <div
                            className={
                              'inline-flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5 w-full'
                            }
                          >
                            {(['always', 'auto', 'off'] as FeedbackMode[]).map(
                              (mode) => (
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
                              )
                            )}
                          </div>
                        </div>

                        {/* Suggestion Length */}
                        <div>
                          <div
                            className={
                              'text-[11px] font-medium text-muted-foreground mb-2'
                            }
                          >
                            <Trans>Sentence length</Trans>
                          </div>
                          <div
                            className={
                              'inline-flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5 w-full'
                            }
                          >
                            {(
                              [
                                'short',
                                'auto',
                                'long',
                              ] as SuggestionLengthMode[]
                            ).map((mode) => (
                              <button
                                key={`len-${mode}`}
                                type="button"
                                onClick={() => updateSuggestionLengthMode(mode)}
                                className={cn(
                                  'inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-xs font-medium transition-colors flex-1',
                                  suggestionLengthMode === mode
                                    ? 'bg-accent text-accent-foreground'
                                    : 'hover:bg-accent/60 text-muted-foreground'
                                )}
                              >
                                {suggestionLengthModeLabels[mode]}
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

          <div
            id="glass-ai-panel"
            data-tour="suggestions"
            className={
              'flex items-start gap-2 sm:gap-3 pt-2 pb-12 flex-1 min-h-0 h-full overflow-y-auto sm:overflow-visible'
            }
          >
            {/* Avatar */}
            <div className={'shrink-0 relative pt-1'}>
              <div
                className={
                  'size-8 rounded-full overflow-hidden bg-card/80 border border-border/50 sm:size-10'
                }
              >
                <img
                  src="/glass-ai.png"
                  alt="Glass AI"
                  className={'w-full h-full object-cover'}
                />
              </div>
              {/* Message count badge */}
              {suggestions.length + feedbacks.length > 1 && (
                <div
                  className={
                    'absolute -top-1 -right-1 bg-gray-700 text-white text-[10px] font-semibold rounded-full w-3.5 h-3.5 flex items-center justify-center sm:w-4 sm:h-4'
                  }
                >
                  {suggestions.length + feedbacks.length}
                </div>
              )}
            </div>

            {/* Content area */}
            <div className={'flex-1 space-y-2 pr-1 sm:space-y-3'}>
              <AnimatePresence mode="popLayout">
                {suggestions.length > 0 || feedbacks.length > 0 ? (
                  <div className={'relative'}>
                    {/* Merge and sort all AI messages by timestamp (oldest on top, newest at bottom) */}
                    {(() => {
                      const allItems = [
                        ...suggestions.map((s) => ({
                          type: 'suggestion' as const,
                          data: s,
                          timestamp: s.timestamp,
                        })),
                        ...feedbacks.map((f) => ({
                          type: 'feedback' as const,
                          data: f,
                          timestamp: f.timestamp,
                        })),
                      ].sort((a, b) => b.timestamp - a.timestamp);

                      return (
                        <>
                          {allItems.map((item, index, arr) => {
                            const stackIndex = arr.length - 1 - index; // Reverse: first item (most recent) = highest stack, last (oldest) = 0 (top)
                            const maxVisible = 3; // Show max 3 cards in stack
                            const isVisible = stackIndex < maxVisible;
                            // Stack visibility - uniform spacing
                            const baseOffset = 28; // Uniform spacing
                            const offset =
                              Math.min(stackIndex, maxVisible - 1) * baseOffset;
                            // Gentler scale difference for uniform look
                            const baseScale =
                              1 - Math.min(stackIndex, maxVisible - 1) * 0.06;
                            const scale = baseScale;
                            const zIndex = arr.length - stackIndex; // Higher z-index for top cards
                            const isTop = stackIndex === 0; // First card is the top one

                            // iOS-style opacity - card stays visible but content fades
                            const contentOpacity =
                              stackIndex === 0
                                ? 1
                                : stackIndex === 1
                                ? 0.2
                                : 0.1;

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
                                    marginBottom: `${
                                      (maxVisible - 1) * baseOffset
                                    }px`,
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
                                <motion.div
                                  key={item.data.id}
                                  {...wrapperProps}
                                >
                                  <SuggestionBubble
                                    suggestion={item.data}
                                    onClose={() =>
                                      removeSuggestion(item.data.id)
                                    }
                                    durationSec={
                                      settings.aiMessageDurationSec ?? null
                                    }
                                    contentOpacity={contentOpacity}
                                    pronunciationEnabled={pronunciationEnabled}
                                  />
                                </motion.div>
                              );
                            } else {
                              return (
                                <motion.div
                                  key={item.data.id}
                                  {...wrapperProps}
                                >
                                  <FeedbackBubble
                                    feedback={item.data}
                                    onClose={() => removeFeedback(item.data.id)}
                                    durationSec={
                                      settings.aiMessageDurationSec ?? null
                                    }
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
                  <motion.div
                    key={'listening-fallback'}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div
                      className={
                        'p-3 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl sm:p-4'
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
                              Listening… say anything when you're ready.
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
  );
}
