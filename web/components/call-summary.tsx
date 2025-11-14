'use client';
import { cn } from '@/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect } from 'react';
import { X, Save, ChevronDown, ChevronUp, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useAccountSession } from '@/contexts/account-session-context';
import { fetchConversationZepContext, ZepContextItem } from '@/lib/account-api';

interface ConversationScores {
  fluency: number;
  accuracy: number;
  comprehensibility: number;
}

interface ExtractedInfo {
  label: string;
  value: string;
  editable: boolean;
}

interface Message {
  speaker: string;
  source: string;
  text: string;
  utterance_id?: string;
  translation?: string;
}

interface FeedbackItem {
  utterance_id: string;
  text: string;
}

type ThreadContextItem = ZepContextItem;

interface CallSummaryProps {
  conversationId?: string; // DB conversation ID for fetching Zep memories
  scores: ConversationScores;
  extractedInfo?: ExtractedInfo[];
  feedback?: string;
  messages?: Message[];
  feedbackItems?: FeedbackItem[];
  onClose: () => void;
  onStartNewCall: (contextInfo: ExtractedInfo[]) => void;
  memoryCountOverride?: number;
  conversationCountOverride?: number;
  initialShowMemory?: boolean; // For onboarding: pre-open Memory section
}

const CallSummary = ({
  conversationId,
  scores,
  extractedInfo: initialInfo = [],
  feedback = '',
  messages = [],
  feedbackItems = [],
  onClose,
  onStartNewCall,
  memoryCountOverride,
  conversationCountOverride,
  initialShowMemory = false,
}: CallSummaryProps) => {
  const { token } = useAccountSession();
  const [threadContextItems, setThreadContextItems] = useState<ThreadContextItem[]>([]);
  const [rawThreadContext, setRawThreadContext] = useState('');
  const [isLoadingThreadContext, setIsLoadingThreadContext] = useState(false);
  const [threadContextError, setThreadContextError] = useState<string | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [showMemory, setShowMemory] = useState(initialShowMemory);

  // Create a map of utterance_id to feedback
  const feedbackMap = useMemo(() => {
    const map = new Map<string, string[]>();
    feedbackItems.forEach((fb) => {
      if (fb.utterance_id) {
        if (!map.has(fb.utterance_id)) {
          map.set(fb.utterance_id, []);
        }
        map.get(fb.utterance_id)!.push(fb.text);
      }
    });
    return map;
  }, [feedbackItems]);

  // Fetch Zep thread context when conversationId is available
  useEffect(() => {
    if (!conversationId || !token) {
      setThreadContextItems([]);
      setRawThreadContext('');
      return;
    }

    let canceled = false;
    setIsLoadingThreadContext(true);
    setThreadContextError(null);

    const fetchContext = async () => {
      try {
        const response = await fetchConversationZepContext(token, conversationId);
        if (canceled) return;
        setThreadContextItems(response.items || []);
        setRawThreadContext(response.rawContext || '');
      } catch (error) {
        console.error('[CallSummary] Failed to fetch Zep thread context:', error);
        if (!canceled) {
          setThreadContextItems([]);
          setRawThreadContext('');
          setThreadContextError(t`Unable to load context from Zep.`);
        }
      } finally {
        if (!canceled) {
          setIsLoadingThreadContext(false);
        }
      }
    };

    fetchContext();

    return () => {
      canceled = true;
    };
  }, [conversationId, token]);

  const handleSaveCall = () => {
    onStartNewCall(initialInfo);
  };

  const contextBadgeClass = (type: ThreadContextItem['type']) => {
    switch (type) {
      case 'fact':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'entity':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/30';
      case 'episode':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      default:
        return 'bg-slate-500/10 text-slate-500 border-slate-500/30';
    }
  };

  const averageScore = Math.round((scores.fluency + scores.accuracy + scores.comprehensibility) / 3);

  const getScoreLabel = (score: number): { text: string; color: string } => {
    if (score >= 80) return { text: t`Excellent`, color: 'text-emerald-500' };
    if (score >= 60) return { text: t`Good`, color: 'text-teal-500' };
    if (score >= 40) return { text: t`Average`, color: 'text-amber-500' };
    if (score >= 20) return { text: t`Below Average`, color: 'text-orange-500' };
    return { text: t`Low`, color: 'text-red-500' };
  };

  // Calculate indicator position based on flex ratios
  const getIndicatorPosition = (score: number): number => {
    const flexRatios = [0.5, 1, 2, 1, 0.5]; // flex values for each segment
    const totalFlex = flexRatios.reduce((sum, flex) => sum + flex, 0); // 5

    // Determine which segment the score falls into
    let segmentIndex = 0;
    let segmentStart = 0;

    if (score <= 20) {
      segmentIndex = 0;
      segmentStart = 0;
    } else if (score <= 40) {
      segmentIndex = 1;
      segmentStart = 20;
    } else if (score <= 60) {
      segmentIndex = 2;
      segmentStart = 40;
    } else if (score <= 80) {
      segmentIndex = 3;
      segmentStart = 60;
    } else {
      segmentIndex = 4;
      segmentStart = 80;
    }

    // Calculate the start position of this segment
    const flexBeforeSegment = flexRatios.slice(0, segmentIndex).reduce((sum, flex) => sum + flex, 0);
    const segmentStartPercent = (flexBeforeSegment / totalFlex) * 100;

    // Calculate position within the segment
    const segmentSize = 20; // each segment represents 20 points
    const positionInSegment = (score - segmentStart) / segmentSize;
    const segmentWidthPercent = (flexRatios[segmentIndex] / totalFlex) * 100;

    return segmentStartPercent + segmentWidthPercent * positionInSegment;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={'fixed inset-0 z-50 flex items-center justify-center p-4'}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <motion.div
        id="glass-call-summary"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={
          'relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-card border border-border/50 rounded-2xl shadow-2xl'
        }
      >
        {/* Header */}
        <div className={'sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border/30 px-6 py-4'}>
          <div id="glass-call-summary-header" className={'flex items-center justify-between'}>
            <h2 className={'text-xl font-bold'}>
              <Trans>Call Summary</Trans>
            </h2>
            <button
              onClick={onClose}
              className={
                'text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-accent/50'
              }
              aria-label="Close"
            >
              <X className={'size-5'} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={'p-6 space-y-6'}>
          {/* Scores and Feedback Container */}
          <div id="glass-scores-feedback" className="space-y-6">
            {/* Score Overview */}
            <section>
              <div className={'flex items-center justify-between mb-6'}>
                <div>
                  <span className={'text-sm font-medium text-muted-foreground block mb-1'}>
                    <Trans>Overall Score</Trans>
                  </span>
                  <span className={'text-4xl font-bold'}>{averageScore}</span>
                </div>

                {/* Bar Graph Gauge */}
                <div className={'flex items-end gap-1 h-12'}>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                    const scorePercent = averageScore / 100;
                    const segmentThreshold = i / 8;
                    const isActive = scorePercent > segmentThreshold;

                    // Height increases to the right
                    const heights = [25, 35, 45, 55, 65, 75, 85, 95];
                    const height = heights[i];

                    // Color based on position
                    let color = 'rgb(239, 68, 68)'; // red
                    if (i >= 6) color = 'rgb(16, 185, 129)'; // emerald
                    else if (i >= 5) color = 'rgb(20, 184, 166)'; // teal
                    else if (i >= 3) color = 'rgb(245, 158, 11)'; // amber
                    else if (i >= 2) color = 'rgb(251, 146, 60)'; // orange

                    return (
                      <motion.div
                        key={i}
                        className={'w-2 rounded-full'}
                        style={{
                          height: `${height}%`,
                          backgroundColor: isActive ? color : 'rgba(100, 116, 139, 0.2)',
                        }}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: `${height}%`, opacity: 1 }}
                        transition={{
                          duration: 0.4,
                          delay: i * 0.04,
                          ease: 'easeOut',
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Segmented gauges */}
              <div className={'space-y-2'}>
                {/* Fluency */}
                <div>
                  <div className={'flex items-center justify-between mb-1.5'}>
                    <span className={'text-xs text-muted-foreground'}>
                      <Trans>Fluency</Trans>
                    </span>
                    <span className={cn('text-sm font-medium', getScoreLabel(scores.fluency).color)}>
                      {getScoreLabel(scores.fluency).text}
                    </span>
                  </div>
                  <div className={'relative'}>
                    <div className={'flex gap-1 h-2'}>
                      {/* 0-20: Low (red) - narrowest */}
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.fluency > 0 && scores.fluency <= 20 ? 'bg-red-500' : 'bg-red-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                      />
                      {/* 20-40: Below Average (orange) */}
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.fluency > 20 && scores.fluency <= 40 ? 'bg-orange-500' : 'bg-orange-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.15 }}
                      />
                      {/* 40-60: Average (amber) - widest */}
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.fluency > 40 && scores.fluency <= 60 ? 'bg-amber-500' : 'bg-amber-500/30'
                        )}
                        style={{ flex: 2 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                      />
                      {/* 60-80: Good (teal) */}
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.fluency > 60 && scores.fluency <= 80 ? 'bg-teal-500' : 'bg-teal-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.25 }}
                      />
                      {/* 80-100: Excellent (emerald) - narrowest */}
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.fluency > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                      />
                    </div>
                    {/* Current position indicator */}
                    <motion.div
                      className={'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full'}
                      style={{
                        left: `${getIndicatorPosition(scores.fluency)}%`,
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.5 }}
                    />
                  </div>
                </div>

                {/* Accuracy */}
                <div>
                  <div className={'flex items-center justify-between mb-1.5'}>
                    <span className={'text-xs text-muted-foreground'}>
                      <Trans>Accuracy</Trans>
                    </span>
                    <span className={cn('text-sm font-medium', getScoreLabel(scores.accuracy).color)}>
                      {getScoreLabel(scores.accuracy).text}
                    </span>
                  </div>
                  <div className={'relative'}>
                    <div className={'flex gap-1 h-2'}>
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.accuracy > 0 && scores.accuracy <= 20 ? 'bg-red-500' : 'bg-red-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.35 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.accuracy > 20 && scores.accuracy <= 40 ? 'bg-orange-500' : 'bg-orange-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.4 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.accuracy > 40 && scores.accuracy <= 60 ? 'bg-amber-500' : 'bg-amber-500/30'
                        )}
                        style={{ flex: 2 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.45 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.accuracy > 60 && scores.accuracy <= 80 ? 'bg-teal-500' : 'bg-teal-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.5 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.accuracy > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.55 }}
                      />
                    </div>
                    {/* Current position indicator */}
                    <motion.div
                      className={'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full'}
                      style={{
                        left: `${getIndicatorPosition(scores.accuracy)}%`,
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.6 }}
                    />
                  </div>
                </div>

                {/* Comprehensibility */}
                <div>
                  <div className={'flex items-center justify-between mb-1.5'}>
                    <span className={'text-xs text-muted-foreground'}>
                      <Trans>Comprehensibility</Trans>
                    </span>
                    <span className={cn('text-sm font-medium', getScoreLabel(scores.comprehensibility).color)}>
                      {getScoreLabel(scores.comprehensibility).text}
                    </span>
                  </div>
                  <div className={'relative'}>
                    <div className={'flex gap-1 h-2'}>
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.comprehensibility > 0 && scores.comprehensibility <= 20
                            ? 'bg-red-500'
                            : 'bg-red-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.6 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.comprehensibility > 20 && scores.comprehensibility <= 40
                            ? 'bg-orange-500'
                            : 'bg-orange-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.65 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.comprehensibility > 40 && scores.comprehensibility <= 60
                            ? 'bg-amber-500'
                            : 'bg-amber-500/30'
                        )}
                        style={{ flex: 2 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.7 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.comprehensibility > 60 && scores.comprehensibility <= 80
                            ? 'bg-teal-500'
                            : 'bg-teal-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.75 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.comprehensibility > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.8 }}
                      />
                    </div>
                    {/* Current position indicator */}
                    <motion.div
                      className={'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full'}
                      style={{
                        left: `${getIndicatorPosition(scores.comprehensibility)}%`,
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.85 }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Feedback with Glass AI Avatar */}
            {feedback && (
              <section>
                <div className={'inline-flex items-start gap-3 max-w-2xl'}>
                  {/* Glass AI Avatar */}
                  <div className={'shrink-0'}>
                    <div className={'size-10 rounded-full overflow-hidden bg-card/80 border border-border/50'}>
                      <img src="/glass-ai.png" alt="Glass AI" className={'w-full h-full object-cover'} />
                    </div>
                  </div>

                  {/* Feedback Bubble */}
                  <div className={'bg-background/50 border border-border/30 rounded-xl p-4 flex-1'}>
                    <p className={'text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed'}>{feedback}</p>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Memory / Context */}
          <section id="glass-memory-section">
            <button
              onClick={() => setShowMemory(!showMemory)}
              className={
                'w-full flex items-center justify-between bg-background/50 border border-border/30 rounded-lg p-3 hover:bg-accent/30 transition-colors'
              }
            >
              <div className={'flex items-center gap-2'}>
                <Save className={'size-4'} />
                <span className={'text-sm font-semibold'}>
                  <Trans>Memory</Trans>
                </span>
                {isLoadingThreadContext ? (
                  <Loader2 className={'size-3 animate-spin text-muted-foreground'} />
                ) : (
                  <span className={'text-xs text-muted-foreground'}>
                    ({typeof memoryCountOverride === 'number' ? memoryCountOverride : threadContextItems.length})
                  </span>
                )}
              </div>
              {showMemory ? <ChevronUp className={'size-4'} /> : <ChevronDown className={'size-4'} />}
            </button>

            <AnimatePresence>
              {showMemory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className={'overflow-hidden'}
                >
                  <div
                    className={
                      'mt-2 bg-background/50 border border-border/30 rounded-lg p-3 max-h-96 overflow-auto space-y-2'
                    }
                  >
                    {isLoadingThreadContext ? (
                      <div className={'text-center py-8 text-muted-foreground text-sm animate-pulse'}>
                        <Trans>Fetching thread context...</Trans>
                      </div>
                    ) : threadContextItems.length > 0 ? (
                      <div className={'space-y-2'}>
                        {threadContextItems.map((item, index) => (
                          <div
                            key={`${item.type}-${item.label ?? 'item'}-${index}`}
                            className={
                              'flex items-start gap-3 rounded-xl border border-border/20 bg-background/60 px-3 py-2'
                            }
                          >
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0',
                                contextBadgeClass(item.type)
                              )}
                            >
                              {(item.label || item.type).charAt(0).toUpperCase() + (item.label || item.type).slice(1)}
                            </span>
                            <p className={'text-sm text-foreground leading-relaxed'}>{item.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : threadContextError ? (
                      <div className={'text-center py-6 text-xs text-red-500'}>{threadContextError}</div>
                    ) : rawThreadContext ? (
                      <pre
                        className={
                          'text-xs font-mono whitespace-pre-wrap leading-relaxed text-muted-foreground bg-background/30 rounded-lg p-3'
                        }
                      >
                        {rawThreadContext}
                      </pre>
                    ) : (
                      <div className={'text-center py-6 text-xs text-muted-foreground'}>
                        <Trans>No context available yet</Trans>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Collapsible: Conversation History with Feedback */}
          <section>
            <button
              onClick={() => setShowConversation(!showConversation)}
              className={
                'w-full flex items-center justify-between bg-background/50 border border-border/30 rounded-lg p-3 hover:bg-accent/30 transition-colors'
              }
            >
              <div className={'flex items-center gap-2'}>
                <MessageSquare className={'size-4'} />
                <span className={'text-sm font-semibold'}>
                  <Trans>Conversation History</Trans>
                </span>
                <span className={'text-xs text-muted-foreground'}>
                  ({typeof conversationCountOverride === 'number' ? conversationCountOverride : messages.length})
                </span>
              </div>
              {showConversation ? <ChevronUp className={'size-4'} /> : <ChevronDown className={'size-4'} />}
            </button>
            <AnimatePresence>
              {showConversation && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className={'overflow-hidden'}
                >
                  <div
                    className={
                      'mt-2 bg-background/50 border border-border/30 rounded-lg p-3 max-h-96 overflow-auto space-y-3'
                    }
                  >
                    {messages.length > 0 ? (
                      messages
                        .filter((msg) => msg.speaker !== 'glass') // Filter out Glass messages (shown as inline feedback)
                        .map((msg, index) => {
                          const messageFeedback = msg.utterance_id ? feedbackMap.get(msg.utterance_id) : null;
                          const isUser = msg.speaker === 'user';

                          // Find Glass feedback for this message from messages array
                          const glassFeedbackFromMessages = messages.filter(
                            (m) => m.speaker === 'glass' && m.utterance_id === msg.utterance_id
                          );

                          const displayName = isUser ? (
                            <Trans>You</Trans>
                          ) : msg.speaker === 'ai' ? (
                            <Trans>Partner</Trans>
                          ) : (
                            <Trans>Partner</Trans>
                          );

                          return (
                            <div key={index} className={'space-y-1.5'}>
                              {/* Message */}
                              <div className={cn('pb-2', isUser && 'flex flex-col items-end')}>
                                <div className={'text-xs text-muted-foreground mb-0.5'}>{displayName}</div>
                                <div
                                  className={cn(
                                    'text-sm',
                                    isUser ? 'bg-primary/10 rounded-lg px-3 py-2 max-w-[80%]' : ''
                                  )}
                                >
                                  {msg.text}
                                  {msg.translation && (
                                    <div className={'text-xs text-muted-foreground mt-1 italic'}>{msg.translation}</div>
                                  )}

                                  {/* Glass feedback inside user bubble */}
                                  {isUser && glassFeedbackFromMessages.length > 0 && (
                                    <div className={'mt-2 pt-2 border-t border-primary/20 space-y-1'}>
                                      {glassFeedbackFromMessages.map((gf, gfIndex) => (
                                        <div key={gfIndex} className={'text-xs text-sky-600 leading-relaxed'}>
                                          {gf.text}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Legacy Feedback for this message (from feedbackItems) */}
                              {messageFeedback && messageFeedback.length > 0 && (
                                <div className={cn('ml-4 space-y-1', isUser && 'ml-0 flex flex-col items-end')}>
                                  {messageFeedback.map((fb, fbIndex) => (
                                    <div key={fbIndex} className={'text-xs text-sky-600 leading-relaxed'}>
                                      {fb}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                    ) : (
                      <div className={'text-center py-4 text-sm text-muted-foreground'}>
                        <Trans>No messages</Trans>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* Footer Actions */}
        <div className={'sticky bottom-0 bg-card/95 backdrop-blur-md border-t border-border/30 px-6 py-4'}>
          <div className={'flex items-center justify-between gap-3'}>
            <Button variant="outline" onClick={onClose} size="sm" className={'flex-1'}>
              <Trans>Close</Trans>
            </Button>
            <Button onClick={handleSaveCall} size="sm" className={'flex-1 bg-primary hover:bg-primary/90'}>
              <Save className={'size-4 mr-2'} />
              <Trans>Save Call</Trans>
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CallSummary;
