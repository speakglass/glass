'use client';
import Messages from './Messages';
import Controls from './Controls';
import StartCall from './StartCall';
import CallSummary from './CallSummary';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { useGlass, FeedbackMode, SuggestMode, AISuggestion } from '@/contexts/GlassContext';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Sparkles, MessageCircleMore, ChevronDown, Check, Volume2, X, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils';
import Progress from '@/components/ui/progress';

function SuggestionBubble({
  suggestion,
  onClose,
  durationSec,
}: {
  suggestion: AISuggestion;
  onClose: () => void;
  durationSec: number;
}) {
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
    feedback: 'Feedback',
  } as const;

  const handleSpeak = async () => {
    if (isPlayingThis) {
      stopSpeaking();
      setIsPlayingThis(false);
      return;
    }
    const textToSpeak = suggestion.type === 'feedback' ? suggestion.text : suggestion.target_text;
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
    if (suggestion.type === 'feedback') return;
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
              {suggestion.type === 'feedback' ? (
                <MessageCircleMore className={'size-4 text-primary'} />
              ) : (
                <Sparkles className={'size-4 text-primary'} />
              )}
              <span className={'text-xs font-medium text-muted-foreground'}>{typeLabels[suggestion.type]}</span>
            </div>
            <div className={'flex items-center gap-1'}>
              {suggestion.type !== 'feedback' && (
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
              )}
              <button
                onClick={onClose}
                className={'text-muted-foreground hover:text-foreground transition-colors p-1'}
                aria-label="Close"
              >
                <X className={'size-3.5'} />
              </button>
            </div>
          </div>
          {suggestion.type === 'feedback' ? (
            // Render feedback consistently: structured if available, else plain text
            suggestion.target_text || suggestion.pronunciation ? (
              <div className={'space-y-1.5'}>
                {suggestion.reason_native && (
                  <div className={'text-sm text-foreground'}>{suggestion.reason_native}</div>
                )}
                {suggestion.target_text && (
                  <div className={'text-xs text-muted-foreground'}>
                    <span>{suggestion.target_text}</span>
                  </div>
                )}
                {suggestion.pronunciation && (
                  <div className={'text-sm text-emerald-400 opacity-90'}>{suggestion.pronunciation}</div>
                )}
              </div>
            ) : (
              <p className={'text-sm'}>{suggestion.text}</p>
            )
          ) : (
            <div className={'space-y-1.5'}>
              {'target_text' in suggestion && suggestion.target_text && (
                <div className={'text-sm text-foreground'}>
                  <span className={'text-primary'}>{suggestion.target_text.slice(0, matchedChars)}</span>
                  <span>{suggestion.target_text.slice(matchedChars)}</span>
                </div>
              )}
              {'pronunciation' in suggestion && suggestion.pronunciation && (
                <div className={'text-sm text-emerald-400 opacity-90'}>{suggestion.pronunciation}</div>
              )}
              {'native_translation' in suggestion && suggestion.native_translation && (
                <div className={'text-xs text-muted-foreground'}>{suggestion.native_translation}</div>
              )}
            </div>
          )}
          <div className={'absolute bottom-0 left-0 right-0 h-[2px] bg-border/30'}>
            <div ref={progressRef} className={'h-full bg-primary/40'} style={{ width: '100%' }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function Chat() {
  const ref = useRef<ComponentRef<typeof Messages> | null>(null);
  const {
    status,
    conversationAnalysis,
    showSummary,
    closeSummary,
    startNewCallWithContext,
    requestAnswer,
    requestFollowUp,
    updateFeedbackMode,
    updateSuggestMode,
    settings,
    suggestions,
    addSuggestion,
    removeSuggestion,
    isSpeaking,
  } = useGlass();
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [loadingFollowUp, setLoadingFollowUp] = useState(false);
  const [showManualButtons, setShowManualButtons] = useState(false);
  const manualButtonsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showFeedbackMenu, setShowFeedbackMenu] = useState(false);
  const [showSuggestMenu, setShowSuggestMenu] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const suggestMode: SuggestMode = settings.suggestMode ?? 'auto';
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Fake analysis progress: reach ~95% at 6s, then inch subtly while waiting
  useEffect(() => {
    if (status.value === 'analyzing' && !showSummary) {
      setAnalysisProgress(0);
      const startedAt = Date.now();
      const id = setInterval(() => {
        const elapsedSec = (Date.now() - startedAt) / 1000;
        let p = 0;
        if (elapsedSec <= 6) {
          const t = elapsedSec / 6; // 0..1
          // easeOutCubic towards 95
          p = 95 * (1 - Math.pow(1 - t, 3));
        } else {
          const over = elapsedSec - 6;
          // Slowly creep up to 97 max
          p = 95 + Math.min(2, over * 0.5);
          // Subtle breathing so it doesn't look frozen
          p += 0.5 * Math.sin(Date.now() / 800);
        }
        p = Math.max(0, Math.min(97, p));
        setAnalysisProgress(p);
      }, 120);
      return () => clearInterval(id);
    } else {
      setAnalysisProgress(0);
    }
  }, [status.value, showSummary]);

  // Listening indicator visibility now depends solely on current suggestions being empty

  const feedbackModeLabels = {
    always: 'Always',
    auto: 'Auto',
    off: 'Off',
  };

  const handleAnswer = async () => {
    setLoadingAnswer(true);
    try {
      const suggestion = await requestAnswer();
      addSuggestion('answer', suggestion);
    } catch (e) {
      // no-op
    } finally {
      setLoadingAnswer(false);
    }
  };

  const handleFollowUp = async () => {
    setLoadingFollowUp(true);
    try {
      const suggestion = await requestFollowUp();
      addSuggestion('follow_up', suggestion);
    } catch (e) {
      // no-op
    } finally {
      setLoadingFollowUp(false);
    }
  };

  // Auto-show manual buttons when idle (no suggestions) for 2s; hide on activity
  useEffect(() => {
    const isIdle =
      status.value === 'connected' && suggestions.length === 0 && !isSpeaking && !loadingAnswer && !loadingFollowUp;
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
  }, [status.value, suggestions.length, isSpeaking, loadingAnswer, loadingFollowUp]);

  return (
    <div className={'relative grow flex flex-col mx-auto w-full overflow-hidden h-0 pt-14 pb-28 sm:pb-0'}>
      <Messages ref={ref} />

      {/* BottomPanel: persistent suggestions + controls */}
      {status.value === 'connected' && (
        <div className={'mx-auto w-full'}>
          <div className={'max-w-2xl mx-auto w-full px-4'}>
            <div className={'border-t border-border/30 pt-3 pb-3'}>
              <div className={'flex flex-wrap items-center gap-2 md:gap-3 mb-3'}>
                {/* Left group: action buttons (auto suggest reveal) */}
                <AnimatePresence>
                  {showManualButtons && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className={'flex items-center gap-2'}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAnswer}
                        disabled={loadingAnswer || loadingFollowUp}
                        className={'text-xs h-7 px-3 cursor-pointer whitespace-nowrap'}
                      >
                        {loadingAnswer ? (
                          <Loader2 className={'size-3 mr-1 animate-spin'} />
                        ) : (
                          <MessageCircleMore className={'size-3 mr-1'} />
                        )}
                        Suggest a reply
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFollowUp}
                        disabled={loadingAnswer || loadingFollowUp}
                        className={'text-xs h-7 px-3 cursor-pointer whitespace-nowrap'}
                      >
                        {loadingFollowUp ? (
                          <Loader2 className={'size-3 mr-1 animate-spin'} />
                        ) : (
                          <Sparkles className={'size-3 mr-1'} />
                        )}
                        Suggest follow-up
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Right group: Suggest + Feedback */}
                <div className={'flex items-center gap-2 ml-auto w-full md:w-auto justify-end md:justify-start'}>
                  {/* Mobile: single Options button to configure Suggest/Feedback */}
                  <div className={'relative md:hidden'}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                      className={'text-xs h-7 px-3 cursor-pointer gap-1.5 whitespace-nowrap'}
                    >
                      <SlidersHorizontal className={'size-3.5'} />
                      <span>Options</span>
                      <ChevronDown className={'size-3 ml-0.5 opacity-50'} />
                    </Button>

                    <AnimatePresence>
                      {showOptionsMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className={'absolute right-0 top-full mt-1 w-56 bg-card border border-border/50 rounded-lg shadow-lg overflow-hidden z-50'}
                        >
                          <div className={'py-1'}>
                            <div className={'px-3 py-1.5 text-[11px] uppercase tracking-wide opacity-60'}>Suggest</div>
                            {(['always', 'auto', 'off'] as FeedbackMode[]).map((mode) => (
                              <button
                                key={`sug-${mode}`}
                                onClick={() => {
                                  updateSuggestMode(mode);
                                  setShowOptionsMenu(false);
                                }}
                                className={cn(
                                  'w-full px-3 py-2 text-xs text-left hover:bg-accent/50 transition-colors flex items-center justify-between',
                                  suggestMode === mode && 'bg-accent/30'
                                )}
                              >
                                <span>{feedbackModeLabels[mode]}</span>
                                {suggestMode === mode && <Check className={'size-3'} />}
                              </button>
                            ))}
                            <div className={'px-3 py-1.5 text-[11px] uppercase tracking-wide opacity-60 border-t border-border/50'}>
                              Feedback
                            </div>
                            {(['always', 'auto', 'off'] as FeedbackMode[]).map((mode) => (
                              <button
                                key={`fb-${mode}`}
                                onClick={() => {
                                  updateFeedbackMode(mode);
                                  setShowOptionsMenu(false);
                                }}
                                className={cn(
                                  'w-full px-3 py-2 text-xs text-left hover:bg-accent/50 transition-colors flex items-center justify-between',
                                  settings.feedbackMode === mode && 'bg-accent/30'
                                )}
                              >
                                <span>{feedbackModeLabels[mode]}</span>
                                {settings.feedbackMode === mode && <Check className={'size-3'} />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Desktop: separate Suggest and Feedback controls */}
                  {/* Suggest Mode Selector */}
                  <div className={'relative hidden md:block'}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSuggestMenu(!showSuggestMenu)}
                      className={'text-xs h-7 px-3 cursor-pointer gap-1'}
                    >
                      <span className={'opacity-70'}>Suggest:</span>
                      <span>{feedbackModeLabels[suggestMode]}</span>
                      <ChevronDown className={'size-3 ml-0.5 opacity-50'} />
                    </Button>

                    <AnimatePresence>
                      {showSuggestMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className={
                            'absolute left-0 top-full mt-1 w-40 bg-card border border-border/50 rounded-lg shadow-lg overflow-hidden z-50'
                          }
                        >
                          <div className={'py-1'}>
                            {(['always', 'auto', 'off'] as FeedbackMode[]).map((mode) => (
                              <button
                                key={mode}
                                onClick={() => {
                                  updateSuggestMode(mode);
                                  setShowSuggestMenu(false);
                                }}
                                className={cn(
                                  'w-full px-3 py-2 text-xs text-left hover:bg-accent/50 transition-colors flex items-center justify-between',
                                  suggestMode === mode && 'bg-accent/30'
                                )}
                              >
                                <span>{feedbackModeLabels[mode]}</span>
                                {suggestMode === mode && <Check className={'size-3'} />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Feedback Mode Selector */}
                  <div className={'relative hidden md:block'}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFeedbackMenu(!showFeedbackMenu)}
                      className={'text-xs h-7 px-3 cursor-pointer gap-1'}
                    >
                      <span className={'opacity-70'}>Feedback:</span>
                      <span>{feedbackModeLabels[settings.feedbackMode]}</span>
                      <ChevronDown className={'size-3 ml-0.5 opacity-50'} />
                    </Button>

                    <AnimatePresence>
                      {showFeedbackMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className={
                            'absolute right-0 top-full mt-1 w-40 bg-card border border-border/50 rounded-lg shadow-lg overflow-hidden z-50'
                          }
                        >
                          <div className={'py-1'}>
                            {(['always', 'auto', 'off'] as FeedbackMode[]).map((mode) => (
                              <button
                                key={mode}
                                onClick={() => {
                                  updateFeedbackMode(mode);
                                  setShowFeedbackMenu(false);
                                }}
                                className={cn(
                                  'w-full px-3 py-2 text-xs text-left hover:bg-accent/50 transition-colors flex items-center justify-between',
                                  settings.feedbackMode === mode && 'bg-accent/30'
                                )}
                              >
                                <span>{feedbackModeLabels[mode]}</span>
                                {settings.feedbackMode === mode && <Check className={'size-3'} />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className={'flex items-start gap-3 min-h-[160px] md:min-h-[220px] max-h-[40vh] md:max-h-[320px]'}>
                {/* Avatar */}
                <div className={'shrink-0'}>
                  <div className={'size-10 rounded-full overflow-hidden bg-card/80 border border-border/50'}>
                    <img src="/glass-ai.png" alt="Glass AI" className={'w-full h-full object-cover'} />
                  </div>
                </div>

                {/* Content area with internal scroll */}
                <div className={'flex-1 space-y-3 overflow-y-auto pr-1'}>
                  <AnimatePresence mode="popLayout">
                    {suggestions.length > 0 ? (
                      suggestions.map((s) => (
                        <SuggestionBubble
                          key={s.id}
                          suggestion={s}
                          onClose={() => removeSuggestion(s.id)}
                          durationSec={settings.suggestionDurationSec ?? 10}
                        />
                      ))
                    ) : (
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
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
                                Listening… say anything when you’re ready.
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
      )}

      <Controls />
      <StartCall />

      {/* Analyzing Loading Screen */}
      <AnimatePresence>
        {status.value === 'analyzing' && !showSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={'fixed inset-0 z-100 flex items-center justify-center bg-background/95 backdrop-blur-md'}
          >
            <div className={'flex flex-col items-center gap-6'}>
              <div className={'relative'}>
                <div className={'absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse'}></div>
                <Loader2 className={'size-16 text-primary animate-spin relative'} />
              </div>
              <div className={'text-center space-y-2'}>
                <h3 className={'text-2xl font-semibold'}>Analyzing Conversation</h3>
                <p className={'text-sm text-muted-foreground'}>Generating insights and feedback...</p>
              </div>
              <div className={'w-[70%] max-w-md'}>
                <Progress value={analysisProgress} />
                <div className={'mt-2 text-xs text-muted-foreground text-center'}>{Math.round(analysisProgress)}%</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call Summary */}
      <AnimatePresence>
        {showSummary && conversationAnalysis && (
          <CallSummary
            sessionId={conversationAnalysis.sessionId}
            scores={conversationAnalysis.scores}
            extractedInfo={conversationAnalysis.extractedInfo}
            feedback={conversationAnalysis.feedback}
            messages={conversationAnalysis.messages}
            feedbackItems={conversationAnalysis.feedbackItems}
            onClose={closeSummary}
            onStartNewCall={startNewCallWithContext}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
