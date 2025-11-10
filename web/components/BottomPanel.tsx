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
  durationSec: number;
};

const SuggestionBubble = forwardRef<HTMLDivElement, SuggestionBubbleProps>(
  ({ suggestion, onClose, durationSec }, ref) => {
    const {
      speakText,
      isSpeaking,
      stopSpeaking,
      messages,
      pauseSuggestionTimer,
      resumeSuggestionTimer,
      getSuggestionRemainingMs,
    } = useGlass();
    const [isPlayingThis, setIsPlayingThis] = useState(false);
    const [matchedChars, setMatchedChars] = useState(0);
    const maxMatchedRef = useRef(0);
    const progressRef = useRef<HTMLDivElement | null>(null);

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

    // --- Karaoke matching --------------------------------------------------
    const normalizeToken = (t: string) => t.toLowerCase().replace(/[\.,!?;:\()"'`]/g, '');
    const tokenizeWithIndex = (text: string) => {
      const tokens: { token: string; start: number; end: number }[] = [];
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        tokens.push({ token: m[0], start: m.index, end: m.index + m[0].length });
      }
      return tokens;
    };
    const lev1 = (a: string, b: string) => {
      if (a === b) return 0;
      if (Math.abs(a.length - b.length) > 1) return 2;
      // simple O(n) for small tokens: only allow <=1 edits
      let i = 0,
        j = 0,
        edits = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
          i++;
          j++;
        } else {
          edits++;
          if (edits > 1) return 2;
          if (a.length > b.length) i++;
          else if (b.length > a.length) j++;
          else {
            i++;
            j++;
          }
        }
      }
      if (i < a.length || j < b.length) edits++;
      return edits;
    };
    const similar = (a: string, b: string) => {
      const na = normalizeToken(a);
      const nb = normalizeToken(b);
      if (!na || !nb) return false;
      if (na === nb) return true;
      if ((na.length >= 3 && nb.includes(na)) || (nb.length >= 3 && na.includes(nb))) return true;
      return Math.max(na.length, nb.length) >= 4 && lev1(na, nb) <= 1;
    };

    useEffect(() => {
      const text = suggestion.target_text || '';
      if (!text) return;
      const sugTokens = tokenizeWithIndex(text);
      if (sugTokens.length === 0) return;

      // Find latest user partial or final content
      let spoken = '';
      for (let k = messages.length - 1; k >= 0; k--) {
        const msg = messages[k];
        if (msg.message.role === 'user') {
          spoken = (msg.partial && msg.partial.trim()) || msg.message.content || '';
          if (spoken) break;
        }
      }
      if (!spoken) return;
      const speakTokens = tokenizeWithIndex(spoken);
      let j = 0;
      let lastMatchEndIndex = 0;
      for (let i = 0; i < sugTokens.length; i++) {
        let matched = false;
        for (; j < speakTokens.length; j++) {
          if (similar(sugTokens[i].token, speakTokens[j].token)) {
            matched = true;
            lastMatchEndIndex = sugTokens[i].end; // end index within original suggestion text
            j++;
            break;
          }
        }
        if (!matched) break;
      }
      if (lastMatchEndIndex > maxMatchedRef.current) {
        maxMatchedRef.current = lastMatchEndIndex;
        setMatchedChars(lastMatchEndIndex);
        // If fully matched, close immediately
        if (lastMatchEndIndex >= text.length) {
          onClose();
        }
      }
    }, [messages, suggestion, onClose]);

    // Smooth visual countdown via requestAnimationFrame (no React state churn)
    useEffect(() => {
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
              {suggestion.target_text && (
                <div className={'text-sm text-foreground'}>
                  <span className={'text-primary'}>{suggestion.target_text.slice(0, matchedChars)}</span>
                  <span>{suggestion.target_text.slice(matchedChars)}</span>
                </div>
              )}
              {suggestion.pronunciation && (
                <div className={'text-sm text-emerald-400 opacity-90'}>{suggestion.pronunciation}</div>
              )}
              {suggestion.native_translation && (
                <div className={'text-xs text-muted-foreground'}>{suggestion.native_translation}</div>
              )}
            </div>
            <div className={'absolute bottom-0 left-0 right-0 h-[2px] bg-border/30'}>
              <div ref={progressRef} className={'h-full bg-primary/40'} style={{ width: '100%' }} />
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
  durationSec: number;
};

const FeedbackBubble = forwardRef<HTMLDivElement, FeedbackBubbleProps>(({ feedback, onClose, durationSec }, ref) => {
  const { pauseFeedbackTimer, resumeFeedbackTimer, getFeedbackRemainingMs } = useGlass();
  const progressRef = useRef<HTMLDivElement | null>(null);

  // Smooth visual countdown
  useEffect(() => {
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
              <div className={'text-sm text-emerald-400 opacity-90'}>{feedback.pronunciation}</div>
            )}
            {!feedback.target_text && !feedback.pronunciation && feedback.text && (
              <p className={'text-sm'}>{feedback.text}</p>
            )}
          </div>
          <div className={'absolute bottom-0 left-0 right-0 h-[2px] bg-border/30'}>
            <div ref={progressRef} className={'h-full bg-primary/40'} style={{ width: '100%' }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
});

FeedbackBubble.displayName = 'FeedbackBubble';

type TranslationBubbleProps = {
  translation: AITranslation;
  onClose: () => void;
  durationSec: number;
};

const TranslationBubble = forwardRef<HTMLDivElement, TranslationBubbleProps>(
  ({ translation, onClose, durationSec }, ref) => {
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
                <div className={'text-sm text-emerald-400 opacity-90'}>{translation.pronunciation}</div>
              )}
              {translation.native_translation && (
                <div className={'text-xs text-muted-foreground'}>{translation.native_translation}</div>
              )}
            </div>
            <div className={'absolute bottom-0 left-0 right-0 h-[2px] bg-border/30'}>
              <div ref={progressRef} className={'h-full bg-primary/40'} style={{ width: '100%' }} />
            </div>
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
    <div className={'mx-auto w-full'}>
      <div className={'max-w-2xl mx-auto w-full px-4'}>
        <div id="glass-translate-section" className={'border-t border-border/30 pt-3 pb-3'}>
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
                      <Sparkles className={'size-3.5 mr-1.5'} />
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

          <div
            id="glass-ai-panel"
            className={'flex items-start gap-3 min-h-[160px] md:min-h-[220px] max-h-[40vh] md:max-h-[320px]'}
          >
            {/* Avatar */}
            <div className={'shrink-0'}>
              <div className={'size-10 rounded-full overflow-hidden bg-card/80 border border-border/50'}>
                <img src="/glass-ai.png" alt="Glass AI" className={'w-full h-full object-cover'} />
              </div>
            </div>

            {/* Content area with internal scroll */}
            <div className={'flex-1 space-y-3 overflow-y-auto pr-1'}>
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
                                  <div className={'text-sm text-emerald-400 opacity-90'}>
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
                                  <div className={'text-sm text-emerald-400 opacity-90'}>
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
                  <>
                    {suggestions.map((s) => (
                      <SuggestionBubble
                        key={s.id}
                        suggestion={s}
                        onClose={() => removeSuggestion(s.id)}
                        durationSec={settings.suggestionDurationSec ?? 20}
                      />
                    ))}
                    {feedbacks.map((f) => (
                      <FeedbackBubble
                        key={f.id}
                        feedback={f}
                        onClose={() => removeFeedback(f.id)}
                        durationSec={settings.suggestionDurationSec ?? 20}
                      />
                    ))}
                    {translations.map((t) => (
                      <TranslationBubble
                        key={t.id}
                        translation={t}
                        onClose={() => removeTranslation(t.id)}
                        durationSec={settings.suggestionDurationSec ?? 20}
                      />
                    ))}
                  </>
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
