'use client';
import { cn } from '@/utils';
import { useGlass, Message, FeedbackMode, SuggestMode } from '@/contexts/GlassContext';
import { AnimatePresence, motion } from 'motion/react';
import { ComponentRef, forwardRef, useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, MessageCircleMore, X, Loader2, ChevronDown, Check, Volume2 } from 'lucide-react';

interface AISuggestion {
  id: string;
  type: 'answer' | 'follow_up' | 'feedback';
  // For 'answer' and 'follow_up'
  target_text?: string;
  native_translation?: string;
  pronunciation?: string;
  // For 'feedback' legacy
  text?: string;
  timestamp: number;
}

interface SuggestionBubbleProps {
  suggestion: AISuggestion;
  onClose: () => void;
  durationSec: number;
}

const SuggestionBubble = ({ suggestion, onClose, durationSec }: SuggestionBubbleProps) => {
  const { speakText, isSpeaking, stopSpeaking } = useGlass();
  const [isPlayingThis, setIsPlayingThis] = useState(false);

  const typeLabels = {
    answer: 'Suggested Answer',
    follow_up: 'Follow-up Suggestion',
    feedback: 'Feedback',
  };

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
        // Reset when audio ends (handled by GlassContext)
        const checkInterval = setInterval(() => {
          if (!isSpeaking) {
            setIsPlayingThis(false);
            clearInterval(checkInterval);
          }
        }, 100);
      } catch (error) {
        console.error('Failed to speak text:', error);
        setIsPlayingThis(false);
      }
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      {/* Suggestion Bubble */}
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
          {suggestion.type === 'feedback' ? (
            <p className={'text-sm'}>{suggestion.text}</p>
          ) : (
            <div className={'space-y-1.5'}>
              {suggestion.target_text && <div className={'text-sm text-foreground'}>{suggestion.target_text}</div>}
              {suggestion.pronunciation && (
                <div className={'text-sm text-emerald-400 opacity-90'}>{suggestion.pronunciation}</div>
              )}
              {suggestion.native_translation && (
                <div className={'text-xs text-muted-foreground'}>{suggestion.native_translation}</div>
              )}
            </div>
          )}

          {/* Timer progress bar at the bottom */}
          <div className={'absolute bottom-0 left-0 right-0 h-[2px] bg-border/30'}>
            <motion.div
              className={'h-full bg-primary/40'}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: durationSec, ease: 'linear' }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const Messages = forwardRef<ComponentRef<typeof motion.div>, Record<never, never>>(function Messages(_, ref) {
  const voice = useGlass();
  const {
    messages,
    requestAnswer,
    requestFollowUp,
    status,
    setOnAISuggestion,
    settings,
    updateFeedbackMode,
    updateSuggestMode,
  } = voice;
  const suggestMode: SuggestMode = settings.suggestMode ?? 'auto';
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [loadingFollowUp, setLoadingFollowUp] = useState(false);
  const [showFeedbackMenu, setShowFeedbackMenu] = useState(false);
  const [showSuggestMenu, setShowSuggestMenu] = useState(false);
  const feedbackMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const lastMessageCountRef = useRef(messages.length);

  const addSuggestion = useCallback(
    (type: 'answer' | 'follow_up' | 'feedback', payload: any) => {
      const base: AISuggestion = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        timestamp: Date.now(),
      };
      const sug: AISuggestion =
        type === 'feedback'
          ? { ...base, text: String(payload || '') }
          : {
              ...base,
              target_text: String(payload?.target_text || ''),
              native_translation: payload?.native_translation ? String(payload.native_translation) : undefined,
              pronunciation: payload?.pronunciation ? String(payload.pronunciation) : undefined,
            };
      setSuggestions((prev) => [...prev, sug]);

      // Auto-remove after configured duration
      const durationMs = Math.max(1, settings.suggestionDurationSec ?? 10) * 1000;
      setTimeout(() => {
        setSuggestions((prev) => prev.filter((s) => s.id !== base.id));
      }, durationMs);
    },
    [settings.suggestionDurationSec]
  );

  const removeSuggestion = (id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  };

  // Handle clicking outside feedback menu to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (feedbackMenuRef.current && !feedbackMenuRef.current.contains(event.target as Node)) {
        setShowFeedbackMenu(false);
      }
    };

    if (showFeedbackMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFeedbackMenu]);

  // Register callback with GlassContext
  useEffect(() => {
    setOnAISuggestion(addSuggestion);
  }, [setOnAISuggestion, addSuggestion]);

  // Check if user is near the bottom of the scroll container
  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return false;

    const threshold = 150; // pixels from bottom to consider "near bottom"
    const isNear = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setIsNearBottom(isNear);
    return isNear;
  }, []);

  // Scroll to bottom function
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }, []);

  // Handle scroll events to track if user is near bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      checkIfNearBottom();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [checkIfNearBottom]);

  // Auto-scroll when new messages arrive (only if user is near bottom)
  useEffect(() => {
    const currentMessageCount = messages.length;
    const hadNewMessage = currentMessageCount > lastMessageCountRef.current;

    if (hadNewMessage && isNearBottom) {
      // Small delay to allow DOM to update
      setTimeout(() => {
        scrollToBottom('smooth');
      }, 100);
    }

    lastMessageCountRef.current = currentMessageCount;
  }, [messages.length, isNearBottom, scrollToBottom]);

  // Initial scroll to bottom on mount
  useEffect(() => {
    scrollToBottom('auto');
  }, [scrollToBottom]);

  const handleAnswer = async () => {
    setLoadingAnswer(true);
    try {
      const suggestion = await requestAnswer();
      addSuggestion('answer', suggestion);
    } catch (error) {
      console.error('Failed to get answer:', error);
    } finally {
      setLoadingAnswer(false);
    }
  };

  const handleFollowUp = async () => {
    setLoadingFollowUp(true);
    try {
      const suggestion = await requestFollowUp();
      addSuggestion('follow_up', suggestion);
    } catch (error) {
      console.error('Failed to get follow-up:', error);
    } finally {
      setLoadingFollowUp(false);
    }
  };

  const handleFeedbackModeChange = (mode: FeedbackMode) => {
    updateFeedbackMode(mode);
    setShowFeedbackMenu(false);
  };

  const feedbackModeLabels = {
    always: 'Always',
    auto: 'Auto',
    off: 'Off',
  };

  return (
    <motion.div layoutScroll className={'grow overflow-auto p-4 pt-16'} ref={scrollContainerRef}>
      <motion.div className={'max-w-2xl mx-auto w-full flex flex-col gap-4 pb-24'}>
        {/* AI Suggestion Panel - Only show when connected */}
        {status.value === 'connected' && (
          <div
            className={
              'sticky top-0 z-20 pb-6 bg-background backdrop-blur-md border-b border-border/30 -mx-4 px-4 pt-4 -mt-4'
            }
          >
            <div
              className={
                'pointer-events-none absolute inset-x-0 -top-4 h-8 bg-gradient-to-b from-background via-background to-background/0'
              }
            />
            {/* Show avatar only when there are suggestions */}
            {suggestions.length > 0 && (
              <div className={'mb-4 flex items-start gap-3'}>
                {/* Glass AI Avatar - shown once at the top */}
                <div className={'shrink-0'}>
                  <div className={'size-10 rounded-full overflow-hidden bg-card/80 border border-border/50'}>
                    <img src="/glass-ai.png" alt="Glass AI" className={'w-full h-full object-cover'} />
                  </div>
                </div>

                {/* Suggestion bubbles stack vertically */}
                <div className={'flex-1 space-y-3'}>
                  <AnimatePresence mode="popLayout">
                    {suggestions.map((suggestion) => (
                      <SuggestionBubble
                        key={suggestion.id}
                        suggestion={suggestion}
                        onClose={() => removeSuggestion(suggestion.id)}
                        durationSec={settings.suggestionDurationSec ?? 10}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            <div className={'flex items-center pt-2'}>
              {/* Left group: action buttons */}
              <div className={'flex items-center gap-2'}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAnswer}
                  disabled={loadingAnswer || loadingFollowUp}
                  className={'text-xs h-7 px-3 cursor-pointer'}
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
                  className={'text-xs h-7 px-3 cursor-pointer'}
                >
                  {loadingFollowUp ? (
                    <Loader2 className={'size-3 mr-1 animate-spin'} />
                  ) : (
                    <Sparkles className={'size-3 mr-1'} />
                  )}
                  Suggest follow-up
                </Button>
              </div>

              {/* Right group: Suggest + Feedback */}
              <div className={'flex items-center gap-2 ml-auto'}>
                {/* Suggest Mode Selector */}
                <div className={'relative'}>
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
                <div className={'relative'} ref={feedbackMenuRef}>
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
                              onClick={() => handleFeedbackModeChange(mode)}
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
                        <div className={'border-t border-border/30 px-3 py-2 text-[10px] text-muted-foreground'}>
                          <div className={'space-y-0.5'}>
                            {settings.feedbackMode === 'always' && <p>Feedback on every message</p>}
                            {settings.feedbackMode === 'auto' && <p>AI decides when feedback is needed</p>}
                            {settings.feedbackMode === 'off' && <p>No automatic feedback</p>}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <AnimatePresence mode={'popLayout'}>
          {[...messages]
            .sort((a, b) => {
              // Sort by start time if available, otherwise by receivedAt
              const startA = a.start ?? Number.MAX_SAFE_INTEGER;
              const startB = b.start ?? Number.MAX_SAFE_INTEGER;
              if (startA !== startB) return startA - startB;
              return a.receivedAt.getTime() - b.receivedAt.getTime();
            })
            .map((msg: Message) => {
              if (msg.type === 'user_message' || msg.type === 'partner_message') {
                return (
                  <motion.div
                    key={msg.utteranceId ?? `${msg.type}-${msg.message.role}-${msg.receivedAt.getTime()}`}
                    className={cn(
                      'w-[80%]',
                      'bg-card',
                      'border border-border rounded-xl',
                      msg.type === 'user_message' ? 'ml-auto' : ''
                    )}
                    initial={{
                      opacity: 0,
                      y: 10,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                    }}
                    exit={{
                      opacity: 0,
                      y: 0,
                    }}
                  >
                    <div className={'flex items-center justify-between pt-4 px-3'}>
                      <div className={cn('text-xs capitalize font-medium leading-none opacity-50 tracking-tight')}>
                        {msg.message.role}
                      </div>
                      <div className={cn('text-xs capitalize font-medium leading-none opacity-50 tracking-tight')}>
                        {msg.receivedAt.toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                          second: undefined,
                        })}
                      </div>
                    </div>
                    <div className={'pb-3 px-3 space-y-2'}>
                      {/* Committed content + ephemeral partial (no animation) */}
                      <span>
                        {msg.partial
                          ? `${msg.message.content ? msg.message.content + ' ' : ''}${msg.partial}`
                          : msg.message.content}
                      </span>
                      {msg.translation && (
                        <div className={'text-sm opacity-70 pt-1'}>
                          <span>{msg.translation}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              }

              return null;
            })}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
});

export default Messages;
